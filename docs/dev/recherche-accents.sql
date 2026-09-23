-- Recherche insensible aux accents — colonne `search_key`, déclencheur, droits
-- ===========================================================================
-- À LANCER SUR LE DEV D'ABORD (ahdikgckctvduuestzrh), puis en PROD. IDEMPOTENT : le relancer
-- ne fait rien de plus.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ ORDRE NON NÉGOCIABLE : CE SCRIPT PASSE AVANT LE DÉPLOIEMENT DE L'APP.
-- PostgREST refuse toute requête qui NOMME une colonne inexistante. App poussée avant ce script,
-- la recherche de profils tombe pour tout le monde — c'est le piège déjà payé sur `nom-du-tournoi`.
-- Dans l'autre sens il ne se passe rien : la colonne existe et personne ne la lit encore.
--
-- ── LE PROBLÈME (constaté le 16/09/2026)
-- `searchProfiles` fait `ilike '%…%'` sur `pseudo` et `display_name`. `ilike` est insensible à la
-- CASSE, pas aux ACCENTS : « jerome » ne trouve pas « Jérôme », « melanie » ne trouve pas
-- « Mélanie ». Sur une base francophone, c'est un trou dans la seule porte d'entrée qui marche
-- aujourd'hui — celle où l'on tape le nom de quelqu'un qu'on connaît.
--
-- ── POURQUOI UNE COLONNE, ENCORE UNE FOIS
-- Même raisonnement que `recherche-par-nom.sql`, qui a posé `display_name` : on garde la recherche
-- en REQUÊTE CLIENT ORDINAIRE, soumise aux policies existantes de `profiles` (bannissements,
-- blocages, et tout ce qui s'y ajoutera). Une fonction `security definer` devrait réappliquer tout
-- ça à la main. Une fonction `security invoker` aurait marché aussi — mais elle ferait un objet de
-- plus à tenir à jour pour le seul gain de symétrie décrit ci-dessous.
--
-- ── L'ASYMÉTRIE ASSUMÉE ENTRE LES DEUX CÔTÉS
-- Côté base, `unaccent` translittère largement (é→e, ø→o, œ→oe, ß→ss). Côté app, `fold()`
-- (`utils/recherche.ts`) décompose en NFD et retire les signes combinants — donc é→e, mais ø, œ et
-- ß restent tels quels. La base est donc TOUJOURS PLUS repliée que la requête, jamais moins :
--   • taper « jorgen » trouve « Jørgen »  → la base a rangé « jorgen » ;
--   • taper « jørgen » ne le trouve pas   → seul cas perdu, et il suppose d'avoir tapé le « ø ».
-- Aucun faux positif n'est possible dans ce sens. C'est strictement mieux qu'aujourd'hui, où
-- aucun des deux ne marche.
--
-- ── EFFET DE BORD UTILE
-- Une seule colonne contient de quoi chercher le pseudo ET le nom affiché : le filtre `or(...)`
-- construit à la main dans `searchProfiles` disparaît, et avec lui l'échappement des guillemets et
-- des antislashs qu'imposait la grammaire de filtre PostgREST.
--
-- ⚠️ PAS D'INDEX, ET C'EST DÉLIBÉRÉ. Un `%…%` ne sait se servir que d'un index trigramme
-- (`pg_trgm`), c'est-à-dire d'une extension de plus sur la surface de la base. À la taille actuelle
-- le balayage est gratuit. Le jour où `profiles` pèsera, une ligne suffira :
--   create extension if not exists pg_trgm; create index on public.profiles using gin (search_key gin_trgm_ops);
-- ═══════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. L'EXTENSION ────────────────────────────────────────────────────────────────────────
-- Sur Supabase les extensions vivent dans le schéma `extensions`. Si `unaccent` est déjà posée
-- ailleurs (schéma `public` d'une installation plus ancienne), cette ligne ne fait rien et le
-- `search_path` du point 2 la trouvera quand même.
create extension if not exists unaccent with schema extensions;

-- ── 2. LE CALCUL, À UN SEUL ENDROIT ───────────────────────────────────────────────────────
-- Écrit une fois, servi deux fois : par le déclencheur du point 4 et par le contrôle final. Sans
-- ça, le contrôle vérifierait sa propre copie de la règle plutôt que celle qui est en service.
--
-- PAS de `security definer` : la fonction ne lit aucune table, seulement ses deux arguments.
-- `search_path` explicite quand même — une fonction sans search_path fixé est résolue avec celui
-- de l'appelant, donc différemment selon qui l'appelle.
--
-- `stable` et non `immutable` : `unaccent()` dépend d'un dictionnaire, que Postgres considère
-- modifiable. C'est aussi ce qui interdit de l'indexer directement (cf. l'avertissement en tête).
-- Le repliement lui-même, en un seul argument : c'est lui que les contrôles rejouent pour vérifier
-- qu'il a bien tourné (replier deux fois ne change rien, replier zéro fois se voit).
create or replace function public.pokza_fold(p_texte text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select unaccent(lower(coalesce(p_texte, '')))
$$;

create or replace function public.pokza_search_key(p_pseudo text, p_display_name text)
returns text
language sql
stable
set search_path = public
as $$
  select public.pokza_fold(coalesce(p_pseudo, '') || ' ' || coalesce(p_display_name, ''))
$$;

-- ── 3. LA COLONNE ─────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists search_key text;

-- ── 4. LE DÉCLENCHEUR ─────────────────────────────────────────────────────────────────────
-- ⚠️ LE NOM N'EST PAS DÉCORATIF. À timing égal (`before update`), Postgres exécute les
-- déclencheurs dans l'ORDRE ALPHABÉTIQUE de leur nom. Celui-ci lit `new.display_name`, que
-- `profiles_display_name` (posé par `recherche-par-nom.sql`) vient de recalculer :
--   profiles_display_name  <  profiles_search_key       ('d' avant 's')
-- Le renommer, c'est risquer de ranger la clé de recherche à partir d'un nom d'affichage périmé
-- d'une modification. Si un jour il faut vraiment renommer l'un des deux, garder l'ordre.
--
-- Pourquoi un SECOND déclencheur plutôt qu'une ligne ajoutée au premier : le corps réellement en
-- base peut avoir divergé du script du dépôt, et un `create or replace` écraserait la version
-- vivante par celle qu'on croit être là. On ne touche pas à ce qui marche.
create or replace function public.profiles_sync_search_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_key := public.pokza_search_key(new.pseudo, new.display_name);
  return new;
end $$;

drop trigger if exists profiles_search_key on public.profiles;
create trigger profiles_search_key
  before insert or update on public.profiles
  for each row execute function public.profiles_sync_search_key();

-- ── 5. LES LIGNES EXISTANTES ──────────────────────────────────────────────────────────────
-- Un `update` qui ne change rien suffit : le déclencheur du point 4 remplit la colonne. Même
-- ficelle que `recherche-par-nom.sql`, et pour la même raison — le calcul reste à un seul endroit.
update public.profiles set search_key = search_key;

alter table public.profiles alter column search_key set not null;

-- ── 6. DROITS ─────────────────────────────────────────────────────────────────────────────
-- FILTRER sur une colonne exige le droit de la SÉLECTIONNER : sans ce `grant`, `.ilike('search_key')`
-- serait refusé alors même que l'app ne ramène jamais la colonne. Défensif comme celui de
-- `display_name` : sans effet si `profiles` est accordée au niveau table, indispensable si des
-- droits PAR COLONNE y ont été posés (F-21). En lecture seule — le déclencheur écrit, pas le client.
grant select (search_key) on public.profiles to anon, authenticated;
grant execute on function public.pokza_fold(text) to anon, authenticated;
grant execute on function public.pokza_search_key(text, text) to anon, authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE — les 4 lignes doivent toutes dire OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

select 'la colonne search_key existe et est obligatoire' as controle,
       case when count(*) = 1 then 'OK — presente, not null' else 'KO — absente ou nullable' end as resultat
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'search_key' and is_nullable = 'NO'

union all

select 'le declencheur est pose, actif, et passe APRES celui du nom',
       case when bool_or(t.tgname = 'profiles_search_key')
                 and bool_or(t.tgname = 'profiles_display_name')
                 and min(t.tgname) = 'profiles_display_name'
            then 'OK — display_name puis search_key'
            else 'KO — ordre ou declencheur manquant' end
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles'
  and not t.tgisinternal and t.tgenabled = 'O'
  and t.tgname in ('profiles_display_name', 'profiles_search_key')

union all

-- Le vrai contrôle : chaque ligne porte bien ce que la règle en service produirait.
select 'chaque profil porte la cle que la fonction calcule',
       case when count(*) = 0 then 'OK — aucune ligne en retard'
            else 'KO — ' || count(*)::text || ' ligne(s) a recalculer' end
from public.profiles
where search_key is distinct from public.pokza_search_key(pseudo, display_name)

union all

-- Et la preuve que le repliement a bien tourné : le rejouer ne change plus rien. Si l'extension
-- n'avait rien fait, cette ligne serait la seule à s'en apercevoir.
select 'plus aucun accent dans search_key',
       case when count(*) = 0 then 'OK — tout est replie'
            else 'KO — ' || count(*)::text || ' ligne(s) accentuee(s)' end
from public.profiles
where search_key <> public.pokza_fold(search_key);
