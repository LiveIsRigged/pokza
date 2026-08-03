-- Audit des contraintes de clé étrangère qui référencent auth.users(id).
--
-- Pourquoi : `delete_own_account` ne fait que `delete from auth.users where id = auth.uid()` —
-- aucune logique de nettoyage, tout repose sur le comportement ON DELETE de chaque contrainte.
-- On a confirmé qu'au moins une (`group_members.invited_by`, NO ACTION) bloque la suppression
-- d'un compte qui a invité quelqu'un dans un groupe. Cette requête liste TOUTES les contraintes
-- du même genre pour savoir combien de scénarios de suppression sont cassés, pas juste celui-là.
--
-- À lancer dans le SQL editor :
-- https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Ne modifie rien : lecture seule de pg_catalog.

with fk as (
  select p.conrelid::regclass::text as table_referencante,
         a.attname as colonne,
         case p.confdeltype
           when 'a' then 'NO ACTION (bloque la suppression)'
           when 'r' then 'RESTRICT (bloque la suppression)'
           when 'c' then 'CASCADE (supprime la ligne aussi)'
           when 'n' then 'SET NULL'
           when 'd' then 'SET DEFAULT'
         end as comportement
  from pg_constraint p
  join pg_attribute a on a.attrelid = p.conrelid and a.attnum = any(p.conkey)
  where p.contype = 'f'
    and p.confrelid = 'auth.users'::regclass
)
select string_agg(table_referencante || '.' || colonne || ' | ' || comportement, chr(10)
                   order by comportement, table_referencante) as rapport
from fk;
