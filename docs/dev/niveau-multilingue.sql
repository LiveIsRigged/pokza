-- LE NIVEAU DE BLINDES TIENT DANS TOUTES LES LANGUES
-- ==================================================
-- Posé le 25/09/2026, en ouvrant Pokza à d'autres langues.
--
-- ⚠️ ORDRE : DEV d'abord, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Script IDEMPOTENT. Ne modifie AUCUNE donnée existante, et n'en refuse aucune : la nouvelle
-- contrainte est PLUS PERMISSIVE que l'ancienne. Tout ce qui passait passe encore.
--
--
-- POURQUOI
-- --------
-- `posts.level` ne contient pas un nombre mais la chaîne complète — « Niveau 12 ». Depuis le
-- 25/09/2026, cette chaîne est TRADUITE : elle est écrite dans la langue de son auteur, par le
-- créateur comme par l'import, à partir d'une seule clé de catalogue (`commun.niveau_valeur`).
--
-- Le plafond de 10 avait été calculé sur le mot FRANÇAIS : « Niveau » (7 avec l'espace) + 3
-- chiffres, le niveau ne dépassant jamais 999 en tournoi. Les quatre langues livrées jusqu'ici
-- tiennent dans ces 10 — mais par chance, pas par construction : « Niveau » se trouve être le plus
-- long des quatre. Mesuré sur les langues en cours d'ajout :
--
--     fr  « Niveau 999 »   10     déjà à la limite exacte
--     en  « Level 999 »     9
--     de  « Level 999 »     9
--     es  « Nivel 999 »     9
--     it  « Livello 999 »  11     ← DÉPASSE
--     ru  « Уровень 999 »  11     ← DÉPASSE
--     el  « Επίπεδο 999 »  11     ← DÉPASSE
--     pl  « Poziom 999 »   10     à la limite exacte
--     nl  « Niveau 999 »   10     à la limite exacte
--
-- Ce que coûtait le dépassement n'est PAS une troncature : c'est un REFUS D'INSERTION. Une main
-- italienne de niveau 100+ ne se publierait pas, sur une erreur de contrainte que personne
-- n'aurait relié à une traduction. Le défaut serait invisible jusqu'au premier joueur italien.
--
-- 16 plutôt que 12 : c'est déjà la valeur de `buy_in` dans la MÊME contrainte, ce qui évite un
-- troisième nombre arbitraire à tenir. La marge couvre les langues à préfixe long (« Επίπεδο »,
-- « Nivelul », « Blindstufe ») sans qu'on ait à repasser ici à chaque ajout.
--
-- ⚠️ CE NOMBRE A UN JUMEAU dans `pokza-app/src/constants/limits.ts` (LEVEL_MAX_LENGTH_BASE), et un
-- contrôle bloquant dans `scripts/i18n-audit.js` (PLAFOND_BASE) qui refuse toute langue dont la
-- forme dépasse. Les trois doivent rester identiques. C'est ce contrôle qui a levé le problème.

begin;

-- La contrainte est reposée ENTIÈRE : elle couvre trois colonnes, et `add constraint` ne sait pas
-- en modifier une seule. `location` et `buy_in` ne bougent pas.
alter table public.posts drop constraint if exists posts_context_length;
alter table public.posts add  constraint posts_context_length
  check (
        (location is null or char_length(location) <= 40)
    and (buy_in   is null or char_length(buy_in)   <= 16)
    and (level    is null or char_length(level)    <= 16)
  ) not valid;

commit;


-- CONTRÔLES
-- ---------
-- Chacun rend OK ou KO. Tout doit être OK.

-- 1. La contrainte existe, et elle porte bien 16 pour le niveau.
select '1. contrainte posée à 16' as controle,
       case when pg_get_constraintdef(oid) like '%char_length(level) <= 16%'
            then 'OK' else 'KO — ' || pg_get_constraintdef(oid) end as resultat
  from pg_constraint
 where conname = 'posts_context_length'
   and conrelid = 'public.posts'::regclass;

-- 2. Les deux autres colonnes n'ont pas bougé au passage.
select '2. lieu 40 et buy-in 16 intacts' as controle,
       case when pg_get_constraintdef(oid) like '%char_length(location) <= 40%'
             and pg_get_constraintdef(oid) like '%char_length(buy_in) <= 16%'
            then 'OK' else 'KO' end as resultat
  from pg_constraint
 where conname = 'posts_context_length'
   and conrelid = 'public.posts'::regclass;

-- 3. Aucune donnée existante n'est devenue non conforme — la contrainte s'est DESSERRÉE, donc
--    ce contrôle doit rester vide par construction. Il est là pour le dire, pas pour en douter.
select '3. aucune ligne hors limites' as controle,
       case when count(*) = 0 then 'OK' else 'KO — ' || count(*) || ' ligne(s)' end as resultat
  from public.posts
 where char_length(coalesce(location, '')) > 40
    or char_length(coalesce(buy_in, ''))   > 16
    or char_length(coalesce(level, ''))    > 16;

-- 4. Ce qui EST stocké aujourd'hui, pour mémoire : les niveaux existants restent en français, ce
--    sont des données déjà écrites. Seules les nouvelles mains suivent la langue de leur auteur.
select '4. niveaux déjà en base' as controle,
       coalesce(
         (select string_agg(distinct level, ' | ' order by level)
            from public.posts where level is not null),
         '(aucun)'
       ) as resultat;

-- ⚠️ PAS DE CONTRÔLE PAR INSERTION D'ESSAI, et c'est délibéré. Écrire une main jetable pour
-- prouver que « Livello 999 » passe reviendrait à toucher `posts` en PRODUCTION — avec des
-- déclencheurs (`posts_set_language`), de la RLS et un rollback à réussir — pour n'apprendre RIEN
-- de plus que le contrôle 1 : celui-ci lit la définition VIVANTE de la contrainte dans le
-- catalogue de Postgres, ce qui EST la preuve. Un test qui ajoute du risque sans ajouter
-- d'information n'est pas un test.
