-- ============================================================================
-- MISE EN PLACE de la vérification des correctifs #1 et #2, sur DEV.
-- (Contient aussi la migration #2 pour tester d'un bloc ; la version canonique
--  à passer en PROD reste docs/dev/fix-notifications-block.sql — même policy.)
--
-- Après ce script : je vérifie dans l'app, PUIS on restaure avec seed-fix-hands.sql.
-- SQL editor DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- ============================================================================

-- ── #2 : policy notifications filtrée par blocage (modération toujours visible) ──
drop policy if exists "Chacun lit ses propres notifications" on public.notifications;
create policy "Chacun lit ses propres notifications" on public.notifications
  for select using (
    recipient_id = auth.uid()
    and (
      type in ('report_resolved', 'content_removed', 'account_sanctioned')
      or not public.is_blocked_pair(auth.uid(), actor_id)
    )
  );

-- ── #1 : casse VOLONTAIREMENT la main de Carol (stub non rendable) pour voir la
--         barrière d'erreur isoler SA carte sans blanchir le feed. ────────────
update public.posts
set hand = '{"variant":"nlhe","gameType":"cash"}'::jsonb
where id = '0c570000-0000-0000-0000-000000000003'; -- Main Carol

-- ── #2 : re-bloque Alice→Bob (le test précédent l'avait débloqué) pour re-tester
--         le masquage chez Bob de la notif « alice veut devenir ami ». ────────
insert into public.blocks (blocker_id, blocked_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')
on conflict do nothing;

select 'setup OK' as info,
       (select jsonb_array_length(hand->'seats') from public.posts
          where id = '0c570000-0000-0000-0000-000000000003') as carol_seats_should_be_null,
       (select count(*) from public.blocks
          where blocker_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and blocked_id = 'bbbbbbbb-0000-0000-0000-000000000002') as alice_blocks_bob;
