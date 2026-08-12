-- Table des abonnements Web Push
-- ================================
-- Un joueur peut avoir plusieurs abonnements (un par navigateur/appareil installé). L'`endpoint`
-- (URL du service de push du navigateur) identifie de façon unique un abonnement → clé primaire.
-- L'Edge Function `send-push` (service_role) lit ces lignes pour envoyer ; le client n'accède qu'aux
-- siennes (RLS).
--
-- Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (À lancer sur les DEUX, comme d'habitude — teste sur DEV d'abord.)

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Chacun ne voit / gère que ses propres abonnements. (Le service_role de l'Edge Function ignore la
-- RLS et peut donc tout lire pour envoyer.)
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
