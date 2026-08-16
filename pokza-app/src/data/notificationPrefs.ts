import { supabase } from '../lib/supabase';

/**
 * Préférences de notifications push, par famille (Réglages > Notifications). Filtrent UNIQUEMENT le
 * push — l'historique in-app (`notifications_feed`) reste toujours complet, décision produit du
 * 16/08. Mapping des types vers ces familles : miroir exact de `familyFor` dans
 * `supabase/functions/send-push/index.ts`.
 */
export interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  friends: boolean;
  groups: boolean;
}

// Absence de ligne en base = tout activé (cf. docs/dev/notification-prefs.sql).
const DEFAULT_PREFS: NotificationPrefs = { likes: true, comments: true, friends: true, groups: true };

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('likes, comments, friends, groups')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_PREFS;
}

export async function updateNotificationPrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<void> {
  const { error } = await supabase.from('notification_prefs').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) throw error;
}
