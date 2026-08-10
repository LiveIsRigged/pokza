-- ============================================================================
-- TEST DEV des fonctions de purge — À LANCER SUR LE DEV UNIQUEMENT, en mode
-- "without RLS" (rôle postgres), APRÈS moderation-crons.sql + seed.sql.
--   https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- On ne peut pas attendre 30 jours / 12 mois : on insère des lignes ANTIDATÉES,
-- on appelle les fonctions de purge à la main, et on vérifie que :
--   • ce qui dépasse la rétention est supprimé,
--   • ce qui est encore dans la fenêtre est conservé (test de la BORNE).
-- Rejouable (nettoie ses propres lignes avant et après). Réussite = cellule finale
-- « 7/7 OK » ; en cas d'échec, le script s'arrête sur l'assertion fautive.
-- ============================================================================

do $$
declare
  alice constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';  -- compte fictif du seed
  p_host  constant uuid := 'c0570000-0000-0000-0000-000000000010';
  p_old   constant uuid := 'c0570000-0000-0000-0000-000000000011';
  p_fresh constant uuid := 'c0570000-0000-0000-0000-000000000012';
  cm_old   constant uuid := 'c0570000-0000-0000-0000-000000000021';
  cm_fresh constant uuid := 'c0570000-0000-0000-0000-000000000022';
  r_old   constant uuid := 'c0570000-0000-0000-0000-000000000001';
  r_fresh constant uuid := 'c0570000-0000-0000-0000-000000000002';
begin
  -- ── Nettoyage préalable (idempotence) ───────────────────────────────────────
  delete from public.reports  where id in (r_old, r_fresh);
  delete from public.comments where id in (cm_old, cm_fresh);
  delete from public.posts    where id in (p_host, p_old, p_fresh);

  -- ── Lignes antidatées ───────────────────────────────────────────────────────
  insert into public.posts (id, author_id, title, hand, visibility, mod_status, removed_at) values
    (p_host,  alice, 'cron-test hôte',   '{"variant":"nlhe","gameType":"cash"}', 'public', 'visible', null),
    (p_old,   alice, 'cron-test retiré ancien', '{"variant":"nlhe","gameType":"cash"}', 'public', 'removed', now() - interval '31 days'),
    (p_fresh, alice, 'cron-test retiré récent', '{"variant":"nlhe","gameType":"cash"}', 'public', 'removed', now() - interval '5 days');

  insert into public.comments (id, post_id, author_id, body, mod_status, removed_at) values
    (cm_old,   p_host, alice, 'commentaire retiré ancien', 'removed', now() - interval '31 days'),
    (cm_fresh, p_host, alice, 'commentaire retiré récent', 'removed', now() - interval '5 days');

  insert into public.reports (id, reporter_id, source, target_type, target_id, reason, status, resolved_at) values
    (r_old,   alice, 'app', 'post', 'd0570000-0000-0000-0000-000000000001', 'spam', 'dismissed', now() - interval '13 months'),
    (r_fresh, alice, 'app', 'post', 'd0570000-0000-0000-0000-000000000002', 'spam', 'actioned',  now() - interval '1 month');

  -- ── Purges ──────────────────────────────────────────────────────────────────
  perform public.purge_resolved_reports();
  perform public.purge_removed_content();

  -- ── Assertions (7) ──────────────────────────────────────────────────────────
  if     exists (select 1 from public.reports  where id = r_old)   then raise exception 'FAIL 1 : signalement résolu > 12 mois NON purgé'; end if;
  if not exists (select 1 from public.reports  where id = r_fresh) then raise exception 'FAIL 2 : signalement résolu récent purgé à tort'; end if;
  if     exists (select 1 from public.posts    where id = p_old)   then raise exception 'FAIL 3 : main retirée > 30 j NON purgée'; end if;
  if not exists (select 1 from public.posts    where id = p_fresh) then raise exception 'FAIL 4 : main retirée récente purgée à tort'; end if;
  if     exists (select 1 from public.comments where id = cm_old)  then raise exception 'FAIL 5 : commentaire retiré > 30 j NON purgé'; end if;
  if not exists (select 1 from public.comments where id = cm_fresh)then raise exception 'FAIL 6 : commentaire retiré récent purgé à tort'; end if;
  if not exists (select 1 from public.posts    where id = p_host)  then raise exception 'FAIL 7 : main hôte visible supprimée à tort'; end if;

  -- ── Nettoyage final ─────────────────────────────────────────────────────────
  delete from public.reports  where id in (r_fresh);
  delete from public.comments where id in (cm_fresh);
  delete from public.posts    where id in (p_host, p_fresh);
end $$;

select 'CRON PURGE TEST : 7/7 OK — rétention 12 mois (signalements) et 30 j (contenus retirés) validée, bornes comprises' as resultat;
