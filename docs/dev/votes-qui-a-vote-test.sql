-- ============================================================================
-- MESURE de la policy posée par `votes-qui-a-vote.sql`.
--
-- POURQUOI CE FICHIER : le premier essai sur DEV a renvoyé « 0 lignes lues »
-- sur `votes`, donc n'a RIEN mesuré. `permission denied` ne se déclenche qu'au
-- moment d'évaluer la condition SUR UNE LIGNE : sur une table vide, une policy
-- cassée passe le test en vert. C'est exactement ce qui avait laissé passer la
-- panne du 20/08 (« permission denied for function is_banned »).
--
-- La v1 ne votait que sur un sondage APPARTENANT au compte impersonné, par
-- prudence — pour ne notifier personne. Cette prudence était inutile : il
-- n'existe aucune notification de vote (cf. `NotificationType` côté app —
-- post_like, post_comment, … mais pas de `vote`). Voter ne prévient personne.
-- On prend donc n'importe quel sondage visible.
--
-- Et s'il n'existe AUCUN sondage en base, le script en fabrique un le temps de
-- la mesure : il pose `vote_options` sur une main du compte lui-même, vote,
-- mesure, puis REMET la valeur d'origine. Rien ne subsiste.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ATTENDU : « vote de test posé » renseigné, « votes » ≥ 1 ligne lue, et
-- AUCUNE ligne « ERREUR ». Un « 0 ligne lue » sur `votes` = le test a échoué à
-- mesurer, pas la policy à passer.
-- ============================================================================

drop table if exists _res;
create temp table _res (lecture text, resultat text);

do $$
declare
  v_user      uuid;
  v_post      uuid;
  v_opt       text;
  v_rel       text;
  v_n         bigint;
  v_out       text;
  v_pose      boolean := false;
  v_fabrique  boolean := false;
  v_options0  jsonb;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then
    insert into _res values ('compte impersonné', 'AUCUN PROFIL — test impossible');
    return;
  end if;
  insert into _res values ('compte impersonné', v_user::text);

  -- État des lieux, vu de postgres (donc sans policy) : de quoi lire le résultat ci-dessous.
  select count(*) into v_n from public.posts where vote_options is not null;
  insert into _res values ('sondages en base', v_n::text);
  select count(*) into v_n from public.votes;
  insert into _res values ('votes en base', v_n::text);

  -- N'importe quel sondage fait l'affaire, et une option réellement proposée : la policy
  -- d'écriture « votes cible valide » (lot 2, F-10) refuse toute option inventée.
  select p.id, o.value::text
    into v_post, v_opt
    from public.posts p
    cross join lateral jsonb_array_elements_text(p.vote_options) as o(value)
   where p.vote_options is not null
   order by (p.author_id = v_user) desc  -- les siens d'abord, par simple politesse
   limit 1;

  -- Aucun sondage nulle part : on en fabrique un sur une main du compte, le temps de la mesure.
  if v_post is null then
    select p.id, p.vote_options into v_post, v_options0
      from public.posts p where p.author_id = v_user limit 1;
    if v_post is null then
      insert into _res values ('vote de test posé', 'AUCUNE MAIN de ce compte — test impossible');
      return;
    end if;
    v_opt := 'Call';
    update public.posts set vote_options = '["Call","Fold"]'::jsonb where id = v_post;
    v_fabrique := true;
    insert into _res values ('sondage fabriqué', v_post::text || ' (sera remis en état)');
  end if;

  insert into public.votes (post_id, user_id, option) values (v_post, v_user, v_opt)
    on conflict do nothing;
  v_pose := found;
  insert into _res values ('vote de test posé', v_post::text || ' → ' || v_opt);

  -- `posts_ranked` et `posts_feed` agrègent `votes` pour les résultats du sondage : une policy
  -- qui appelle une fonction interdite y ferait tomber TOUT le feed, pas seulement la liste.
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

  -- Lecture ciblée : les votes DE CETTE MAIN, c'est-à-dire exactement ce que fait
  -- `fetchVoters`. C'est cette requête-là qui doit passer, pas seulement un count global.
  begin
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.votes where post_id = %L', v_post) into v_n;
    v_out := v_n::text || ' ligne(s) — la policy s''est exécutée';
  exception when others then
    v_out := 'ERREUR — ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into _res values ('votes de la main (ce que lit l''app)', v_out);

  if v_pose then
    delete from public.votes where post_id = v_post and user_id = v_user;
    insert into _res values ('nettoyage', 'vote de test retiré');
  end if;
  if v_fabrique then
    update public.posts set vote_options = v_options0 where id = v_post;
    insert into _res values ('nettoyage', 'sondage fabriqué retiré');
  end if;
end;
$$;

select * from _res;
