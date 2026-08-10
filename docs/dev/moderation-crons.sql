-- ============================================================================
-- MODÉRATION — purges différées (pg_cron). Complète le principe « jamais de
-- suppression physique immédiate » : on masque/retire vite (mod_status), et la
-- suppression réelle vient plus tard, automatiquement.
--   • Signalements résolus  : supprimés 12 mois après résolution (9.2)
--   • Contenus « removed »   : supprimés physiquement 30 jours après masquage (9.3)
--
-- À rejouer d'abord sur le DEV (+ moderation-crons-test.sql pour valider la
-- logique sur des lignes antidatées), puis sur la PROD.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Idempotent (CREATE OR REPLACE + reprogrammation des jobs par nom).
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Fonctions de purge (SECURITY DEFINER : contournent la RLS pour supprimer,
--    renvoient le nombre de lignes supprimées pour le suivi via job_run_details).
-- ────────────────────────────────────────────────────────────────────────────

-- 1.1 Signalements résolus depuis > 12 mois. Les signalements 'open'/'reviewing'
--     ne sont JAMAIS purgés (non traités = pas de resolved_at).
create or replace function public.purge_resolved_reports()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.reports
   where status in ('actioned','dismissed')
     and resolved_at is not null
     and resolved_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 1.2 Contenus retirés depuis > 30 jours : suppression physique. Retirer une main
--     supprime en cascade ses commentaires/likes/votes (FK on delete cascade) ;
--     on purge d'abord les commentaires retirés isolément (sur des mains encore
--     visibles), puis les mains retirées.
create or replace function public.purge_removed_content()
returns integer language plpgsql security definer set search_path = public as $$
declare n_posts integer; n_comments integer;
begin
  delete from public.comments
   where mod_status = 'removed'
     and removed_at is not null
     and removed_at < now() - interval '30 days';
  get diagnostics n_comments = row_count;

  delete from public.posts
   where mod_status = 'removed'
     and removed_at is not null
     and removed_at < now() - interval '30 days';
  get diagnostics n_posts = row_count;

  return n_posts + n_comments;
end;
$$;

-- Ces fonctions ne sont appelées que par le cron (rôle postgres) : personne d'autre.
revoke all on function public.purge_resolved_reports()  from public, anon, authenticated;
revoke all on function public.purge_removed_content()   from public, anon, authenticated;

commit;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Planification pg_cron (hors transaction). Si `create extension` échoue faute
--    de droits dans l'éditeur, active pg_cron via Dashboard → Database →
--    Extensions, puis relance à partir d'ici.
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

-- Reprogrammation idempotente : on retire l'ancien job s'il existe, puis on (re)crée.
do $$ begin perform cron.unschedule('purge_resolved_reports'); exception when others then null; end $$;
select cron.schedule('purge_resolved_reports', '0 3 * * *',  $$select public.purge_resolved_reports();$$);

do $$ begin perform cron.unschedule('purge_removed_content'); exception when others then null; end $$;
select cron.schedule('purge_removed_content', '30 3 * * *', $$select public.purge_removed_content();$$);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Vérif : les deux jobs sont planifiés et actifs (tous les jours ~3h UTC).
-- ────────────────────────────────────────────────────────────────────────────
select jobname, schedule, active
from cron.job
where jobname in ('purge_resolved_reports','purge_removed_content')
order by jobname;
