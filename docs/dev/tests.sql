-- ============================================================================
-- TESTS RLS — blocage × feed par affinité + modération + gating admin.
-- À lancer sur le DEV, APRÈS moderation.sql puis seed.sql :
--   https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- Méthode : on simule chaque utilisateur via `request.jwt.claims` + `set local role
-- authenticated` (sinon l'éditeur SQL tourne en postgres, propriétaire = RLS ignorée).
-- Les résultats sont accumulés dans une table temp ; le SELECT final montre PASS/FAIL.
-- ============================================================================

drop table if exists _res;
create temp table _res (step text, expected text, got text, pass boolean);

do $$
declare
  alice   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  bob     uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  carol   uuid := 'cccccccc-0000-0000-0000-000000000003';
  frank   uuid := 'ffffffff-0000-0000-0000-000000000005';
  mallory uuid := '11111111-0000-0000-0000-000000000006';
  admin   uuid := '99999999-0000-0000-0000-000000000007';
  bob_post   uuid := '0b570000-0000-0000-0000-000000000002';
  carol_post uuid := '0c570000-0000-0000-0000-000000000003';
  report_bob uuid := 'e0570000-0000-0000-0000-000000000001';
  v int; v2 int; vtxt text; ok boolean;
begin
  -- A0 — Diagnostic : la simulation d'utilisateur marche-t-elle ? (auth.uid() doit valoir Alice)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select auth.uid()::text into vtxt;
    reset role;
    insert into _res values('A0  Diagnostic : auth.uid() = Alice (sinon la simulation est KO)', alice::text, coalesce(vtxt,'NULL'), vtxt = alice::text);
  exception when others then reset role; insert into _res values('A0  Diagnostic : auth.uid()', alice::text, 'ERREUR: '||sqlerrm, false); end;

  -- A1 — Alice ne voit PAS le post de Bob (bloqué) dans le feed par affinité.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_ranked where author_id = bob;
    reset role;
    insert into _res values('A1  Alice : post de Bob absent du feed (bloque)', '0', v::text, v = 0);
  exception when others then reset role; insert into _res values('A1  Alice : post de Bob absent du feed (bloque)', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A1b — ... alors que son affinité EST élevée (mutual=2) : masqué APRÈS le score.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select public.mutual_friend_count(bob) into v;
    reset role;
    insert into _res values('A1b Alice : mutual_friend_count(Bob) eleve (score haut, pourtant masque)', '2', v::text, v = 2);
  exception when others then reset role; insert into _res values('A1b Alice : mutual_friend_count(Bob)', '2', 'ERREUR: '||sqlerrm, false); end;

  -- A2 — Frank (témoin : mêmes mutuels, PAS de blocage) voit le post de Bob → masquage scopé.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', frank, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v  from public.posts_ranked where author_id = bob;
    select public.mutual_friend_count(bob) into v2;
    reset role;
    insert into _res values('A2  Frank : post de Bob PRESENT (blocage scope, pas global)', '1', v::text, v = 1);
    insert into _res values('A2b Frank : mutual_friend_count(Bob) identique a Alice', '2', v2::text, v2 = 2);
  exception when others then reset role; insert into _res values('A2  Frank : post de Bob present', '1', 'ERREUR: '||sqlerrm, false); end;

  -- A3 — Mallory (banni) invisible pour tout le monde (masque global).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_ranked where author_id = mallory;
    reset role;
    insert into _res values('A3  Alice : post de Mallory (banni) absent', '0', v::text, v = 0);
  exception when others then reset role; insert into _res values('A3  Alice : post de Mallory absent', '0', 'ERREUR: '||sqlerrm, false); end;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', frank, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_ranked where author_id = mallory;
    reset role;
    insert into _res values('A3b Frank : post de Mallory (banni) absent', '0', v::text, v = 0);
  exception when others then reset role; insert into _res values('A3b Frank : post de Mallory absent', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A4 — Blocage MUTUEL : Bob ne voit pas le post d'Alice.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_ranked where author_id = alice;
    reset role;
    insert into _res values('A4  Bob : post d''Alice absent (blocage mutuel)', '0', v::text, v = 0);
  exception when others then reset role; insert into _res values('A4  Bob : post d''Alice absent', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A5a — L'amitié Alice~Bob a été rompue par le blocage (trigger).
  begin
    select count(*) into v from public.friend_requests
      where (sender_id = alice and receiver_id = bob) or (sender_id = bob and receiver_id = alice);
    insert into _res values('A5a Amitie Alice~Bob rompue par le blocage', '0', v::text, v = 0);
  exception when others then insert into _res values('A5a Amitie Alice~Bob rompue', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A5b — Bob ne peut pas envoyer de demande d'ami à Alice (RLS).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role','authenticated')::text, true);
    set local role authenticated;
    ok := true;
    begin
      insert into public.friend_requests (sender_id, receiver_id, status) values (bob, alice, 'pending');
      ok := false; -- l'insert a réussi → échec du test
    exception when others then ok := true; end;
    reset role;
    delete from public.friend_requests where sender_id = bob and receiver_id = alice; -- nettoyage
    insert into _res values('A5b Bob : demande d''ami vers Alice rejetee (RLS)', 'rejet', case when ok then 'rejet' else 'accepte' end, ok);
  exception when others then reset role; insert into _res values('A5b Bob : demande d''ami rejetee', 'rejet', 'ERREUR: '||sqlerrm, false); end;

  -- A6 — Feed d'Alice : pas de doublon (count = count distinct) malgré le filtrage par blocage.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v  from (select id from public.posts_ranked) t;
    select count(distinct id) into v2 from public.posts_ranked;
    reset role;
    insert into _res values('A6  Alice : feed sans doublon (count = count distinct)', v2::text, v::text, v = v2);
  exception when others then reset role; insert into _res values('A6  Alice : feed sans doublon', '=', 'ERREUR: '||sqlerrm, false); end;

  -- A7a — Admin retire le post de Carol via RPC (side-effect conservé pour A7b/A7c).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
    set local role authenticated;
    perform public.admin_set_content_status('post', carol_post, 'removed', 'test modération');
    reset role;
    insert into _res values('A7a Admin : retrait du post de Carol (RPC)', 'ok', 'ok', true);
  exception when others then reset role; insert into _res values('A7a Admin : retrait du post de Carol (RPC)', 'ok', 'ERREUR: '||sqlerrm, false); end;

  -- A7b — Alice (non-auteur) ne voit plus le post retiré de Carol.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_ranked where id = carol_post;
    reset role;
    insert into _res values('A7b Alice : post retire de Carol absent du feed', '0', v::text, v = 0);
  exception when others then reset role; insert into _res values('A7b Alice : post retire absent', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A7c — Carol (auteure) voit SON post retiré avec le bandeau (mod_status='removed').
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.posts_feed where id = carol_post and mod_status = 'removed';
    reset role;
    insert into _res values('A7c Carol : voit SON post retire (bandeau, mod_status=removed)', '1', v::text, v = 1);
  exception when others then reset role; insert into _res values('A7c Carol : voit son post retire (bandeau)', '1', 'ERREUR: '||sqlerrm, false); end;

  -- A7d — Admin lit le contenu SIGNALÉ (post de Bob) via RPC, même masqué (bypass RLS).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
    set local role authenticated;
    select (public.admin_get_report_context(report_bob) -> 'target' ->> 'id') into vtxt;
    reset role;
    insert into _res values('A7d Admin : contexte lit le post signale de Bob', bob_post::text, coalesce(vtxt,'null'), vtxt = bob_post::text);
  exception when others then reset role; insert into _res values('A7d Admin : contexte du signalement', bob_post::text, 'ERREUR: '||sqlerrm, false); end;

  -- A8a — Alice ne lit PAS les signalements d'autrui (mais lit les siens).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v  from public.reports where reporter_id = frank; -- signalement de Frank
    select count(*) into v2 from public.reports where reporter_id = alice; -- le sien
    reset role;
    insert into _res values('A8a Alice : ne lit PAS les signalements d''autrui', '0', v::text, v = 0);
    insert into _res values('A8a2 Alice : lit SES propres signalements', '1', v2::text, v2 = 1);
  exception when others then reset role; insert into _res values('A8a Alice : signalements d''autrui invisibles', '0', 'ERREUR: '||sqlerrm, false); end;

  -- A8b — Alice ne peut pas lire user_sanctions du tout (aucun grant → permission denied = OK).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.user_sanctions;
    reset role;
    insert into _res values('A8b Alice : user_sanctions inaccessible', 'refus', 'LU ('||v::text||' lignes)', false);
  exception when others then reset role; insert into _res values('A8b Alice : user_sanctions inaccessible (permission denied)', 'refus', 'refus', true); end;

  -- A8c — Alice ne peut pas appeler une RPC admin (gate is_admin).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);
    set local role authenticated;
    perform public.admin_list_reports(null);
    reset role;
    insert into _res values('A8c Alice : admin_list_reports refuse aux non-admins', 'refus', 'EXECUTE!', false);
  exception when others then reset role; insert into _res values('A8c Alice : admin_list_reports refuse aux non-admins', 'refus', 'refus', true); end;

  -- Nettoyage : on remet le post de Carol visible (pour re-jouabilité).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
    set local role authenticated;
    perform public.admin_set_content_status('post', carol_post, 'visible', null);
    reset role;
  exception when others then reset role; end;

  perform set_config('request.jwt.claims', '', true);
end $$;

-- Résultat en UNE seule cellule (facile à copier-coller d'un bloc).
select
  '=== ' || count(*) filter (where pass) || '/' || count(*) || ' PASS'
  || case when count(*) filter (where not pass) > 0 then '  — ' || count(*) filter (where not pass) || ' ECHEC(S)' else '  — TOUT VERT' end
  || ' ===' || E'\n'
  || string_agg(
       (case when pass then 'OK   ' else 'FAIL ' end) || step
         || '  [attendu=' || expected || ' | obtenu=' || got || ']',
       E'\n' order by step)
  as resultats
from _res;
