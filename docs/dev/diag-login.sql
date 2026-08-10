-- ============================================================================
-- DIAGNOSTIC connexion des comptes de seed (aucune modification).
-- Lancer sur le DEV puis me COLLER le résultat (6 lignes clé/valeur).
-- SQL editor : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- ============================================================================
with alice as (select * from auth.users where email = 'alice@dev.test')
select 'pgcrypto_schema' as cle,
       coalesce((select n.nspname
                 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                 where e.extname = 'pgcrypto'), 'ABSENT') as valeur
union all
select 'alice_existe', (select count(*)::text from alice)
union all
select 'alice_has_password', (select (encrypted_password <> '')::text from alice)
union all
select 'alice_email_confirmed', (select (email_confirmed_at is not null)::text from alice)
union all
select 'alice_identities_count', (select count(*)::text from auth.identities
                                  where user_id = (select id from alice))
union all
select 'alice_colonnes_NULL', (select coalesce(string_agg(kv.key, ', ' order by kv.key), '(aucune)')
                               from alice u, lateral jsonb_each(to_jsonb(u)) kv
                               where kv.value = 'null'::jsonb);
