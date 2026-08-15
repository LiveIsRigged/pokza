-- RELEVÉ DES RÈGLES DE STOCKAGE — génère le script de restauration (lecture seule)
-- =============================================================================================
-- Les règles de `storage.objects` n'existent que dans le dashboard Supabase : elles ne sont dans
-- aucun fichier du dépôt. Si le projet devait être reconstruit, elles seraient perdues, et
-- personne ne saurait les réécrire de mémoire.
--
-- Plutôt que de les recopier à la main — avec le risque d'une parenthèse de travers dans une
-- règle de sécurité — on demande à Postgres de générer lui-même le script qui les recrée.
-- Ce qui sort d'ici est exact par construction.
--
--   ⚠️ À LANCER EN PRODUCTION : c'est le seul environnement qui a du stockage.
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Ce script ne MODIFIE rien. Il lit le catalogue et renvoie du texte, dans une seule cellule.
-- Copie-la entièrement et renvoie-la moi : j'en ferai un fichier versionné du dépôt.

select string_agg(
         '-- ' || upper(cmd) || ' — ' || policyname || chr(10)
         || 'drop policy if exists ' || quote_ident(policyname) || ' on storage.objects;' || chr(10)
         || 'create policy ' || quote_ident(policyname) || ' on storage.objects' || chr(10)
         || case when permissive = 'RESTRICTIVE' then '  as restrictive' || chr(10) else '' end
         || '  for ' || lower(cmd) || chr(10)
         || '  to ' || array_to_string(roles, ', ') || chr(10)
         || coalesce('  using (' || qual || ')' || chr(10), '')
         || coalesce('  with check (' || with_check || ')' || chr(10), '')
         || ';',
         chr(10) || chr(10)
         order by cmd, policyname
       ) as script_de_restauration
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
