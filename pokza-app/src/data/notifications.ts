import { supabase } from '../lib/supabase';
import { fetchDisplayNames } from './profiles';

export type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'comment_reply'
  | 'comment_like'
  | 'friend_request'
  | 'friend_accept'
  | 'friend_posted'
  | 'group_invite'
  | 'group_accept'
  | 'group_posted'
  // Au fondateur, quand un MEMBRE invite quelqu'un (« Paul a invité Kevin dans Miami 2026 ») et
  // quand quelqu'un entre par le lien d'un membre (« Kevin a rejoint Miami 2026 grâce à Paul »).
  // Toutes deux nomment une SECONDE personne, portée par `subject_id` (cf. `subjectName`).
  | 'group_member_invited'
  | 'group_member_joined'
  // Notifications de modération (accusé de traitement 2.6, retrait de contenu, sanction 4.4).
  // L'« acteur » est un admin — volontairement présenté comme « la modération », jamais nommé.
  | 'report_resolved'
  | 'content_removed'
  | 'account_sanctioned';

// Forme exacte renvoyée par la vue `notifications_feed` : nom/avatar de l'auteur de l'action et
// titre/lieu de la main déjà résolus côté base, comme pour `posts_feed`.
interface NotificationRow {
  id: string;
  type: NotificationType;
  actor_id: string;
  actor_name: string;
  actor_avatar_url: string | null;
  post_id: string | null;
  post_title: string | null;
  post_location: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
  group_id: string | null;
  group_name: string | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  actorId: string;
  actorName: string;
  actorAvatarUrl?: string;
  postId?: string;
  postTitle?: string;
  postLocation?: string;
  commentId?: string;
  groupId?: string;
  groupName?: string;
  /** La seconde personne des deux notifications de groupe ci-dessus : l'invité pour
   *  `group_member_invited`, celui qui a envoyé le lien pour `group_member_joined`. Absente pour
   *  les autres types — et aussi si sa relecture a échoué : l'écran dit alors « Quelqu'un ». */
  subjectName?: string;
  read: boolean;
  createdAt: string;
}

/** Les types qui nomment une seconde personne. */
const AVEC_SECONDE_PERSONNE: ReadonlySet<NotificationType> = new Set([
  'group_member_invited',
  'group_member_joined',
]);

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorAvatarUrl: row.actor_avatar_url ?? undefined,
    postId: row.post_id ?? undefined,
    postTitle: row.post_title ?? undefined,
    postLocation: row.post_location ?? undefined,
    commentId: row.comment_id ?? undefined,
    groupId: row.group_id ?? undefined,
    groupName: row.group_name ?? undefined,
    read: row.read_at != null,
    createdAt: row.created_at,
  };
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return attachSubjectNames((data as NotificationRow[]).map(rowToNotification));
}

/**
 * Relit le nom de la seconde personne là où il y en a une.
 *
 * Pourquoi pas une colonne de plus dans `notifications_feed` : réécrire une vue avec
 * `create or replace` à partir d'un dump périmé est exactement le piège déjà payé sur
 * `posts_ranked`. Deux petites requêtes sur quelques lignes coûtent moins cher — même choix que
 * `fetchDisplayNames` pour les suggestions d'amis.
 *
 * NE PEUT PAS FAIRE TOMBER LA LISTE : un échec rend les notifications sans ce nom, et l'écran dit
 * « Quelqu'un ». Une décoration n'a pas le droit de coûter toute la liste (leçon du 20/08).
 */
async function attachSubjectNames(notifications: AppNotification[]): Promise<AppNotification[]> {
  const concernees = notifications.filter((n) => AVEC_SECONDE_PERSONNE.has(n.type)).map((n) => n.id);
  if (concernees.length === 0) return notifications;
  try {
    const { data, error } = await supabase.from('notifications').select('id, subject_id').in('id', concernees);
    if (error) throw error;
    const sujetParNotif = new Map(
      (data ?? [])
        .filter((row) => row.subject_id)
        .map((row) => [row.id as string, row.subject_id as string])
    );
    const noms = await fetchDisplayNames(Array.from(new Set(sujetParNotif.values())));
    return notifications.map((n) => {
      const sujet = sujetParNotif.get(n.id);
      return sujet ? { ...n, subjectName: noms.get(sujet) } : n;
    });
  } catch {
    return notifications;
  }
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (error) throw error;
}
