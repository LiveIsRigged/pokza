-- `posts.visibility` — n'accepter que les trois valeurs que l'app connaît
-- =======================================================================
-- À lancer sur DEV puis PROD. Idempotent.
--
-- POURQUOI (constat P3 de l'audit bug du 15/08, mesuré le 16/08)
-- --------------------------------------------------------------
-- `visibility` est un `text` sans contrainte. `Visibility` côté app (`types/poker.ts`) ne connaît
-- que `public`, `private`, `group` — mais la base accepte n'importe quelle chaîne pour qui appelle
-- l'API directement.
--
-- Ce n'est PAS une fuite, et c'est vérifié : la policy de lecture est écrite en POSITIF
-- (`visibility = 'public'` OU auteur OU membre du groupe), donc une valeur inventée ne coche
-- aucune case et la main devient invisible pour tout le monde sauf son auteur. Quelqu'un ne peut
-- donc rien s'offrir de plus qu'un `private`, qui est déjà à sa disposition. D'où le P3.
--
-- Ce que ça coûte quand même, et la vraie raison de fermer : c'est un piège DORMANT. Le jour où
-- une requête filtre `where visibility = 'private'` pour compter, purger ou exporter, ces lignes
-- passent au travers sans que rien ne le signale. Une contrainte coûte une ligne et supprime la
-- classe entière de problèmes.
--
-- MÉTHODE — même que le lot 6 : on pose la contrainte en `not valid` (elle s'applique aux
-- écritures FUTURES sans bloquer sur l'existant), on inventorie les lignes déjà en base, et on ne
-- la valide QUE si l'inventaire est à zéro. Aucun risque de rejet au milieu d'une migration.
--
-- Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

do $$
declare
  hors_norme int;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_visibility_valide' and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_visibility_valide
      check (visibility in ('public', 'private', 'group')) not valid;
    raise notice 'Contrainte posée (not valid).';
  else
    raise notice 'Contrainte déjà présente, rien à ajouter.';
  end if;

  select count(*) into hors_norme
  from public.posts
  where visibility is null or visibility not in ('public', 'private', 'group');

  if hors_norme = 0 then
    alter table public.posts validate constraint posts_visibility_valide;
    raise notice 'Inventaire à zéro : contrainte VALIDÉE, elle couvre aussi l''historique.';
  else
    raise notice 'ATTENTION : % ligne(s) hors norme. Contrainte laissée en not valid — les corriger d''abord, puis relancer ce script.', hors_norme;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — deux questions, deux verdicts. Attendu : OK / OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

select '1. contrainte posee ET validee (couvre l historique)' as controle,
       coalesce(string_agg(case when convalidated then 'validee' else 'not valid' end, ', '), 'absente') as etat,
       case when count(*) = 1 and bool_and(convalidated) then 'OK' else 'KO' end as verdict
from pg_constraint
where conname = 'posts_visibility_valide' and conrelid = 'public.posts'::regclass
union all
select '2. lignes existantes hors des trois valeurs',
       count(*)::text,
       case when count(*) = 0 then 'OK' else 'KO' end
from public.posts
where visibility is null or visibility not in ('public', 'private', 'group')
order by 1;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- alter table public.posts drop constraint posts_visibility_valide;
