-- ============================================================================
-- SEED de test — 7 comptes fictifs pour valider blocage × feed par affinité.
-- À lancer sur le DEV UNIQUEMENT, APRÈS moderation.sql :
--   https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- Re-jouable (nettoie d'abord ses propres données par UUID fixes).
--
-- ⚠️ Ces comptes ont un mot de passe VIDE (test au niveau SQL/rôles). Pour se
--    connecter via l'APP, lancer ENSUITE docs/dev/seed-passwords.sql (donne un
--    mot de passe + backfill des colonnes de tokens NULL, sinon login = 500).
-- ⚠️ Les posts ci-dessous ont un `hand` STUB (non rendable par l'app). Pour tester
--    via l'APP, lancer AUSSI docs/dev/seed-fix-hands.sql (remplace par une main
--    valide, sinon le feed plante : « undefined reading 'filter' » → page blanche).
--
-- Cast :
--   Alice   = viewer + BLOQUEUR            (bloque Bob)
--   Bob     = BLOQUÉ ; amis communs Carol+Dave avec Alice ET Frank (mutual=2 → score élevé)
--   Carol,Dave = AMIS-EN-COMMUN (amis d'Alice, Bob, Frank)
--   Frank   = LAMBDA TÉMOIN (mêmes mutuels que Bob, mais ne bloque pas Bob)
--   Mallory = BANNI
--   Admin   = ADMIN
-- ============================================================================

begin;

-- UUID fixes (comptes)
--   Alice   aaaaaaaa-0000-0000-0000-000000000001
--   Bob     bbbbbbbb-0000-0000-0000-000000000002
--   Carol   cccccccc-0000-0000-0000-000000000003
--   Dave    dddddddd-0000-0000-0000-000000000004
--   Frank   ffffffff-0000-0000-0000-000000000005
--   Mallory 11111111-0000-0000-0000-000000000006
--   Admin   99999999-0000-0000-0000-000000000007

-- ── Nettoyage (idempotence) ──────────────────────────────────────────────────
delete from public.reports        where reporter_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007')
                                      or target_id  in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007','0a570000-0000-0000-0000-000000000001','0b570000-0000-0000-0000-000000000002','0c570000-0000-0000-0000-000000000003','0d570000-0000-0000-0000-000000000004','0f570000-0000-0000-0000-000000000005','10570000-0000-0000-0000-000000000006');
delete from public.user_sanctions where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007');
delete from public.blocks         where blocker_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007')
                                      or blocked_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007');
delete from public.admins         where user_id in ('99999999-0000-0000-0000-000000000007');
-- auth.users supprime en cascade profiles → posts, comments, friend_requests, likes, votes, notifications.
delete from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','ffffffff-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','99999999-0000-0000-0000-000000000007');

-- ── 1. auth.users (colonnes minimales, jeu neuf = schéma GoTrue récent) ───────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','alice@dev.test','', now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated','bob@dev.test','',   now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000003','authenticated','authenticated','carol@dev.test','', now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','dddddddd-0000-0000-0000-000000000004','authenticated','authenticated','dave@dev.test','',  now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','ffffffff-0000-0000-0000-000000000005','authenticated','authenticated','frank@dev.test','', now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000006','authenticated','authenticated','mallory@dev.test','',now(), now(), now(), '{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','99999999-0000-0000-0000-000000000007','authenticated','authenticated','admin@dev.test','', now(), now(), now(), '{"provider":"email","providers":["email"]}','{}');

-- ── 2. profiles ──────────────────────────────────────────────────────────────
insert into public.profiles (id, pseudo, format_favori, frequence_jeu, variante_favorite) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice_dev',  'cash_live','regulier','nlhe'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob_dev',    'cash_live','regulier','nlhe'),
 ('cccccccc-0000-0000-0000-000000000003','carol_dev',  'cash_live','regulier','nlhe'),
 ('dddddddd-0000-0000-0000-000000000004','dave_dev',   'cash_live','regulier','nlhe'),
 ('ffffffff-0000-0000-0000-000000000005','frank_dev',  'cash_live','regulier','nlhe'),
 ('11111111-0000-0000-0000-000000000006','mallory_dev','cash_live','regulier','nlhe'),
 ('99999999-0000-0000-0000-000000000007','admin_dev',  'cash_live','regulier','nlhe');

-- ── 3. posts (1 par joueur, publics ; hand minimal qui matche la pref → +5 uniforme) ─
insert into public.posts (id, author_id, title, hand, visibility) values
 ('0a570000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Main Alice',  '{"variant":"nlhe","gameType":"cash"}','public'),
 ('0b570000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Main Bob',    '{"variant":"nlhe","gameType":"cash"}','public'),
 ('0c570000-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003','Main Carol',  '{"variant":"nlhe","gameType":"cash"}','public'),
 ('0d570000-0000-0000-0000-000000000004','dddddddd-0000-0000-0000-000000000004','Main Dave',   '{"variant":"nlhe","gameType":"cash"}','public'),
 ('0f570000-0000-0000-0000-000000000005','ffffffff-0000-0000-0000-000000000005','Main Frank',  '{"variant":"nlhe","gameType":"cash"}','public'),
 ('10570000-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000006','Main Mallory','{"variant":"nlhe","gameType":"cash"}','public');

-- ── 4. friend_requests (accepted) — graphe d'amitié ──────────────────────────
-- Alice ~ Carol, Dave ; Bob ~ Carol, Dave ; Frank ~ Carol, Dave  → mutual(Alice,Bob)=mutual(Frank,Bob)=2
-- Alice ~ Bob (sera ROMPUE par le blocage ci-dessous, via trigger)
insert into public.friend_requests (sender_id, receiver_id, status) values
 ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','accepted'),
 ('aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','accepted'),
 ('bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','accepted'),
 ('bbbbbbbb-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000004','accepted'),
 ('ffffffff-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000003','accepted'),
 ('ffffffff-0000-0000-0000-000000000005','dddddddd-0000-0000-0000-000000000004','accepted'),
 ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','accepted');

-- ── 5. Mallory BANNIE ────────────────────────────────────────────────────────
insert into public.user_sanctions (user_id, type, reason) values
 ('11111111-0000-0000-0000-000000000006','banned','seed: compte banni de test');

-- ── 6. Admin ─────────────────────────────────────────────────────────────────
insert into public.admins (user_id) values ('99999999-0000-0000-0000-000000000007');

-- ── 7. Alice BLOQUE Bob (le trigger rompt l'amitié Alice~Bob) ────────────────
insert into public.blocks (blocker_id, blocked_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');

-- ── 8. Signalements de test ──────────────────────────────────────────────────
-- Frank signale le post de Bob (pour tester admin_get_report_context) ; id fixe.
insert into public.reports (id, reporter_id, source, target_type, target_id, reason, details) values
 ('e0570000-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000005','app','post','0b570000-0000-0000-0000-000000000002','spam','seed: signalement de test');
-- Alice signale Mallory comme compte mineur (doit devenir severity=priority via trigger).
insert into public.reports (reporter_id, source, target_type, target_id, reason) values
 ('aaaaaaaa-0000-0000-0000-000000000001','app','user','11111111-0000-0000-0000-000000000006','compte_mineur');

commit;

select 'seed OK — comptes:' as info, (select count(*) from public.profiles where pseudo like '%\_dev')::text as profils,
       (select count(*) from public.posts where id::text like '0%570000-%' or id::text like '10570000-%')::text as posts,
       (select count(*) from public.blocks)::text as blocks,
       (select count(*) from public.reports)::text as reports;
