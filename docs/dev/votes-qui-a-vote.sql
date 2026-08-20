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
-- À lancer sur DEV d'abord, puis sur PROD — et à faire suivre, chaque fois, de
-- `votes-qui-a-vote-test.sql`, qui est la seule vraie preuve (cf. SECTION 2).
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
-- SECTION 2 — LA MESURE EST DANS UN AUTRE FICHIER : `votes-qui-a-vote-test.sql`.
--
-- Le contrôle ci-dessus dit que la policy EXISTE et sur quelles fonctions elle
-- s'accroche. Il ne dit pas qu'elle s'EXÉCUTE. `permission denied` ne se
-- déclenche qu'au moment d'évaluer la condition sur une ligne réelle : sur une
-- table sans vote, une policy cassée passe le test en vert — c'est arrivé sur
-- DEV le 21/08, et c'est ce qui avait laissé passer la panne du 20/08.
--
-- Enchaîner impérativement avec `votes-qui-a-vote-test.sql`, qui pose un vote
-- le temps de la mesure (et fabrique même un sondage s'il n'en existe aucun),
-- relit sous l'identité d'un vrai compte, puis remet tout en état.
-- ----------------------------------------------------------------------------
