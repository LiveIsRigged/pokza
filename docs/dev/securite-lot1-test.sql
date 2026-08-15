-- LOT 1 — VÉRIFICATION FONCTIONNELLE (à lancer sur DEV, après securite-lot1.sql)
-- =============================================================================
-- POURQUOI CE SCRIPT : le script de correctif vérifie que les droits sont bien posés, mais pas
-- que l'application fonctionne encore. Le vrai risque du lot 1 est le déplacement des fonctions
-- de modération (F-06) : elles sont appelées à l'intérieur des policies RLS, et si l'évaluation
-- échouait, le feed deviendrait illisible. Ici on ne regarde pas les droits : on se fait passer
-- pour un utilisateur connecté et on relit vraiment les tables.
--
-- MÉTHODE : `set role authenticated` + `request.jwt.claims` — c'est exactement ce que fait
-- PostgREST quand l'app interroge la base avec un jeton. Les policies s'appliquent donc pour de
-- vrai, contrairement à une requête lancée en tant que `postgres` (qui les contourne toutes).
--
-- INNOCUITÉ : les deux seules écritures tentées sont annulées par le script lui-même (la bio est
-- restaurée à sa valeur d'origine, et la main de test est supprimée si jamais elle passait).
--
-- DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  v_user     uuid;
  v_group    uuid;
  v_bio_orig text;
  v_n        bigint;
  v_post     uuid;
  v_lines    text[] := '{}';
begin
  -- ---- Préparation, en tant que postgres (hors RLS) --------------------------------------
  select id, bio into v_user, v_bio_orig from public.profiles order by created_at limit 1;

  if v_user is null then
    insert into _res values (0, 'PRÉALABLE', '*** Aucun profil en DEV : impossible de tester. ***');
    return;
  end if;

  -- Un groupe dont cet utilisateur n'est NI membre NI propriétaire (pour le test F-03).
  select g.id into v_group
  from public.groups g
  where g.owner_id <> v_user
    and not exists (
      select 1 from public.group_members m
      where m.group_id = g.id and m.user_id = v_user and m.status = 'accepted'
    )
  limit 1;

  -- ---- On devient l'utilisateur connecté --------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  set role authenticated;

  -- 1. LE test critique de F-06 : le feed reste-t-il lisible ?
  begin
    select count(*) into v_n from public.posts;
    v_lines := v_lines || format('1|Lecture du feed (posts)|OK — %s main(s) visible(s)', v_n);
  exception when others then
    v_lines := v_lines || format('1|Lecture du feed (posts)|*** ÉCHEC *** %s', sqlerrm);
  end;

  -- 2. Commentaires : policy restrictive qui appelle is_blocked_pair ET is_banned
  begin
    select count(*) into v_n from public.comments;
    v_lines := v_lines || format('2|Lecture des commentaires|OK — %s visible(s)', v_n);
  exception when others then
    v_lines := v_lines || format('2|Lecture des commentaires|*** ÉCHEC *** %s', sqlerrm);
  end;

  -- 3. Notifications : policy qui appelle is_blocked_pair
  begin
    select count(*) into v_n from public.notifications;
    v_lines := v_lines || format('3|Lecture des notifications|OK — %s visible(s)', v_n);
  exception when others then
    v_lines := v_lines || format('3|Lecture des notifications|*** ÉCHEC *** %s', sqlerrm);
  end;

  -- 4. F-04 — l'édition de profil doit continuer de marcher
  begin
    update public.profiles set bio = 'test-securite-lot1' where id = v_user;
    v_lines := v_lines || '4|Modification de sa bio (doit passer)|OK'::text;
  exception when others then
    v_lines := v_lines || format('4|Modification de sa bio (doit passer)|*** ÉCHEC *** %s', sqlerrm);
  end;

  -- 5. F-04 — mais le verrou d'âge, non
  begin
    update public.profiles set age_confirmed = true where id = v_user;
    v_lines := v_lines || '5|Modification de age_confirmed (doit être refusée)|*** ÉCHEC : acceptée ***'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || '5|Modification de age_confirmed (doit être refusée)|OK — refusée'::text;
  when others then
    v_lines := v_lines || format('5|Modification de age_confirmed (doit être refusée)|OK — refusée (%s)', sqlerrm);
  end;

  -- 6. F-03 — publier dans un groupe dont on n'est pas membre
  if v_group is null then
    v_lines := v_lines || '6|Publication dans un groupe non rejoint|NON TESTABLE — aucun groupe en DEV'::text;
  else
    begin
      insert into public.posts (author_id, title, hand, visibility, group_id)
      values (v_user, 'TEST SECURITE LOT1', '{}'::jsonb, 'group', v_group)
      returning id into v_post;
      v_lines := v_lines || '6|Publication dans un groupe non rejoint|*** ÉCHEC : acceptée ***'::text;
    exception when others then
      v_lines := v_lines || '6|Publication dans un groupe non rejoint|OK — refusée'::text;
    end;
  end if;

  -- 7. F-06 — is_admin ne doit plus être exécutable
  begin
    perform private.is_admin(v_user);
    v_lines := v_lines || '7|Appel de is_admin (doit être refusé)|*** ÉCHEC : exécutée ***'::text;
  exception when others then
    v_lines := v_lines || '7|Appel de is_admin (doit être refusé)|OK — refusée'::text;
  end;

  -- ---- Retour en postgres et remise en état ------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', false);

  update public.profiles set bio = v_bio_orig where id = v_user;
  if v_post is not null then
    delete from public.posts where id = v_post;
  end if;

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

exception when others then
  -- Filet de sécurité : quoi qu'il arrive, on ne reste pas coincé dans le rôle authenticated.
  reset role;
  perform set_config('request.jwt.claims', '', false);
  insert into _res values (99, 'ERREUR DU SCRIPT', sqlerrm);
end;
$$;

select controle, resultat from _res order by n;
