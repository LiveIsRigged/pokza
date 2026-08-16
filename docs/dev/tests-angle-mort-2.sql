-- ANGLE MORT MULTI-COMPTES — 2/2 : groupes de bout en bout et notifications
-- =========================================================================
-- ⚠️ DEV UNIQUEMENT. Le script refuse de tourner ailleurs.
-- ⚠️ Lancer en mode « WITHOUT RLS » : le script endosse lui-même le rôle `authenticated`.
-- Éditeur DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- Le volet 1 (13/13) a confirmé la mécanique : impersonation, bascule de rôle, sous-blocs
-- d'exception. Celui-ci va plus loin — il crée un groupe, des likes et un commentaire, parce qu'il
-- n'y en a AUCUN en base et qu'on ne peut donc rien prouver sans en fabriquer.
--
-- CE QU'IL COUVRE, ET QUI N'A JAMAIS TOURNÉ
-- ------------------------------------------
-- • Groupes de bout en bout : créer, inviter, accepter, publier dedans, et surtout ce qu'un
--   NON-MEMBRE ne doit ni voir ni pouvoir faire. Il y a 0 groupe en base : zéro preuve à ce jour.
-- • Notifications : le bon destinataire, l'absence d'auto-notification, et le RETRAIT quand
--   l'action est annulée. Sans risque ici — le relevé a confirmé que le DEV n'a aucun trigger de
--   push. En PROD, ces insertions enverraient de vraies notifications sur de vrais téléphones.
--
-- LE POINT OUVERT QUE CE SCRIPT TRANCHE (test 4.5)
-- -------------------------------------------------
-- Les commentaires sont les SEULS à n'avoir aucun trigger de retrait de notification, là où les
-- likes, les likes de commentaire, les demandes d'ami et les invitations de groupe en ont tous un.
-- Soit `notifications.comment_id` porte une clé étrangère en cascade et tout va bien, soit une
-- notification survit à son commentaire et pointe dans le vide.
--
-- AUCUNE CRÉATION DE MAIN : comme au volet 1, on bascule la main existante de carol en visibilité
-- « groupe » le temps du test, puis on la remet. Moins de colonnes devinées, moins de casse.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'push_subscriptions') then
    raise exception 'ARRET : environnement de PRODUCTION detecte. Ce script cree des notifications, ce qui enverrait de VRAIS push.';
  end if;
end $$;

drop table if exists resultat2;
create temporary table resultat2 (titre text, attendu text, obtenu text, verdict text);
grant all on resultat2 to authenticated;

do $$
declare
  carol uuid; dave uuid; frank uuid;
  main_carol uuid; grp uuid; com_dave uuid;
  vis_origine text; grp_origine uuid;
  n int;
begin
  select id into carol from public.profiles where pseudo = 'carol_dev';
  select id into dave  from public.profiles where pseudo = 'dave_dev';
  select id into frank from public.profiles where pseudo = 'frank_dev';
  if carol is null or dave is null or frank is null then
    raise exception 'ARRET : carol_dev / dave_dev / frank_dev introuvables.';
  end if;

  select id, visibility, group_id into main_carol, vis_origine, grp_origine
    from public.posts where author_id = carol and mod_status = 'visible' limit 1;
  if main_carol is null then
    raise exception 'ARRET : carol n a pas de main visible.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 3. GROUPES DE BOUT EN BOUT — 0 groupe en base, donc 0 preuve jusqu'ici.
  -- ══════════════════════════════════════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);

  select public.create_group('ZZ test angle mort') into grp;
  insert into resultat2 values
    ('3.1 CONTROLE carol cree un groupe', 'un id', coalesce(left(grp::text, 8), 'null'),
     case when grp is not null then 'OK' else 'KO' end);

  begin
    insert into public.group_members(group_id, user_id, status, invited_by) values (grp, dave, 'pending', carol);
    insert into resultat2 values ('3.2 CONTROLE carol (creatrice) invite dave', 'accepte', 'accepte', 'OK');
  exception when others then
    insert into resultat2 values ('3.2 CONTROLE carol (creatrice) invite dave', 'accepte', 'refus ' || sqlstate, 'KO');
  end;

  -- dave n'est pas le créateur : il ne doit pas pouvoir inviter frank.
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  begin
    insert into public.group_members(group_id, user_id, status, invited_by) values (grp, frank, 'pending', dave);
    insert into resultat2 values ('3.3 dave (non createur) invite frank', 'refus', 'ACCEPTE', 'KO');
  exception when others then
    insert into resultat2 values ('3.3 dave (non createur) invite frank', 'refus 42501', sqlstate,
      case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  update public.group_members set status = 'accepted' where group_id = grp and user_id = dave;
  get diagnostics n = row_count;
  insert into resultat2 values ('3.4 CONTROLE dave accepte sa propre invitation', '1 ligne', n || ' ligne(s)',
    case when n = 1 then 'OK' else 'KO' end);

  -- frank n'a jamais été invité : ni s'inscrire lui-même, ni voir le groupe.
  perform set_config('request.jwt.claims', json_build_object('sub', frank, 'role', 'authenticated')::text, true);
  begin
    insert into public.group_members(group_id, user_id, status, invited_by) values (grp, frank, 'accepted', frank);
    insert into resultat2 values ('3.5 frank s auto-invite dans le groupe', 'refus', 'ACCEPTE', 'KO');
  exception when others then
    insert into resultat2 values ('3.5 frank s auto-invite dans le groupe', 'refus 42501', sqlstate,
      case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  select count(*) into n from public.groups where id = grp;
  insert into resultat2 values ('3.6 frank (non membre) voit le groupe', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);

  select count(*) into n from public.group_members where group_id = grp;
  insert into resultat2 values ('3.7 frank voit la liste des membres', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);

  -- Une main publiée DANS le groupe : le membre la voit, le non-membre non.
  set local role postgres;
  update public.posts set visibility = 'group', group_id = grp where id = main_carol;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where id = main_carol;
  insert into resultat2 values ('3.8 CONTROLE dave (membre) voit la main du groupe', '1', n::text,
    case when n = 1 then 'OK' else 'KO' end);

  perform set_config('request.jwt.claims', json_build_object('sub', frank, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where id = main_carol;
  insert into resultat2 values ('3.9 frank (non membre) voit la main du groupe', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);

  -- Remise en état AVANT la section notifications, qui a besoin d'une main visible de dave.
  set local role postgres;
  update public.posts set visibility = vis_origine, group_id = grp_origine where id = main_carol;

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 4. NOTIFICATIONS — bon destinataire, pas d'auto-notification, et surtout le RETRAIT.
  -- ══════════════════════════════════════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  insert into public.likes(post_id, user_id) values (main_carol, dave);

  set local role postgres;  -- lecture d'arbitrage : voir les notifications de tout le monde
  select count(*) into n from public.notifications
   where recipient_id = carol and actor_id = dave and type = 'post_like' and post_id = main_carol;
  insert into resultat2 values ('4.1 CONTROLE like de dave -> notification a carol', '1', n::text,
    case when n = 1 then 'OK' else 'KO' end);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  delete from public.likes where post_id = main_carol and user_id = dave;

  set local role postgres;
  select count(*) into n from public.notifications
   where recipient_id = carol and actor_id = dave and type = 'post_like' and post_id = main_carol;
  insert into resultat2 values ('4.2 unlike -> la notification est retiree', '0', n::text,
    case when n = 0 then 'OK' else 'KO — notification orpheline' end);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  insert into public.likes(post_id, user_id) values (main_carol, carol);

  set local role postgres;
  select count(*) into n from public.notifications where recipient_id = carol and actor_id = carol;
  insert into resultat2 values ('4.3 carol like sa main -> aucune auto-notification', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);
  delete from public.likes where post_id = main_carol and user_id = carol;

  -- ── LE POINT OUVERT : le commentaire est le seul cas sans trigger de retrait.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  insert into public.comments(post_id, author_id, body) values (main_carol, dave, 'ZZ test notif')
    returning id into com_dave;

  set local role postgres;
  select count(*) into n from public.notifications
   where recipient_id = carol and actor_id = dave and comment_id = com_dave;
  insert into resultat2 values ('4.4 CONTROLE commentaire de dave -> notification a carol', '1', n::text,
    case when n = 1 then 'OK' else 'KO' end);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  delete from public.comments where id = com_dave;

  set local role postgres;
  select count(*) into n from public.notifications where comment_id = com_dave;
  insert into resultat2 values ('4.5 commentaire supprime -> sa notification disparait', '0', n::text,
    case when n = 0 then 'OK' else 'KO — notification orpheline' end);

  -- Cloisonnement des notifications.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.notifications where recipient_id <> carol;
  insert into resultat2 values ('4.6 carol lit les notifications des autres', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);

  update public.notifications set read_at = now() where recipient_id = dave;
  get diagnostics n = row_count;
  insert into resultat2 values ('4.7 carol marque lues les notifications de dave', '0 ligne', n || ' ligne(s)',
    case when n = 0 then 'OK' else 'KO' end);

  select count(*) into n from public.notifications where recipient_id = carol;
  insert into resultat2 values ('4.8 CONTROLE carol lit bien SES notifications', '> 0', n::text,
    case when n > 0 then 'OK' else 'KO' end);

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 5. NETTOYAGE — tout ce que le script a créé disparaît, et la main de carol retrouve
  --    sa visibilité d'origine (relevée, pas devinée).
  -- ══════════════════════════════════════════════════════════════════════════════════
  set local role postgres;
  update public.posts set visibility = vis_origine, group_id = grp_origine where id = main_carol;
  delete from public.comments where body like 'ZZ %';
  delete from public.likes where post_id = main_carol and user_id in (carol, dave);
  delete from public.notifications where actor_id in (carol, dave) and (post_id = main_carol or comment_id = com_dave);
  delete from public.group_members where group_id = grp;
  delete from public.groups where id = grp;
  update public.posts set like_count = (select count(*) from public.likes l where l.post_id = main_carol)
    where id = main_carol;

  select count(*) into n from public.groups where name like 'ZZ test%';
  insert into resultat2 values ('5.1 nettoyage : groupes ZZ restants', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);
  select count(*) into n from public.comments where body like 'ZZ %';
  insert into resultat2 values ('5.2 nettoyage : commentaires ZZ restants', '0', n::text,
    case when n = 0 then 'OK' else 'KO' end);
  select count(*) into n from public.posts
    where id = main_carol and visibility = vis_origine and group_id is not distinct from grp_origine;
  insert into resultat2 values ('5.3 nettoyage : main de carol remise a l identique', '1', n::text,
    case when n = 1 then 'OK' else 'KO' end);
end $$;

reset role;
select titre, attendu, obtenu, verdict from resultat2 order by titre;
