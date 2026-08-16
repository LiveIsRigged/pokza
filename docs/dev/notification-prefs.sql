-- Préférences de notifications push, par famille
-- ================================================
-- Écran Réglages (menu latéral) : un joueur peut couper le push par famille sans toucher à
-- l'historique in-app, qui reste toujours complet (décision produit du 16/08). Une ligne par
-- utilisateur ; son ABSENCE veut dire « tout activé » (valeurs par défaut), donc `send-push` ne
-- doit filtrer que s'il trouve une ligne — pas de migration de données à faire.
--
-- Familles couvertes (mapping exact dans `send-push/index.ts` et `notificationPrefs.ts`) :
--   likes    → post_like, comment_like
--   comments → post_comment, comment_reply
--   friends  → friend_request, friend_accept                (social uniquement)
--   groups   → group_invite, group_accept                   (social uniquement)
--   posted   → friend_posted, group_posted                  (mains partagées — interrupteur séparé,
--                                                              demandé le 16/08 après coup)
-- La modération (report_resolved, content_removed, account_sanctioned) n'a PAS d'interrupteur :
-- toujours envoyée, comme aujourd'hui.
--
-- Ce script a déjà tourné une première fois sans la colonne `posted` (DEV+PROD, 16/08) : le
-- `alter table … add column if not exists` ci-dessous rattrape les installations existantes sans
-- perdre les préférences déjà enregistrées.
--
-- Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (DEV d'abord, PROD ensuite — comme d'habitude.)
--
-- Ce script est IDEMPOTENT.

create table if not exists public.notification_prefs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  likes      boolean not null default true,
  comments   boolean not null default true,
  friends    boolean not null default true,
  groups     boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs add column if not exists posted boolean not null default true;

alter table public.notification_prefs enable row level security;

-- Chacun ne voit / gère que sa propre ligne. Le service_role de `send-push` ignore la RLS.
drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own" on public.notification_prefs
  for select using (auth.uid() = user_id);

drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert with check (auth.uid() = user_id);

drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own" on public.notification_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Vérification (lecture seule)
select 'Table notification_prefs' as controle,
       case when to_regclass('public.notification_prefs') is not null then 'OK' else 'ECHEC' end as resultat
union all
select 'RLS activée',
       case when relrowsecurity then 'OK' else 'ECHEC' end
from pg_class where relname = 'notification_prefs'
union all
select '3 policies en place',
       case when count(*) = 3 then 'OK' else 'ECHEC : ' || count(*)::text || '/3' end
from pg_policies where tablename = 'notification_prefs'
union all
select 'Colonne posted présente',
       case when count(*) = 1 then 'OK' else 'ECHEC' end
from information_schema.columns
where table_schema = 'public' and table_name = 'notification_prefs' and column_name = 'posted';
