-- ============================================================================
-- MESURE de ce que `consentement-identite.sql` a réellement changé.
--
-- POURQUOI CE FICHIER SÉPARÉ : un script qui se juge lui-même ne prouve rien.
-- Celui-ci crée un compte JETABLE, se fait passer pour lui, appelle vraiment la
-- RPC et essaie vraiment d'écrire dans la colonne — puis affiche ce que la base
-- a décidé, succès comme échec.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- CE QUI EST MESURÉ
--   1. la colonne `consentement_identite_at` existe
--   2. create_profile(..., false) est REFUSÉE, et n'écrit rien
--   3. create_profile(..., true)  crée le profil ET pose la trace
--   4. le titulaire peut toujours modifier son prénom / nom / naissance
--   5. le titulaire NE PEUT PAS réécrire sa trace de consentement
--      (c'est la mesure qui compte : sans elle, la trace ne prouve rien)
--   6. rappel de l'état de l'ancienne signature à 7 arguments
--
-- ⚠️ CE QUE CE TEST NE PROUVE PAS : rien n'empêche un client d'écrire
-- directement dans `profiles_private` via PostgREST au lieu de passer par la
-- RPC, et donc de créer son profil sans trace. Fermer ça demanderait de retirer
-- le droit d'INSERT sur la table et de passer `create_profile` en SECURITY
-- DEFINER — un changement de posture volontairement laissé de côté. Ce qui est
-- verrouillé ici, c'est l'ALTÉRATION APRÈS COUP d'une trace existante.
--
-- Le compte d'essai a un e-mail en @test.invalid (TLD réservé, ne peut
-- appartenir à personne), et il est supprimé à la fin — y compris si une mesure
-- échoue. Le récapitulatif final confirme qu'il n'en reste rien.
--
-- ⚠️ LES VALEURS DU PROFIL D'ESSAI NE SONT PAS LIBRES. `profiles` porte des
-- contraintes CHECK sur `display_preference`, `format_favori`, `frequence_jeu` et
-- `variante_favorite` : la liste exacte est dans `pokza-app/src/profile/profileOptions.ts`.
-- Une valeur inventée (« cash », « souvent ») fait échouer la mesure 3 sur
-- `violates check constraint` — l'échec vient alors du test, pas de la migration.
--
-- ATTENDU : 6 lignes « OK », puis « compte d'essai supprime : OK ».
-- ============================================================================

drop table if exists _res;
create temp table _res (n int, mesure text, lu text, verdict text);
-- Sans ça, les insertions faites pendant qu'on se fait passer pour
-- `authenticated` sont refusées, et le test ne mesure plus rien.
-- (`n` est un int renseigné à la main et non un `serial` : un serial obligerait à
--  accorder aussi la séquence, dont il faudrait deviner le nom.)
grant all on _res to authenticated;

do $$
declare
  v_uid   constant uuid := 'c0057e17-0000-0000-0000-00000000c0de'::uuid;
  v_n     integer;
  v_at    timestamptz;
  v_msg   text;
begin
  -- ═══ Compte jetable ════════════════════════════════════════════════════════
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
          'consentement@test.invalid', '', now(), now(), now(),
          '{"provider":"email","providers":["email"]}', '{}');

  -- ═══ 1. La colonne existe ══════════════════════════════════════════════════
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles_private'
     and column_name = 'consentement_identite_at';
  insert into _res (n, mesure, lu, verdict) values (
    1, '1. colonne consentement_identite_at',
    v_n || ' colonne(s) trouvee(s)',
    case when v_n = 1 then 'OK' else 'ECHEC' end);

  -- ═══ On devient le compte d'essai ══════════════════════════════════════════
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, false);
  set role authenticated;

  -- ═══ 2. Sans consentement, la RPC refuse ═══════════════════════════════════
  begin
    perform public.create_profile('essai-consentement', 'pseudo', 'cash_live', 'regulier',
                                  'Jean', 'Test', '1990-01-01'::date, false);
    insert into _res (n, mesure, lu, verdict) values (
      2, '2. create_profile(..., false)', 'acceptee', 'ECHEC — aurait du etre refusee');
  exception when others then
    v_msg := sqlerrm;
    select count(*) into v_n from public.profiles where id = v_uid;
    insert into _res (n, mesure, lu, verdict) values (
      2, '2. create_profile(..., false)',
      'refusee : ' || left(v_msg, 60) || ' | profils crees : ' || v_n,
      case when v_n = 0 then 'OK' else 'ECHEC — une ligne a ete ecrite' end);
  end;

  -- ═══ 3. Avec consentement, la RPC crée et horodate ═════════════════════════
  begin
    perform public.create_profile('essai-consentement', 'pseudo', 'cash_live', 'regulier',
                                  'Jean', 'Test', '1990-01-01'::date, true);
    select consentement_identite_at into v_at
      from public.profiles_private where id = v_uid;
    insert into _res (n, mesure, lu, verdict) values (
      3, '3. create_profile(..., true)',
      'trace = ' || coalesce(v_at::text, 'NULL'),
      case when v_at is not null then 'OK' else 'ECHEC — profil cree sans trace' end);
  exception when others then
    insert into _res (n, mesure, lu, verdict) values (
      3, '3. create_profile(..., true)', 'refusee : ' || left(sqlerrm, 80), 'ECHEC');
  end;

  -- ═══ 4. Les colonnes de données restent modifiables ════════════════════════
  -- Contrôle négatif : si les droits par colonne avaient tout verrouillé, la
  -- mesure 5 passerait au vert pour une mauvaise raison.
  begin
    update public.profiles_private set prenom = 'Jeanne' where id = v_uid;
    insert into _res (n, mesure, lu, verdict) values (
      4, '4. le titulaire modifie son prenom', 'acceptee', 'OK');
  exception when others then
    insert into _res (n, mesure, lu, verdict) values (
      4, '4. le titulaire modifie son prenom', 'refusee : ' || left(sqlerrm, 60),
      'ECHEC — droit legitime casse');
  end;

  -- ═══ 5. La trace, elle, est verrouillée ════════════════════════════════════
  begin
    update public.profiles_private
       set consentement_identite_at = '2000-01-01'::timestamptz
     where id = v_uid;
    insert into _res (n, mesure, lu, verdict) values (
      5, '5. le titulaire antidate sa trace', 'acceptee', 'ECHEC — la trace ne prouve rien');
  exception when insufficient_privilege then
    insert into _res (n, mesure, lu, verdict) values (
      5, '5. le titulaire antidate sa trace', 'refusee (droit de colonne)', 'OK');
  when others then
    insert into _res (n, mesure, lu, verdict) values (
      5, '5. le titulaire antidate sa trace', 'refusee : ' || left(sqlerrm, 60), 'OK');
  end;

  -- ═══ Remise en état — s'exécute quoi qu'il arrive ══════════════════════════
  reset role;
  perform set_config('request.jwt.claims', '', false);

  -- ═══ 6. Où en est l'ancienne signature ═════════════════════════════════════
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_profile'
     and pg_get_function_identity_arguments(p.oid) not like '%boolean';
  insert into _res (n, mesure, lu, verdict) values (
    6, '6. ancienne signature a 7 arguments',
    case when v_n > 0 then 'encore presente' else 'retiree' end,
    case when v_n > 0
         then 'OK a ce stade — a retirer avec consentement-identite-cloture.sql'
         else 'OK — cloture deja faite' end);

exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', false);
  insert into _res (n, mesure, lu, verdict) values (0, 'ARRET', sqlerrm, 'ECHEC');
end $$;

-- ═══ Ménage ══════════════════════════════════════════════════════════════════
delete from public.profiles_private where id = 'c0057e17-0000-0000-0000-00000000c0de'::uuid;
delete from public.profiles         where id = 'c0057e17-0000-0000-0000-00000000c0de'::uuid;
delete from auth.users              where id = 'c0057e17-0000-0000-0000-00000000c0de'::uuid;

insert into _res (n, mesure, lu, verdict)
select 7, 'compte d''essai supprime',
       'restant : ' || count(*),
       case when count(*) = 0 then 'OK' else 'ECHEC — a nettoyer a la main' end
  from auth.users where id = 'c0057e17-0000-0000-0000-00000000c0de'::uuid;

select n, mesure, lu, verdict from _res order by n;
