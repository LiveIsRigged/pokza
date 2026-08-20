-- ============================================================================
-- TEST des policies posées par `likes-qui-a-aime.sql`.
--
-- POURQUOI CE FICHIER EXISTE : la v1 des policies appelait les relais `public.*`
-- (exécution révoquée pour `authenticated`) au lieu des fonctions `private.*`.
-- Résultat : `permission denied for function is_banned` — et comme le feed lit
-- `likes` pour savoir ce qu'on a aimé, TOUTE la page tombait. Le tableau de
-- contrôle du script principal, lui, était vert : il regardait l'existence des
-- policies, pas leur exécution.
--
-- Ce test relit donc les tables SOUS L'IDENTITÉ d'un vrai utilisateur
-- (`set role authenticated` + `request.jwt.claims`). Une requête lancée
-- normalement dans l'éditeur tourne en `postgres`, contourne toutes les
-- policies, et ne prouverait rien.
--
-- Aucune valeur à remplacer : le script prend lui-même le premier profil venu.
-- Rien n'est écrit (les lectures seules), et le rôle est rendu à chaque tour.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ATTENDU : quatre lignes avec un nombre. UNE SEULE « ERREUR » = ne pas passer
-- en production, c'est la panne d'hier.
--
-- ⚠️ UN « 0 LIGNE LUE » NE PROUVE RIEN. `permission denied` ne se déclenche
-- qu'au moment d'évaluer la condition SUR UNE LIGNE : sur une table vide, la
-- policy cassée passerait le test en vert. C'est arrivé le 20/08 sur DEV, où
-- `likes` était à 0. Si le compte affiche 0, dérouler la SECTION 2 en fin de
-- fichier, qui pose un like le temps de la mesure et le retire ensuite.
-- ============================================================================

drop table if exists _res;
create temp table _res (lecture text, resultat text);

do $$
declare
  v_user uuid;
  v_rel  text;
  v_n    bigint;
  v_out  text;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then
    insert into _res values ('compte impersonné', 'AUCUN PROFIL — test impossible');
    return;
  end if;
  insert into _res values ('compte impersonné', v_user::text);

  -- `posts_ranked` et `posts_feed` sont les deux vues que lit le feed ; elles
  -- touchent `likes` pour `liked_by_me`, d'où la panne en cascade.
  foreach v_rel in array array['posts_ranked', 'posts_feed', 'likes', 'comment_likes'] loop
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      execute format('select count(*) from public.%I', v_rel) into v_n;
      v_out := v_n::text || ' lignes lues';
    exception when others then
      v_out := 'ERREUR — ' || sqlerrm;
    end;
    -- Rendu du rôle avant d'écrire dans la table temporaire (`authenticated`
    -- n'a aucun droit dessus), et pour que le tour suivant reparte propre.
    perform set_config('role', 'postgres', true);
    insert into _res values (v_rel, v_out);
  end loop;
end;
$$;

select * from _res;


-- ============================================================================
-- SECTION 2 — à jouer UNIQUEMENT si la section 1 lit 0 ligne dans `likes`.
-- Pose un like, relit sous l'identité du compte, puis le retire. Le like porte
-- sur une main DU COMPTE LUI-MÊME : personne n'est notifié, aucun push ne part.
-- ============================================================================

drop table if exists _res2;
create temp table _res2 (lecture text, resultat text);

do $$
declare
  v_user uuid;
  v_post uuid;
  v_n    bigint;
  v_out  text;
  v_pose boolean := false;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  insert into _res2 values ('compte impersonné', v_user::text);

  select count(*) into v_n from public.likes;
  insert into _res2 values ('likes en base AVANT (vu de postgres)', v_n::text);

  select p.id into v_post from public.posts p where p.author_id = v_user limit 1;
  if v_post is null then
    select p.id into v_post from public.posts p limit 1;
    insert into _res2 values ('⚠️ avertissement', 'aucune main de ce compte : le like va notifier son auteur');
  end if;

  insert into public.likes (post_id, user_id) values (v_post, v_user) on conflict do nothing;
  v_pose := found;
  insert into _res2 values ('like de test posé', coalesce(v_post::text, 'AUCUNE MAIN — test impossible'));

  begin
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.likes;
    v_out := v_n::text || ' ligne(s) lue(s) — la policy s''est exécutée';
  exception when others then
    v_out := 'ERREUR — ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into _res2 values ('likes lus SOUS L''IDENTITÉ du compte', v_out);

  if v_pose then
    delete from public.likes where post_id = v_post and user_id = v_user;
    insert into _res2 values ('nettoyage', 'like de test retiré');
  end if;
end;
$$;

select * from _res2;
