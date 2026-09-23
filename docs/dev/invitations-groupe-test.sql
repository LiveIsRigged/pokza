-- ══════════════════════════════════════════════════════════════════════════════════════════
-- MESURE DES INVITATIONS DE GROUPE — à jouer APRÈS `invitations-groupe.sql`, sur la même base
--
--   DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ⚠️ DEV UNIQUEMENT : le test se sert des comptes de seed (alice, bob, carol, dave, frank,
-- mallory, admin, newbie) — jouer `seed.sql` d'abord.
-- N'ÉCRIT RIEN DE DURABLE : une seule transaction, qui finit par `rollback`. Le groupe, les
-- invitations, les liens, les portes, et même le compte supprimé à la ligne 27, n'existeront
-- jamais pour personne.
--
-- ── LES TROIS RÈGLES QUI TIENNENT CE TEST DEBOUT (toutes payées)
--  1. Les TENTATIVES se font sous l'identité de l'acteur (`set local role` au niveau de la
--     transaction, jamais dans un `do $$ … $$`, où il ne fait rien — 22/08).
--  2. Les VÉRIFICATIONS se font sous `postgres`, après `reset role`. Un refus ne se constate
--     jamais depuis l'œil de celui à qui on refuse : la RLS peut lui CACHER la ligne, et une ligne
--     cachée ressemble exactement à une ligne changée (faux KO du 16/09).
--  3. Chaque tentative note son erreur éventuelle dans `t_err` : quand une action PERMISE échoue,
--     la ligne KO dit pourquoi au lieu de laisser deviner.
--
-- ── ACTEURS
--   Carol  = fondatrice du groupe           Dave, Alice = membres acceptés
--   Frank  = invité par Dave, puis refuse    Admin = invité par Dave, puis retiré par Carol
--   Bob    = entre par le lien de Dave (Alice l'a bloqué dans le seed)
--   Mallory = bannie                         Newbie = invitée en attente, supprime son compte
--
-- ── ATTENDU : 29 lignes (n° 0 à 28), toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table t_res (ord int, controle text, attendu text, resultat text);
create temp table t_ctx (groupe uuid, jeton1 text, jeton2 text);
create temp table t_err (ord int, erreur text);
create temp table t_out (ord int, valeur text);
grant all on t_res, t_ctx, t_err, t_out to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- FABRICATION — sous `postgres`. Rien n'est testé ici.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_groupe uuid;
begin
  if not exists (select 1 from public.profiles where id = '88888888-0000-0000-0000-000000000008') then
    raise exception 'Comptes de seed absents (newbie compris) : jouer seed.sql sur CETTE base.';
  end if;

  insert into public.groups (name, owner_id)
  values ('ZZ invitations', 'cccccccc-0000-0000-0000-000000000003')
  returning id into v_groupe;

  -- La fondatrice, puis deux membres acceptés. Insérés DÉJÀ acceptés : aucun déclencheur de
  -- notification ne part (ils exigent tous `pending`).
  insert into public.group_members (group_id, user_id, status, invited_by, responded_at) values
    (v_groupe, 'cccccccc-0000-0000-0000-000000000003', 'accepted', 'cccccccc-0000-0000-0000-000000000003', now()),
    (v_groupe, 'dddddddd-0000-0000-0000-000000000004', 'accepted', 'cccccccc-0000-0000-0000-000000000003', now()),
    (v_groupe, 'aaaaaaaa-0000-0000-0000-000000000001', 'accepted', 'cccccccc-0000-0000-0000-000000000003', now());

  insert into t_ctx (groupe) values (v_groupe);
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- LE TEST EST-IL EN ÉTAT DE MESURER ?
-- ══════════════════════════════════════════════════════════════════════════════════════════
insert into t_res values (0, 'les objets d''invitations-groupe.sql sont-ils poses ici ?', 'policy + 3 fonctions + test de porte',
  (select case when exists (select 1 from pg_policies where tablename = 'group_members'
                             and policyname = 'Un membre invite, sauf porte fermee')
                and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'
                        and p.proname in ('create_group_invite_link','group_link_preview','join_group_by_link')) = 3
                and to_regprocedure('private.is_door_closed(uuid,uuid)') is not null
              then 'OK — tout est la'
              else 'KO — jouer invitations-groupe.sql sur CETTE base avant ce test' end));

select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t_res values (1, 'sous quel role tournent les tentatives ?', 'authenticated',
  case when current_user = 'authenticated' then 'OK — authenticated'
       else 'KO — ' || current_user || ' : tout contourne la RLS, rien n''est mesure' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- A. UN MEMBRE INVITE — et le fondateur le sait.
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- (toujours sous Dave)
do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), 'ffffffff-0000-0000-0000-000000000005',
          'dddddddd-0000-0000-0000-000000000004', 'pending');
exception when others then insert into t_err values (2, sqlerrm);
end $$;

reset role;

insert into t_res values (2, 'un MEMBRE invite quelqu''un', 'autorise',
  coalesce((select 'OK — en attente, invite par Dave' from public.group_members
             where group_id = (select groupe from t_ctx)
               and user_id = 'ffffffff-0000-0000-0000-000000000005'
               and status = 'pending'
               and invited_by = 'dddddddd-0000-0000-0000-000000000004'),
           'KO — ' || coalesce((select erreur from t_err where ord = 2), 'aucune ligne')));

insert into t_res values (3, 'la fondatrice est prevenue, a l''invitation', '1 group_member_invited',
  (select case when count(*) = 1 then 'OK — « Dave a invite Frank »' else 'KO — ' || count(*)::text end
     from public.notifications
    where type = 'group_member_invited'
      and recipient_id = 'cccccccc-0000-0000-0000-000000000003'
      and actor_id     = 'dddddddd-0000-0000-0000-000000000004'
      and subject_id   = 'ffffffff-0000-0000-0000-000000000005'));

-- Dave se ravise.
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  delete from public.group_members
   where group_id = (select groupe from t_ctx)
     and user_id = 'ffffffff-0000-0000-0000-000000000005'
     and status = 'pending';
exception when others then insert into t_err values (4, sqlerrm);
end $$;

reset role;

insert into t_res values (4, 'l''auteur annule sa propre invitation', 'autorise',
  case when not exists (select 1 from public.group_members
                         where group_id = (select groupe from t_ctx)
                           and user_id = 'ffffffff-0000-0000-0000-000000000005')
       then 'OK — invitation supprimee'
       else 'KO — ' || coalesce((select erreur from t_err where ord = 4), 'la ligne est toujours la') end);

insert into t_res values (5, 'l''invitation annulee emporte la notification', '0 restante',
  (select case when count(*) = 0 then 'OK — effacee' else 'KO — ' || count(*)::text || ' restante(s)' end
     from public.notifications
    where type = 'group_member_invited' and subject_id = 'ffffffff-0000-0000-0000-000000000005'));

insert into t_res values (6, 'se raviser ne ferme aucune porte', 'aucune porte',
  (select case when count(*) = 0 then 'OK — porte ouverte' else 'KO — porte fermee a tort' end
     from public.group_closed_doors
    where group_id = (select groupe from t_ctx) and user_id = 'ffffffff-0000-0000-0000-000000000005'));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- B. LE REFUS FERME LA PORTE AUX MEMBRES — le fondateur la rouvre.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), 'ffffffff-0000-0000-0000-000000000005',
          'dddddddd-0000-0000-0000-000000000004', 'pending');
exception when others then insert into t_err values (7, sqlerrm);
end $$;

reset role;

insert into t_res values (7, 'le membre reinvite apres s''etre ravise', 'autorise',
  coalesce((select 'OK — en attente' from public.group_members
             where group_id = (select groupe from t_ctx)
               and user_id = 'ffffffff-0000-0000-0000-000000000005' and status = 'pending'),
           'KO — ' || coalesce((select erreur from t_err where ord = 7), 'aucune ligne')));

-- Frank refuse.
select set_config('request.jwt.claims',
  json_build_object('sub', 'ffffffff-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  delete from public.group_members
   where group_id = (select groupe from t_ctx)
     and user_id = 'ffffffff-0000-0000-0000-000000000005';
exception when others then insert into t_err values (8, sqlerrm);
end $$;

reset role;

insert into t_res values (8, 'l''invite REFUSE', 'porte fermee (declined)',
  coalesce((select 'OK — porte fermee : ' || reason from public.group_closed_doors
             where group_id = (select groupe from t_ctx)
               and user_id = 'ffffffff-0000-0000-0000-000000000005' and reason = 'declined'),
           'KO — ' || coalesce((select erreur from t_err where ord = 8), 'aucune porte')));

-- Dave insiste.
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), 'ffffffff-0000-0000-0000-000000000005',
          'dddddddd-0000-0000-0000-000000000004', 'pending');
exception when others then insert into t_err values (9, sqlerrm);
end $$;

reset role;

insert into t_res values (9, 'un MEMBRE reinvite quelqu''un qui a refuse', 'refuse',
  case when not exists (select 1 from public.group_members
                         where group_id = (select groupe from t_ctx)
                           and user_id = 'ffffffff-0000-0000-0000-000000000005')
       then 'OK — refuse'
       else 'KO — LE MEMBRE A PU INSISTER' end);

-- La fondatrice, elle, peut.
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), 'ffffffff-0000-0000-0000-000000000005',
          'cccccccc-0000-0000-0000-000000000003', 'pending');
exception when others then insert into t_err values (10, sqlerrm);
end $$;

reset role;

insert into t_res values (10, 'la FONDATRICE reinvite, et la porte se rouvre', 'autorise + porte ouverte',
  case when exists (select 1 from public.group_members
                     where group_id = (select groupe from t_ctx)
                       and user_id = 'ffffffff-0000-0000-0000-000000000005' and status = 'pending')
        and not exists (select 1 from public.group_closed_doors
                         where group_id = (select groupe from t_ctx)
                           and user_id = 'ffffffff-0000-0000-0000-000000000005')
       then 'OK — invite, porte rouverte'
       else 'KO — ' || coalesce((select erreur from t_err where ord = 10), 'etat inattendu') end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- C. LE RETRAIT PAR LA FONDATRICE — avant même l'entrée.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), '99999999-0000-0000-0000-000000000007',
          'dddddddd-0000-0000-0000-000000000004', 'pending');
exception when others then insert into t_err values (11, sqlerrm);
end $$;

reset role;

insert into t_res values (11, 'un membre invite Admin', 'autorise',
  coalesce((select 'OK — en attente' from public.group_members
             where group_id = (select groupe from t_ctx)
               and user_id = '99999999-0000-0000-0000-000000000007' and status = 'pending'),
           'KO — ' || coalesce((select erreur from t_err where ord = 11), 'aucune ligne')));

select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  delete from public.group_members
   where group_id = (select groupe from t_ctx)
     and user_id = '99999999-0000-0000-0000-000000000007';
exception when others then insert into t_err values (12, sqlerrm);
end $$;

reset role;

insert into t_res values (12, 'la fondatrice RETIRE l''invitation d''un membre', 'porte fermee (removed)',
  coalesce((select 'OK — porte fermee : ' || reason from public.group_closed_doors
             where group_id = (select groupe from t_ctx)
               and user_id = '99999999-0000-0000-0000-000000000007' and reason = 'removed'),
           'KO — ' || coalesce((select erreur from t_err where ord = 12), 'aucune porte')));

select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), '99999999-0000-0000-0000-000000000007',
          'dddddddd-0000-0000-0000-000000000004', 'pending');
exception when others then insert into t_err values (13, sqlerrm);
end $$;

-- Et Dave tente d'exclure Alice, membre acceptée — il n'est pas fondateur.
do $$ begin
  delete from public.group_members
   where group_id = (select groupe from t_ctx)
     and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
exception when others then insert into t_err values (14, sqlerrm);
end $$;

reset role;

insert into t_res values (13, 'un MEMBRE reinvite quelqu''un que la fondatrice a retire', 'refuse',
  case when not exists (select 1 from public.group_members
                         where group_id = (select groupe from t_ctx)
                           and user_id = '99999999-0000-0000-0000-000000000007')
       then 'OK — refuse' else 'KO — LE MEMBRE A CONTOURNE LA FONDATRICE' end);

insert into t_res values (14, 'un MEMBRE exclut un autre membre', 'refuse',
  case when exists (select 1 from public.group_members
                     where group_id = (select groupe from t_ctx)
                       and user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'accepted')
       then 'OK — Alice est toujours la' else 'KO — UN MEMBRE A PU EN EXCLURE UN AUTRE' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- D. LE BLOCAGE — Alice a bloqué Bob dans le seed.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  insert into public.group_members (group_id, user_id, invited_by, status)
  values ((select groupe from t_ctx), 'bbbbbbbb-0000-0000-0000-000000000002',
          'aaaaaaaa-0000-0000-0000-000000000001', 'pending');
exception when others then insert into t_err values (15, sqlerrm);
end $$;

reset role;

insert into t_res values (15, 'inviter quelqu''un qu''on a bloque', 'refuse',
  case when not exists (select 1 from public.group_members
                         where group_id = (select groupe from t_ctx)
                           and user_id = 'bbbbbbbb-0000-0000-0000-000000000002')
       then 'OK — refuse' else 'KO — LE BLOCAGE NE PROTEGE PAS DES INVITATIONS' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- E. LE LIEN — plusieurs usages, 7 jours, jamais une porte fermée.
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- Newbie invitée en attente (par la fondatrice : aucune notification) — sert aux lignes 17 et 27.
insert into public.group_members (group_id, user_id, invited_by, status)
values ((select groupe from t_ctx), '88888888-0000-0000-0000-000000000008',
        'cccccccc-0000-0000-0000-000000000003', 'pending');

select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.create_group_invite_link((select groupe from t_ctx)) into v;
  update t_ctx set jeton1 = v;
exception when others then insert into t_err values (16, sqlerrm);
end $$;

reset role;

insert into t_res values (16, 'un membre fabrique un lien', 'un jeton de 32 hex, 7 jours',
  coalesce((select 'OK — ' || left(l.token, 8) || '…, expire dans '
                   || extract(day from (l.expires_at - l.created_at))::int || ' jours'
              from public.group_invite_links l
             where l.token = (select jeton1 from t_ctx)
               and l.token ~ '^[0-9a-f]{32}$'
               and l.expires_at - l.created_at = interval '7 days'),
           'KO — ' || coalesce((select erreur from t_err where ord = 16), 'jeton absent ou mal forme')));

select set_config('request.jwt.claims',
  json_build_object('sub', '88888888-0000-0000-0000-000000000008', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  perform public.create_group_invite_link((select groupe from t_ctx));
  insert into t_out values (17, 'accepte');
exception when others then insert into t_out values (17, 'refuse');
end $$;

reset role;

insert into t_res values (17, 'une invitee EN ATTENTE fabrique un lien', 'refuse',
  (select case when valeur = 'refuse' then 'OK — refuse' else 'KO — elle a pu inviter sans etre entree' end
     from t_out where ord = 17));

-- Un visiteur sans compte ouvre l'aperçu.
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

do $$ declare v_nom text; v_hote text; begin
  select group_name, host_name into v_nom, v_hote
    from public.group_link_preview((select jeton1 from t_ctx));
  insert into t_out values (18, coalesce(v_nom, '∅') || ' | ' || coalesce(v_hote, '∅'));
exception when others then insert into t_err values (18, sqlerrm);
end $$;

reset role;

insert into t_res values (18, 'un visiteur SANS COMPTE ouvre l''apercu', 'le groupe, et l''hote = celui qui a envoye',
  coalesce((select case when valeur = 'ZZ invitations | dave_dev' then 'OK — « ZZ invitations » par dave_dev'
                        else 'KO — ' || valeur end
              from t_out where ord = 18),
           'KO — ' || coalesce((select erreur from t_err where ord = 18), 'rien')));

-- Bob entre par le lien de Dave.
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (19, v);
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (21, v);
exception when others then insert into t_err values (19, sqlerrm);
end $$;

reset role;

insert into t_res values (19, 'un inconnu entre par le lien', 'rejoint, invite par Dave',
  case when (select valeur from t_out where ord = 19) = 'rejoint'
        and exists (select 1 from public.group_members
                     where group_id = (select groupe from t_ctx)
                       and user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
                       and status = 'accepted'
                       and invited_by = 'dddddddd-0000-0000-0000-000000000004')
       then 'OK — membre, invite par Dave'
       else 'KO — ' || coalesce((select valeur from t_out where ord = 19),
                                (select erreur from t_err where ord = 19), '?') end);

insert into t_res values (20, 'l''hote ET la fondatrice sont prevenus', 'group_accept a Dave + group_member_joined a Carol',
  case when exists (select 1 from public.notifications
                     where type = 'group_accept'
                       and recipient_id = 'dddddddd-0000-0000-0000-000000000004'
                       and actor_id = 'bbbbbbbb-0000-0000-0000-000000000002')
        and exists (select 1 from public.notifications
                     where type = 'group_member_joined'
                       and recipient_id = 'cccccccc-0000-0000-0000-000000000003'
                       and actor_id = 'bbbbbbbb-0000-0000-0000-000000000002'
                       and subject_id = 'dddddddd-0000-0000-0000-000000000004')
       then 'OK — « Bob a rejoint … grace a Dave »'
       else 'KO — notification manquante' end);

insert into t_res values (21, 'le meme lien, rouvert par un membre', 'deja_membre',
  (select case when valeur = 'deja_membre' then 'OK — deja_membre' else 'KO — ' || valeur end
     from t_out where ord = 21));

-- Admin, que la fondatrice a retiré (ligne 12), essaie le lien.
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000007', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (22, v);
exception when others then insert into t_out values (22, 'erreur : ' || sqlerrm);
end $$;

reset role;

insert into t_res values (22, 'un lien ouvre-t-il une porte FERMEE ?', 'lien_invalide',
  case when (select valeur from t_out where ord = 22) = 'lien_invalide'
        and not exists (select 1 from public.group_members
                         where group_id = (select groupe from t_ctx)
                           and user_id = '99999999-0000-0000-0000-000000000007')
       then 'OK — non' else 'KO — LE LIEN CONTOURNE LE RETRAIT' end);

select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-0000-0000-0000-000000000006', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (23, v);
exception when others then insert into t_out values (23, 'erreur : ' || sqlerrm);
end $$;

reset role;

insert into t_res values (23, 'un compte BANNI ouvre le lien', 'lien_invalide',
  (select case when valeur = 'lien_invalide' then 'OK — refuse' else 'KO — ' || valeur end
     from t_out where ord = 23));

-- Frank, invité en attente par la fondatrice (ligne 10), ouvre le lien de Dave.
select set_config('request.jwt.claims',
  json_build_object('sub', 'ffffffff-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (24, v);
exception when others then insert into t_err values (24, sqlerrm);
end $$;

reset role;

insert into t_res values (24, 'un invite en attente ouvre un lien', 'son invitation est acceptee',
  case when (select valeur from t_out where ord = 24) = 'rejoint'
        and exists (select 1 from public.group_members
                     where group_id = (select groupe from t_ctx)
                       and user_id = 'ffffffff-0000-0000-0000-000000000005' and status = 'accepted')
       then 'OK — membre'
       else 'KO — ' || coalesce((select valeur from t_out where ord = 24),
                                (select erreur from t_err where ord = 24), '?') end);

-- Le lien expire.
update public.group_invite_links set expires_at = now() - interval '1 second'
 where token = (select jeton1 from t_ctx);

select set_config('request.jwt.claims',
  json_build_object('sub', '88888888-0000-0000-0000-000000000008', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.join_group_by_link((select jeton1 from t_ctx)) into v;
  insert into t_out values (25, v);
exception when others then insert into t_out values (25, 'erreur : ' || sqlerrm);
end $$;

reset role;

insert into t_res values (25, 'un lien EXPIRE', 'lien_invalide',
  (select case when valeur = 'lien_invalide' then 'OK — mort' else 'KO — ' || valeur || ' : LE LIEN SURVIT A 7 JOURS' end
     from t_out where ord = 25));

-- Dave fabrique un second lien, puis la fondatrice l'exclut.
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare v text; begin
  select public.create_group_invite_link((select groupe from t_ctx)) into v;
  update t_ctx set jeton2 = v;
exception when others then insert into t_err values (26, 'second lien : ' || sqlerrm);
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  delete from public.group_members
   where group_id = (select groupe from t_ctx)
     and user_id = 'dddddddd-0000-0000-0000-000000000004';
exception when others then insert into t_err values (26, 'exclusion : ' || sqlerrm);
end $$;

reset role;

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

do $$ declare v int; begin
  select count(*) into v from public.group_link_preview((select jeton2 from t_ctx));
  insert into t_out values (26, v::text);
exception when others then insert into t_err values (26, 'apercu : ' || sqlerrm);
end $$;

reset role;

-- ⚠️ « Aperçu vide » ne prouve rien si le second lien n'a jamais été fabriqué, ou si Dave n'a
-- pas vraiment été exclu : les deux sont vérifiés avant de conclure.
insert into t_res values (26, 'le lien d''un membre EXCLU', 'mort (apercu vide)',
  case when (select jeton2 from t_ctx) is null
         then 'KO — le second lien n''a pas ete fabrique : ' || coalesce((select string_agg(erreur, ' / ') from t_err where ord = 26), '?')
       when exists (select 1 from public.group_members
                     where group_id = (select groupe from t_ctx)
                       and user_id = 'dddddddd-0000-0000-0000-000000000004')
         then 'KO — Dave n''a pas ete exclu : ' || coalesce((select string_agg(erreur, ' / ') from t_err where ord = 26), '?')
       when (select valeur from t_out where ord = 26) = '0'
         then 'OK — mort avec l''exclusion'
       else 'KO — UN EXCLU FAIT ENCORE ENTRER DU MONDE' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- F. LES DEUX SUPPRESSIONS QUE LE DÉCLENCHEUR DE PORTE AURAIT PU CASSER.
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- Newbie a une invitation en attente et supprime son compte : ses lignes de membre partent en
-- cascade SOUS SON IDENTITÉ. Sans la garde du bloc 5, ça passerait pour un refus et la porte,
-- écrite vers un compte effacé, ferait échouer la suppression.
select set_config('request.jwt.claims',
  json_build_object('sub', '88888888-0000-0000-0000-000000000008', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  perform public.delete_own_account();
exception when others then insert into t_err values (27, sqlerrm);
end $$;

reset role;

insert into t_res values (27, 'supprimer son compte avec une invitation en attente', 'reussi, sans porte',
  case when not exists (select 1 from auth.users where id = '88888888-0000-0000-0000-000000000008')
        and not exists (select 1 from public.group_closed_doors
                         where user_id = '88888888-0000-0000-0000-000000000008')
       then 'OK — compte supprime'
       else 'KO — ' || coalesce((select erreur from t_err where ord = 27), 'le compte est toujours la') end);

select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ begin
  delete from public.groups where id = (select groupe from t_ctx);
exception when others then insert into t_err values (28, sqlerrm);
end $$;

reset role;

insert into t_res values (28, 'la fondatrice supprime un groupe plein', 'reussi',
  case when not exists (select 1 from public.groups where id = (select groupe from t_ctx))
       then 'OK — groupe supprime, avec membres, portes et liens'
       else 'KO — ' || coalesce((select erreur from t_err where ord = 28), 'le groupe est toujours la') end);

select ord, controle, attendu, resultat from t_res order by ord;

rollback;
