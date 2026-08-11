-- Unicité du pseudo insensible à la casse
-- ======================================
-- Aujourd'hui `profiles_pseudo_key UNIQUE (pseudo)` est sensible à la casse : « Victor » et
-- « victor » peuvent coexister (risque d'usurpation/confusion). On remplace cette contrainte par un
-- index unique sur `lower(pseudo)` : la casse d'affichage choisie par le joueur est conservée telle
-- quelle (on stocke « Victor »), mais un second « victor » est refusé.
--
-- Aucun changement côté app : une violation d'index unique lève le même SQLSTATE 23505 que la
-- contrainte actuelle, déjà traduit en « Ce pseudo est déjà pris » à l'inscription comme à l'édition.
--
-- Idempotent, et sûr : on crée le nouvel index AVANT de retirer l'ancienne contrainte. Si des doublons
-- de casse existent déjà, la création échoue et l'ancienne contrainte reste en place (pas de trou).
-- Éditeur SQL : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

-- ── Étape 0 (diagnostic) : lister les collisions de casse existantes ──────────────────────────────
-- Si cette requête renvoie des lignes, résous-les d'abord (renomme l'un des pseudos) : l'étape 1
-- échouerait sinon. Sur une base sans doublon, elle ne renvoie rien et tu peux enchaîner.
select lower(pseudo) as pseudo_normalise, count(*) as nb, array_agg(pseudo) as variantes
from public.profiles
group by lower(pseudo)
having count(*) > 1;

-- ── Étape 1 : index unique insensible à la casse ─────────────────────────────────────────────────
create unique index if not exists profiles_pseudo_lower_key
  on public.profiles (lower(pseudo));

-- ── Étape 2 : retrait de l'ancienne contrainte sensible à la casse ───────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_pseudo_key;
