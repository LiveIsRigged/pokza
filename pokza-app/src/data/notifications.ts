import { supabase } from '../lib/supabase';

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
  read: boolean;
  createdAt: string;
}

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
  return (data as NotificationRow[]).map(rowToNotification);
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
