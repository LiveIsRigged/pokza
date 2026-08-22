-- ============================================================================
-- NOTIFICATIONS DES MAINS DE GROUPE — garde-fou + interrupteur séparé (lot C).
-- À TESTER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent : rejouable sans risque, le tout dans une transaction.
--
-- POURQUOI. `notify_group_posted` notifiait CHAQUE membre à CHAQUE main, sans aucune limite —
-- alors que son jumeau `notify_friend_posted` en a une depuis le début. Le cas nominal du produit
-- est la session live, où l'on enregistre plusieurs mains dans la même soirée : à dix dans un home
-- game, un joueur qui poste huit mains produisait 72 notifications en trois heures.
--
-- VALEURS ARBITRÉES par Victor le 2026-08-22 :
--   • amis   : 12 h, inchangé — et par ami-AUTEUR (dix amis qui postent = dix notifications) ;
--   • groupes : 2 h, par GROUPE et non par auteur. Ce qui compte est « il s'est passé quelque
--     chose dans ce groupe-là », pas qui l'a fait : deux membres qui postent coup sur coup ne
--     produisent qu'une notification.
--   • deux lignes distinctes dans Réglages > Notifications, pour couper les groupes sans perdre
--     les mains d'amis.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE. Le garde-fou vit dans le DÉCLENCHEUR, donc les mains sautées ne sont pas
-- seulement non poussées : elles ne sont pas écrites du tout, et n'apparaîtront jamais dans la
-- liste in-app. C'est un choix, pris en connaissance de cause après discussion. Le jour où l'on
-- veut « Julien a partagé 3 mains », il faudra déplacer la limite dans `send-push` et laisser le
-- déclencheur tout écrire.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. L'interrupteur des mains de groupe
--    `posted` GARDE son sens historique (mains d'amis) plutôt que d'être renommée : les joueurs
--    qui l'ont déjà réglée conservent leur choix, et rien à migrer.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.notification_prefs
  add column if not exists posted_groups boolean not null default true;

comment on column public.notification_prefs.posted is
  'Push des mains publiées par un ami (friend_posted). Ne couvre plus les groupes depuis le 22/08.';
comment on column public.notification_prefs.posted_groups is
  'Push des mains publiées dans un groupe privé (group_posted).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Le garde-fou, calqué sur `notify_friend_posted`
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_group_posted()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
begin
  if new.visibility <> 'group' or new.group_id is null then
    return new;
  end if;

  insert into notifications (recipient_id, actor_id, type, post_id, group_id)
  select gm.user_id, new.author_id, 'group_posted', new.id, new.group_id
  from group_members gm
  where gm.group_id = new.group_id
    and gm.status = 'accepted'
    and gm.user_id <> new.author_id
    -- Pas de `actor_id` dans cette condition, contrairement aux amis : la fenêtre est par GROUPE.
    -- Deux membres qui postent coup sur coup ne réveillent le groupe qu'une fois.
    and not exists (
      select 1
      from notifications n
      where n.recipient_id = gm.user_id
        and n.type = 'group_posted'
        and n.group_id = new.group_id
        and n.created_at > now() - interval '2 hours'
    );

  return new;
end;
$function$;

commit;

notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'notification_prefs'
--   order by ordinal_position;
--
-- Et le garde-fou, en conditions réelles : publier DEUX mains dans le même groupe à moins de
-- deux heures d'écart, puis compter ce qu'ont reçu les autres membres — une seule ligne attendue.
--   select recipient_id, count(*)
--   from public.notifications
--   where type = 'group_posted' and group_id = '<id du groupe>'
--     and created_at > now() - interval '2 hours'
--   group by recipient_id;
-- ────────────────────────────────────────────────────────────────────────────
