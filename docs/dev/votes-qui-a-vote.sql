-- ============================================================================
-- « Qui a voté quoi » : l'auteur d'un sondage, et toute personne ayant déjà
-- voté, peuvent ouvrir la liste des votants regroupés par option.
--
-- L'app lit cette liste directement dans `votes`. La RLS y impose déjà que la
-- main soit visible (`private.post_visible`, posé au lot 2) — rien à ajouter de
-- ce côté.
--
-- CE QUI MANQUE, et que ce script pose : ne pas lister un compte bloqué (dans
-- les deux sens) ni un compte banni. C'est exactement la règle déjà en place
-- sur `likes` et `comment_likes` (cf. `likes-qui-a-aime.sql`) ; sans elle ici,
-- un compte que l'app masque partout ailleurs réapparaîtrait dans la liste des
-- votants — avec son pseudo et sa photo.
--
-- ⚠️ `private.` ET NON `public.` — la première version du script des likes a
-- cassé le feed en PROD (« permission denied for function is_banned »). Les
-- fonctions ont été déplacées vers `private` au lot 1, et F-06 a recréé dans
-- `public` des relais dont l'exécution est RÉVOQUÉE pour `authenticated`. Les
-- policies écrites AVANT le déplacement marchent toujours parce qu'une policy
-- retient l'OID de la fonction : leur code source affiché ment. Le recopier
-- dans une policy neuve l'accroche au relais interdit.
--
-- DIFFÉRENCE AVEC LES LIKES, à connaître avant de lancer : `posts.like_count`
-- est une COLONNE tenue par un trigger, que la RLS ne touche pas — un compteur
-- de likes reste donc identique pour tout le monde. Les résultats d'un sondage,
-- eux, sont AGRÉGÉS depuis `votes` dans la vue (`jsonb_object_agg`), qui est en
-- `security_invoker`. Cette policy fait donc aussi disparaître le vote d'un
-- compte bloqué DES RÉSULTATS de celui qui l'a bloqué. C'est voulu et
-- cohérent — bloquer quelqu'un, c'est cesser de compter son avis — mais cela
-- signifie que deux personnes peuvent lire deux totaux différents.
--
-- À lancer sur DEV d'abord (avec la SECTION 2), puis sur PROD.
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Re-jouable (drop/create de la policy).
-- ============================================================================

drop policy if exists "votes moderation and blocks" on public.votes;
create policy "votes moderation and blocks" on public.votes as restrictive for select
  using (
    not private.is_blocked_pair(auth.uid(), user_id)
    and not private.is_banned(user_id)
  );

-- ----------------------------------------------------------------------------
-- SECTION 1 — la policy existe, en RESTRICTIVE, sur le seul SELECT, et elle
-- appelle bien les fonctions PRIVÉES.
-- ----------------------------------------------------------------------------
select c.relname                       as table_name,
       p.polname                       as policy,
       case p.polpermissive when false then 'RESTRICTIVE' else 'PERMISSIVE (⚠️)' end as type,
       p.polcmd                        as commande,
       -- Le schéma réellement appelé, que `pg_get_expr` masque (il affiche le nom nu si le schéma
       -- est dans le search_path) : c'est LUI qui doit dire `private`.
       (select string_agg(distinct n.nspname || '.' || f.proname, ', ')
          from pg_depend d
          join pg_proc f on f.oid = d.refobjid
          join pg_namespace n on n.oid = f.pronamespace
         where d.objid = p.oid and d.refclassid = 'pg_proc'::regclass) as fonctions_appelees
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'votes'
  and p.polname = 'votes moderation and blocks'
order by p.polname;


-- ----------------------------------------------------------------------------
-- SECTION 2 — MESURE, sous l'identité d'un vrai utilisateur.
--
-- Une requête lancée normalement dans l'éditeur tourne en `postgres` : elle
-- contourne toutes les policies et ne prouve RIEN. Et un « 0 ligne lue » ne
-- prouve rien non plus — `permission denied` ne se déclenche qu'au moment
-- d'évaluer la condition SUR UNE LIGNE. D'où le vote de test posé ci-dessous,
-- sur une main DU COMPTE LUI-MÊME (personne n'est notifié), puis retiré.
--
-- ATTENDU : aucune ligne « ERREUR ». Une seule = ne pas passer en production.
-- ----------------------------------------------------------------------------
drop table if exists _res;
create temp table _res (lecture text, resultat text);

do $$
declare
  v_user uuid;
  v_post uuid;
  v_opt  text;
  v_rel  text;
  v_n    bigint;
  v_out  text;
  v_pose boolean := false;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then
    insert into _res values ('compte impersonné', 'AUCUN PROFIL — test impossible');
    return;
  end if;
  insert into _res values ('compte impersonné', v_user::text);

  -- Un sondage de ce compte, et une option réellement proposée : la policy d'écriture
  -- « votes cible valide » (lot 2, F-10) refuse toute option inventée.
  select p.id, o.value::text
    into v_post, v_opt
    from public.posts p
    cross join lateral jsonb_array_elements_text(p.vote_options) as o(value)
   where p.author_id = v_user
     and p.vote_options is not null
   limit 1;

  if v_post is not null then
    insert into public.votes (post_id, user_id, option) values (v_post, v_user, v_opt)
      on conflict do nothing;
    v_pose := found;
    insert into _res values ('vote de test posé', v_post::text || ' → ' || v_opt);
  else
    insert into _res values ('vote de test posé',
      'AUCUN SONDAGE de ce compte — la lecture ci-dessous peut ne rien mesurer');
  end if;

  -- `posts_ranked` et `posts_feed` sont les deux vues du feed ; elles agrègent `votes` pour les
  -- résultats, d'où la panne en cascade si la policy appelle une fonction interdite.
  foreach v_rel in array array['posts_ranked', 'posts_feed', 'votes'] loop
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      execute format('select count(*) from public.%I', v_rel) into v_n;
      v_out := v_n::text || ' lignes lues';
    exception when others then
      v_out := 'ERREUR — ' || sqlerrm;
    end;
    -- Rendu du rôle avant d'écrire dans la table temporaire (`authenticated` n'a aucun droit
    -- dessus), et pour que le tour suivant reparte propre.
    perform set_config('role', 'postgres', true);
    insert into _res values (v_rel, v_out);
  end loop;

  if v_pose then
    delete from public.votes where post_id = v_post and user_id = v_user;
    insert into _res values ('nettoyage', 'vote de test retiré');
  end if;
end;
$$;

select * from _res;
