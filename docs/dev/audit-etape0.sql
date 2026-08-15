-- ÉTAPE 0 — RELEVÉ DE L'ÉTAT RÉEL DE LA BASE
-- ==========================================
-- 100 % LECTURE SEULE : ne lit que les catalogues système. Aucun create/alter/drop/insert/update.
--
-- POURQUOI : les policies d'écriture de `storage.objects` et les GRANT par colonne ont été créés
-- via le dashboard et n'existent dans AUCUN fichier du dépôt. Sans ce relevé, les correctifs
-- F-04 (colonnes de profiles), F-05 (avatars) et F-08 (âge) seraient écrits à l'aveugle.
--
-- SORTIE : UNE seule ligne, UNE seule colonne « rapport ». Clique la cellule → le panneau latéral
-- affiche tout le texte avec un bouton de copie. Un seul copier-coller à me renvoyer.
--
-- À LANCER SUR LES DEUX PROJETS (précise-moi lequel est lequel quand tu colles) :
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new

with

-- 1. Toutes les policies RLS de public et storage ---------------------------------------
pol as (
  select 1 as ord,
    format('[POLICY] %s.%s | %s | %s | %s | roles=%s | USING(%s) | CHECK(%s)',
      schemaname, tablename, policyname,
      case when permissive = 'PERMISSIVE' then 'permissive' else '*RESTRICTIVE*' end,
      cmd,
      array_to_string(roles, ','),
      coalesce(qual, '-'),
      coalesce(with_check, '-')
    ) as line
  from pg_policies
  where schemaname in ('public', 'storage')
),

-- 2. RLS activée ou non, table par table ------------------------------------------------
rls as (
  select 2 as ord,
    format('[RLS] %s.%s | rls=%s | forced=%s | nb_policies=%s',
      n.nspname, c.relname,
      case when c.relrowsecurity then 'ON' else '*OFF*' end,
      case when c.relforcerowsecurity then 'ON' else 'off' end,
      (select count(*) from pg_policy p where p.polrelid = c.oid)
    ) as line
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'storage')
),

-- 3. Droits au niveau TABLE pour les rôles publics ---------------------------------------
tgrant as (
  select 3 as ord,
    format('[TABLE-GRANT] %s.%s | %s | %s',
      table_schema, table_name, grantee,
      string_agg(privilege_type, ',' order by privilege_type)
    ) as line
  from information_schema.role_table_grants
  where table_schema in ('public', 'storage')
    and grantee in ('anon', 'authenticated', 'PUBLIC')
  group by table_schema, table_name, grantee
),

-- 4. Droits au niveau COLONNE (vrais GRANT par colonne uniquement) ------------------------
--    C'est la technique déjà utilisée par notifications.read_at, à reproduire pour profiles.
cgrant as (
  select 4 as ord,
    format('[COLUMN-GRANT] %s.%s.%s | %s', n.nspname, c.relname, a.attname, a.attacl::text) as line
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage')
    and a.attacl is not null
    and a.attnum > 0
),

-- 5. Vues : security_invoker activé ou non ------------------------------------------------
vw as (
  select 5 as ord,
    format('[VIEW] %s.%s | reloptions=%s',
      n.nspname, c.relname,
      coalesce(array_to_string(c.reloptions, ','), '*AUCUNE (security_definer par defaut)*')
    ) as line
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('v', 'm') and n.nspname = 'public'
),

-- 6. Fonctions : SECURITY DEFINER, search_path, et qui peut les appeler --------------------
fn as (
  select 6 as ord,
    format('[FUNCTION] %s(%s) | %s | config=%s | acl=%s',
      p.proname,
      pg_get_function_identity_arguments(p.oid),
      case when p.prosecdef then '*SECURITY DEFINER*' else 'invoker' end,
      coalesce(array_to_string(p.proconfig, ','), '-'),
      coalesce(p.proacl::text, 'defaut (PUBLIC peut executer)')
    ) as line
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

-- 7. Buckets de stockage : public ?, limite de taille, types MIME autorisés -----------------
bk as (
  select 7 as ord,
    format('[BUCKET] %s | public=%s | size_limit=%s | mime=%s',
      id,
      public,
      coalesce(file_size_limit::text, '*AUCUNE LIMITE*'),
      coalesce(array_to_string(allowed_mime_types, ','), '*TOUS TYPES*')
    ) as line
  from storage.buckets
),

-- 8. Contraintes CHECK existantes (longueurs, âge, etc.) -----------------------------------
ck as (
  select 8 as ord,
    format('[CHECK] %s.%s | %s | %s',
      n.nspname, cl.relname, con.conname, pg_get_constraintdef(con.oid)
    ) as line
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where con.contype = 'c' and n.nspname = 'public'
),

-- 9. Triggers applicatifs (gardes-fous côté base) -------------------------------------------
tg as (
  select 9 as ord,
    format('[TRIGGER] %s.%s | %s -> %s()',
      n.nspname, cl.relname, t.tgname, p.proname
    ) as line
  from pg_trigger t
  join pg_class cl on cl.oid = t.tgrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and n.nspname = 'public'
),

toutes as (
  select * from pol
  union all select * from rls
  union all select * from tgrant
  union all select * from cgrant
  union all select * from vw
  union all select * from fn
  union all select * from bk
  union all select * from ck
  union all select * from tg
)

select string_agg(line, chr(10) order by ord, line) as rapport
from toutes;
