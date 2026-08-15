-- LOT 2 — VÉRIFICATION FONCTIONNELLE (DEV uniquement, après securite-lot2.sql)
-- ===========================================================================
-- Ce script monte un vrai scénario de groupe privé, puis se fait passer pour un utilisateur
-- qui n'en est PAS membre, et vérifie ce qu'il voit et ce qu'il peut écrire.
--
-- Il couvre aussi le test F-03 du lot 1 resté « NON TESTABLE » faute de groupe en base.
--
-- ⚠️ DEV UNIQUEMENT — ce script crée un groupe, une main et des votes de test. Tout est
-- supprimé à la fin, y compris si une erreur survient en cours de route. Ne pas lancer en PROD.
--   DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ATTENDU : 10 lignes, toutes en OK. Les lignes 8, 9 et 10 sont les tests de NON-RÉGRESSION —
-- elles vérifient que l'application marche encore, ce qui compte autant que le reste.

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  v_a        uuid;   -- l'intrus : ne fait partie d'aucun groupe
  v_b        uuid;   -- le propriétaire du groupe privé
  v_group    uuid := gen_random_uuid();
  v_priv     uuid := gen_random_uuid();  -- main dans le groupe privé
  v_pub      uuid := gen_random_uuid();  -- main publique avec sondage
  v_n        bigint;
  v_lines    text[] := '{}';
begin
  -- ═══ Préparation, en tant que postgres (hors RLS) ═══════════════════════════════════
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;

  if v_a is null or v_b is null then
    insert into _res values (0, 'PRÉALABLE',
      '*** Il faut au moins 2 profils en DEV pour ce test. ***');
    return;
  end if;

  begin
    -- Un groupe privé appartenant à B, dont A n'est pas membre.
    insert into public.groups (id, name, owner_id) values (v_group, 'TEST-LOT2', v_b);
    insert into public.group_members (group_id, user_id, status, invited_by)
      values (v_group, v_b, 'accepted', v_b);

    -- Une main dans ce groupe, avec un sondage, likée et votée par B.
    insert into public.posts (id, author_id, title, hand, visibility, group_id,
                              vote_question, vote_options)
      values (v_priv, v_b, 'TEST-LOT2 main privee', '{}'::jsonb, 'group', v_group,
              'Call ou fold ?', '["call","fold"]'::jsonb);
    insert into public.likes (post_id, user_id) values (v_priv, v_b);
    insert into public.votes (post_id, user_id, option) values (v_priv, v_b, 'call');

    -- Une main publique avec sondage, pour les tests de non-régression.
    insert into public.posts (id, author_id, title, hand, visibility,
                              vote_question, vote_options)
      values (v_pub, v_b, 'TEST-LOT2 main publique', '{}'::jsonb, 'public',
              'Call ou fold ?', '["call","fold"]'::jsonb);

    -- ═══ On devient A, l'intrus ══════════════════════════════════════════════════════
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_a, 'role', 'authenticated')::text, false);
    set role authenticated;

    -- 1. Rappel : la main privée est bien invisible (déjà le cas avant le lot 2)
    select count(*) into v_n from public.posts where id = v_priv;
    v_lines := v_lines || format('1|La main du groupe prive est invisible|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' visible ***' end);

    -- 2. F-07 — le like posé sur cette main ne doit plus fuiter
    select count(*) into v_n from public.likes where post_id = v_priv;
    v_lines := v_lines || format('2|F-07 le like sur la main privee est invisible|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' lisible ***' end);

    -- 3. F-07 — ni le vote
    select count(*) into v_n from public.votes where post_id = v_priv;
    v_lines := v_lines || format('3|F-07 le vote sur la main privee est invisible|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' lisible ***' end);

    -- 4. F-11 — liker une main qu'on ne voit pas
    begin
      insert into public.likes (post_id, user_id) values (v_priv, v_a);
      v_lines := v_lines || '4|F-11 liker la main privee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '4|F-11 liker la main privee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 5. F-11 — voter sur une main qu'on ne voit pas
    begin
      insert into public.votes (post_id, user_id, option) values (v_priv, v_a, 'call');
      v_lines := v_lines || '5|F-11 voter sur la main privee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '5|F-11 voter sur la main privee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 6. F-10 — voter une option qui n'existe pas, sur une main pourtant visible
    begin
      insert into public.votes (post_id, user_id, option) values (v_pub, v_a, 'option-inventee');
      v_lines := v_lines || '6|F-10 voter une option inventee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '6|F-10 voter une option inventee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 7. F-03 — publier dans le groupe de B (le test resté en suspens au lot 1)
    begin
      insert into public.posts (author_id, title, hand, visibility, group_id)
        values (v_a, 'TEST-LOT2 intrusion', '{}'::jsonb, 'group', v_group);
      v_lines := v_lines || '7|F-03 publier dans le groupe de B (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '7|F-03 publier dans le groupe de B (doit etre refuse)|OK — refuse'::text;
    end;

    -- ═══ NON-RÉGRESSION : ce qui doit continuer de marcher ════════════════════════════

    -- 8. Liker une main publique
    begin
      insert into public.likes (post_id, user_id) values (v_pub, v_a);
      v_lines := v_lines || '8|Liker une main publique (doit passer)|OK'::text;
    exception when others then
      v_lines := v_lines || format('8|Liker une main publique (doit passer)|*** ECHEC *** %s', sqlerrm);
    end;

    -- 9. Voter une option légitime sur une main publique
    begin
      insert into public.votes (post_id, user_id, option) values (v_pub, v_a, 'fold');
      v_lines := v_lines || '9|Voter une option legitime (doit passer)|OK'::text;
    exception when others then
      v_lines := v_lines || format('9|Voter une option legitime (doit passer)|*** ECHEC *** %s', sqlerrm);
    end;

    -- 10. La vue du feed doit toujours répondre, avec le like et le vote de A visibles
    begin
      select count(*) into v_n
      from public.posts_feed
      where id = v_pub and liked_by_me and my_vote = 'fold';
      v_lines := v_lines || format('10|Le feed affiche mon like et mon vote|%s',
        case when v_n = 1 then 'OK' else '*** ECHEC : la vue ne les remonte plus ***' end);
    exception when others then
      v_lines := v_lines || format('10|Le feed affiche mon like et mon vote|*** ECHEC *** %s', sqlerrm);
    end;

  exception when others then
    v_lines := v_lines || format('99|ERREUR DU SCRIPT|%s', sqlerrm);
  end;

  -- ═══ Remise en état — s'exécute quoi qu'il arrive ═════════════════════════════════════
  reset role;
  perform set_config('request.jwt.claims', '', false);

  delete from public.notifications where post_id in (v_priv, v_pub) or group_id = v_group;
  delete from public.votes  where post_id in (v_priv, v_pub);
  delete from public.likes  where post_id in (v_priv, v_pub);
  delete from public.posts  where id in (v_priv, v_pub) or group_id = v_group;
  delete from public.group_members where group_id = v_group;
  delete from public.groups where id = v_group;

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

  -- Contrôle de propreté : plus aucune trace des données de test.
  select count(*) into v_n from public.groups where name = 'TEST-LOT2';
  insert into _res values (11, 'Nettoyage — groupes de test restants',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' ***' end);

  select count(*) into v_n from public.posts where title like 'TEST-LOT2%';
  insert into _res values (12, 'Nettoyage — mains de test restantes',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' ***' end);
end;
$$;

-- Une seule requête finale : l'éditeur SQL n'affiche que le résultat de la dernière.
select controle, resultat from _res order by n;
