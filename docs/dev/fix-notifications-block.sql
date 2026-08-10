-- ============================================================================
-- Constat #2 : une notification dont l'acteur est bloqué (ex. « X veut devenir
-- ami ») restait visible après un blocage. On filtre désormais les notifications
-- par blocage MUTUEL, comme le feed (posts_ranked utilise déjà is_blocked_pair).
--
-- IMPORTANT : les notifications de MODÉRATION restent TOUJOURS visibles — bloquer
-- un compte admin ne doit jamais masquer un avis de modération.
--
-- À lancer sur DEV d'abord (test), puis sur PROD.
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Re-jouable (drop/create de la policy).
-- ============================================================================

drop policy if exists "Chacun lit ses propres notifications" on public.notifications;

create policy "Chacun lit ses propres notifications" on public.notifications
  for select using (
    recipient_id = auth.uid()
    and (
      -- Avis de modération : toujours délivrés, peu importe un éventuel blocage de l'admin.
      type in ('report_resolved', 'content_removed', 'account_sanctioned')
      -- Notifications sociales : masquées si l'acteur est bloqué (mutuel).
      or not public.is_blocked_pair(auth.uid(), actor_id)
    )
  );

-- Contrôle : la policy existe bien avec la nouvelle expression.
select polname,
       pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid = 'public.notifications'::regclass
  and polname = 'Chacun lit ses propres notifications';
