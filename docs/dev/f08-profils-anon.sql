-- ============================================================================
-- F-08 REFERMÉ (pour la deuxième fois) — `anon` ne lit plus une seule colonne de `profiles`
--
-- À JOUER SUR LA PROD EN PREMIER, pour une fois : le trou y est ouvert et vérifié.
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- Idempotent, tout en transaction.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QU'ON A MESURÉ LE 23/09/2026
--
-- Le contrôle 5 d'`invitation-profil.sql` est sorti en KO sur la PROD : « 2 colonne(s) lisibles
-- par anon ». Vérifié depuis l'extérieur, avec la seule clé publique de l'app, sans aucun compte :
--
--     GET /rest/v1/profiles?select=display_name&limit=5
--     → [{"display_name":"…"}, {"display_name":"… …"}, … ]   200 OK
--
-- Toute la liste des membres, avec leurs noms réels pour ceux qui affichent leur nom, aspirable
-- en une requête par qui possède l'adresse du projet. C'est mot pour mot le constat F-08 de
-- l'audit du 14/08, refermé le 15/08 par `profils-lecture-connectes.sql`.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COMMENT IL S'EST ROUVERT, ET POURQUOI ÇA RECOMMENCERA SI ON N'Y PREND PAS GARDE
--
--   15/08  `profils-lecture-connectes.sql` retire à `anon` le droit de lire les colonnes de
--          `profiles`, une par une (les droits avaient été posés PAR COLONNE par le lot 5).
--   23/08  `recherche-par-nom.sql` ajoute la colonne `display_name` et termine par
--             grant select (display_name) on public.profiles to anon, authenticated;
--          avec ce commentaire : « Défensif : … indispensable si des droits PAR COLONNE y ont été
--          posés — une nouvelle colonne ne serait alors lisible par personne. » Le raisonnement
--          est juste pour `authenticated`. Il est faux pour `anon`, à qui on venait justement de
--          tout retirer huit jours plus tôt.
--   23/09  `recherche-accents.sql` ajoute `search_key` et RECOPIE la même ligne.
--
-- LA LEÇON, la seule qui compte : **une nouvelle colonne sur `profiles` se donne à
-- `authenticated`, JAMAIS à `anon`.** Pokza est entièrement derrière une connexion ; aucun écran
-- sans compte ne lit cette table.
--
-- ⚠️ CE QUI CONTINUE DE MARCHER, et c'est la raison pour laquelle ce script ne casse rien :
-- les deux pages d'accueil qu'un visiteur sans compte peut atteindre ne lisent PAS `profiles`.
-- Elles passent par `group_link_preview` et `profile_invite_preview`, toutes deux
-- `security definer` : ces fonctions s'exécutent avec les droits de leur propriétaire, pas avec
-- ceux de `anon`. Le contrôle 3 le revérifie plutôt que de le supposer.
-- ============================================================================

begin;

-- Les deux colonnes rendues « défensivement ». `authenticated` les garde : entre membres, se voir
-- est le produit lui-même — et sans `search_key` la recherche sans accents ne trouve plus rien.
revoke select (display_name) on public.profiles from anon;
revoke select (search_key)   on public.profiles from anon;

-- Ceinture et bretelles : si un droit avait été posé au niveau de la TABLE entre-temps, les deux
-- lignes ci-dessus ne l'auraient pas touché (droits par colonne et droit de table sont deux
-- choses distinctes — c'est ce qui avait déjà piégé le lot 5).
revoke select on table public.profiles from anon;

-- Et pour l'avenir : les colonnes créées plus tard dans ce schéma ne seront pas lisibles par
-- défaut. Ça ne remplace pas la règle ci-dessus, ça rattrape l'oubli.
alter default privileges in schema public revoke select on tables from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'anon ne lit plus AUCUNE colonne de profiles',
      (select case when count(*) = 0 then 'OK'
                   else 'KO — reste : ' || string_agg(column_name, ', ') end
         from information_schema.column_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT')),
  (2, 'anon n''a pas non plus le droit au niveau de la table',
      (select case when count(*) = 0 then 'OK' else 'KO — droit de table encore la' end
         from information_schema.table_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT')),
  (3, 'les 2 apercus sans compte restent en security definer',
      (select case when count(*) = 2 then 'OK — ils ignorent les droits de anon'
                   else 'KO — ' || count(*) || ' sur 2' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.proname in ('group_link_preview', 'profile_invite_preview'))),
  (4, 'un membre connecte garde display_name ET search_key',
      (select case when count(*) = 2 then 'OK'
                   else 'KO — la recherche va casser : ' || count(*) || ' sur 2' end
         from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT' and column_name in ('display_name', 'search_key'))),
  (5, 'ce que anon peut ENCORE lire ailleurs (a relire, pas forcement anormal)',
      (coalesce((select string_agg(distinct table_name, ', ' order by table_name)
                   from information_schema.column_privileges
                  where grantee = 'anon' and table_schema = 'public'
                    and privilege_type = 'SELECT'), 'rien')
       || ' / tables entieres : '
       || coalesce((select string_agg(distinct table_name, ', ' order by table_name)
                      from information_schema.table_privileges
                     where grantee = 'anon' and table_schema = 'public'
                       and privilege_type = 'SELECT'), 'aucune')))
) as t(n, controle, resultat);

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- APRÈS COUP, DEPUIS L'EXTÉRIEUR — la seule vérification qui prouve vraiment quelque chose.
-- À lancer dans un terminal, avec l'adresse du projet et sa clé publique (celles de l'app) :
--
--     curl -s -o /dev/null -w '%{http_code}\n' \
--       "<URL>/rest/v1/profiles?select=display_name&limit=1" -H "apikey: <CLE_ANON>"
--
-- ATTENDU : 401 ou 403, plus jamais 200 avec une liste de noms.
-- ════════════════════════════════════════════════════════════════════════════
