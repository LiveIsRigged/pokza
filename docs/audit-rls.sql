-- Audit RLS avant ouverture au public.
--
-- Pourquoi c'est le point de sécurité central : la clé `EXPO_PUBLIC_SUPABASE_ANON_KEY` est inlinée
-- en clair dans le bundle JavaScript servi à tout le monde. N'importe qui peut l'extraire et
-- interroger l'API directement, sans passer par l'app. Toute la sécurité repose donc sur les
-- politiques RLS côté Postgres, pas sur le code de l'app.
--
-- À coller dans le SQL editor :
-- https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Ne modifie RIEN : ne lit que des métadonnées. Une seule requête, un seul tableau de résultats
-- (l'éditeur Supabase n'affiche que le résultat de la dernière instruction, d'où le union all).
-- Tout ce qui est préfixé de *** demande une vérification.

-- 1) RLS actif ou non par table. Une table sans RLS est lisible ET modifiable par n'importe qui
--    muni de la clé publique : c'est la ligne la plus importante de l'audit.
select
  '1-RLS'                                     as categorie,
  c.relname::text                             as objet,
  case when c.relrowsecurity then 'RLS actif'
       else '*** RLS INACTIF - table ouverte ***' end as etat,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname)::text || ' policies' as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'

union all

-- 2) Détail des politiques : vérifier qu'elles cadrent sur auth.uid(). Une condition de lecture
--    valant simplement `true` ouvre la table à tout le monde — parfois voulu (profils publics),
--    souvent non (notifications, membres de groupes privés).
select
  '2-POLICY',
  (tablename || ' / ' || policyname)::text,
  cmd::text,
  ('lecture: ' || coalesce(qual, '-') || '  |  ecriture: ' || coalesce(with_check, '-'))::text
from pg_policies
where schemaname = 'public'

union all

-- 3) LE PIÈGE DES VUES. Une vue n'a pas de RLS propre : par défaut elle s'exécute avec les droits
--    de son propriétaire et CONTOURNE le RLS des tables qu'elle lit. Il faut security_invoker=true
--    (PG15+). L'app lit 5 vues — si l'une est à false, elle peut exposer les mains de groupes
--    privés ou les notifications d'autrui malgré un RLS correct sur les tables.
select
  '3-VUE',
  c.relname::text,
  coalesce(
    (select option_value from pg_options_to_table(c.reloptions)
       where option_name = 'security_invoker'),
    '*** security_invoker absent - CONTOURNE le RLS ***'
  )::text,
  ('proprietaire: ' || pg_get_userbyid(c.relowner))::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')

union all

-- 4) Fonctions SECURITY DEFINER : elles ignorent le RLS et doivent donc filtrer sur auth.uid()
--    dans leur corps. delete_own_account en fait partie.
select
  '4-FONCTION-SECDEF',
  p.proname::text,
  'security definer',
  ('args: ' || coalesce(nullif(pg_get_function_identity_arguments(p.oid), ''), 'aucun'))::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef = true

order by 1, 2;
