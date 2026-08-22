import { supabase } from '../lib/supabase';

/**
 * Préférences de notifications push, par famille (Réglages > Notifications). Filtrent UNIQUEMENT le
 * push : couper une famille n'efface rien de l'historique in-app déjà écrit, décision produit du
 * 16/08. Mapping des types vers ces familles : miroir exact de `familyFor` dans
 * `supabase/functions/send-push/index.ts`.
 *
 * ⚠️ « L'historique in-app reste complet » n'est plus vrai depuis le 22/08, et ces interrupteurs
 * n'y sont pour rien : les garde-fous vivent dans les déclencheurs `notify_friend_posted` (12 h par
 * ami-auteur) et `notify_group_posted` (2 h par groupe), qui n'ÉCRIVENT pas les notifications
 * sautées. Le jour où l'on voudra « Julien a partagé 3 mains », c'est là qu'il faudra retirer la
 * limite, pas ici.
 */
export interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  friends: boolean;
  groups: boolean;
  /** Mains postées par un AMI — distinct de « friends », qui ne couvre que le social (demandes,
   * acceptations). A gardé son nom d'origine en scindant la famille le 22/08 : les joueurs qui
   * l'avaient déjà réglée conservent leur choix. */
  posted: boolean;
  /** Mains postées dans un GROUPE privé. Séparée des mains d'amis pour qu'on puisse faire taire
   * un home game bavard sans se couper aussi de ses amis. */
  posted_groups: boolean;
}

// Absence de ligne en base = tout activé (cf. docs/dev/notification-prefs.sql).
const DEFAULT_PREFS: NotificationPrefs = {
  likes: true,
  comments: true,
  friends: true,
  groups: true,
  posted: true,
  posted_groups: true,
};

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('likes, comments, friends, groups, posted, posted_groups')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_PREFS;
}

export async function updateNotificationPrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<void> {
  const { error } = await supabase.from('notification_prefs').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) throw error;
}
