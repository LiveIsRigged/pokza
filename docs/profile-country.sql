-- Pays du joueur sur le profil
-- ============================
-- Ajoute une colonne `country` à `profiles` : code ISO 3166-1 alpha-2 (« FR », « BE »…), à partir
-- duquel l'app dérive le drapeau (émoji) et le nom du pays à l'affichage. Facultatif (NULL = non
-- renseigné). Champ public, modifiable par son propriétaire via la RLS `profiles` déjà en place
-- (même chemin que pseudo/bio/variante) — aucune policy à ajouter.
--
-- Idempotent : relançable sans risque (add column if not exists + drop/add constraint).
-- Éditeur SQL : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

alter table public.profiles
  add column if not exists country text;

-- Garde-fou de format : soit NULL, soit exactement deux lettres majuscules (code ISO). Empêche
-- qu'une valeur libre ou un nom complet ne se glisse dans la colonne.
alter table public.profiles
  drop constraint if exists profiles_country_check;
alter table public.profiles
  add constraint profiles_country_check
  check (country is null or country ~ '^[A-Z]{2}$');
