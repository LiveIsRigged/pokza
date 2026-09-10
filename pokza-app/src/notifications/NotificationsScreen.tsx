import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, spacing } from '../theme/theme';
import { Popover } from '../components/ui/Popover';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../data/notifications';
import { acceptFriendRequest, deleteFriendRelation, fetchPendingRequests } from '../data/friends';
import { acceptGroupInvite, fetchPendingGroupInvites, removeGroupMember } from '../data/groups';
import { enablePush, pushState, pushSupported, type PushState } from '../web/push';
import { t, useT } from '../i18n';
import {
  BellIcon,
  CommentIcon,
  GroupTableIcon,
  HeartIcon,
  PersonIcon,
  ShieldIcon,
  SpadeIcon,
  type IconProps,
} from '../components/ui/icons';

interface NotificationsScreenProps {
  /** Panneau ouvert par-dessus le feed (bottom-sheet) : contrôle l'affichage + les (re)chargements. */
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onOpenGroup: (groupId: string) => void;
  /** `openComments` : les notifications de commentaire doivent atterrir sur le fil ouvert, pas
   * seulement sur la main — le commentaire est ce que l'utilisateur vient lire. */
  onOpenPost: (postId: string, openComments: boolean) => void;
}

// Différence volontaire avec les dates "28 juil. 2026" affichées sur les posts : une notification
// est lue en un coup d'œil, "il y a 3 min" renseigne davantage que la date complète à cette échelle.
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t('date.a_l_instant');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('duree.minutes_courtes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('duree.heures_courtes', { count: hours });
  const days = Math.floor(hours / 24);
  return t('duree.jours_courts', { count: days });
}

function iconFor(type: AppNotification['type']): React.ComponentType<IconProps> {
  switch (type) {
    case 'post_like':
    case 'comment_like':
      return HeartIcon;
    case 'post_comment':
    case 'comment_reply':
      return CommentIcon;
    case 'friend_request':
    case 'friend_accept':
      return PersonIcon;
    case 'friend_posted':
      return SpadeIcon;
    case 'group_invite':
    case 'group_accept':
    case 'group_posted':
      return GroupTableIcon;
    case 'report_resolved':
    case 'content_removed':
    case 'account_sanctioned':
      return ShieldIcon;
  }
}

/**
 * ⚠️ CES PHRASES EXISTENT EN DOUBLE. `supabase/functions/send-push/index.ts` fabrique les mêmes
 * pour le push, côté serveur, et ne peut pas lire ce catalogue : elle tourne sous Deno, hors du
 * bundle de l'app, et surtout elle ne sait pas encore quelle langue parle le destinataire (il
 * faudra la stocker sur le profil). Tant que ce lot n'est pas fait, l'historique in-app suit la
 * langue choisie et le push reste en français. Toucher une phrase ici sans toucher l'autre les
 * fait diverger en silence — le défaut existait déjà avant la traduction, en une seule langue.
 */
function textFor(n: AppNotification): string {
  const nom = n.actorName;
  const groupe = n.groupName ?? '?';
  switch (n.type) {
    case 'post_like':
      return t('notif.post_like', { nom });
    case 'comment_like':
      return t('notif.comment_like', { nom });
    case 'post_comment':
      return t('notif.post_comment', { nom });
    case 'comment_reply':
      return t('notif.comment_reply', { nom });
    case 'friend_request':
      return t('notif.friend_request', { nom });
    case 'friend_accept':
      return t('notif.friend_accept', { nom });
    case 'friend_posted':
      return n.postLocation
        ? t('notif.friend_posted_lieu', { nom, lieu: n.postLocation })
        : t('notif.friend_posted', { nom });
    case 'group_invite':
      return t('notif.group_invite', { nom, groupe });
    case 'group_accept':
      return t('notif.group_accept', { nom, groupe });
    case 'group_posted':
      return t('notif.group_posted', { nom, groupe });
    // Notifications de modération : on ne nomme jamais l'admin, on parle de « la modération ».
    case 'report_resolved':
      return t('notif.report_resolved');
    case 'content_removed':
      return t('notif.content_removed');
    case 'account_sanctioned':
      return t('notif.account_sanctioned');
  }
}

export function NotificationsScreen({
  visible,
  currentUserId,
  onClose,
  onSelectProfile,
  onOpenGroup,
  onOpenPost,
}: NotificationsScreenProps) {
  // Masque volontairement le `t` du module : `textFor`/`timeAgo` sont hors composant et prennent
  // celui-ci, tandis qu'ici c'est `useT` qui redessine la liste quand la langue change.
  const t = useT();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Une notification de demande (ami / groupe) reste en base à titre d'historique même après avoir
  // été traitée. Pour ne pas ré-afficher Accepter/Refuser sur une demande déjà réglée (le bug
  // constaté), on ne montre ces boutons que si la demande figure encore parmi les demandes
  // réellement en attente — la source de vérité, pas la simple présence de la notification.
  const [pendingFriendActorIds, setPendingFriendActorIds] = useState<Set<string>>(new Set());
  const [pendingGroupIds, setPendingGroupIds] = useState<Set<string>>(new Set());
  // Masque les boutons immédiatement après une action, avant même le rechargement des demandes.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  // Web Push : état de la permission sur cet appareil (web/PWA uniquement).
  const [perm, setPerm] = useState<PushState>(() => pushState());
  const [enabling, setEnabling] = useState(false);

  const handleEnablePush = async () => {
    setEnabling(true);
    try {
      setPerm(await enablePush(currentUserId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnabling(false);
    }
  };

  // (Re)chargement à chaque ouverture du panneau — les notifications doivent être fraîches quand on
  // le rouvre, et il reste monté en fond (feuille) entre deux ouvertures.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchNotifications(),
      fetchPendingRequests(currentUserId),
      fetchPendingGroupInvites(currentUserId),
    ])
      .then(([data, pendingFriends, pendingGroups]) => {
        if (cancelled) return;
        setNotifications(data);
        setPendingFriendActorIds(new Set(pendingFriends.map((r) => r.senderId)));
        setPendingGroupIds(new Set(pendingGroups.map((g) => g.groupId)));
        setLoading(false);
        const hasUnread = data.some((n) => !n.read);
        if (hasUnread) markAllNotificationsRead(currentUserId).catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, currentUserId]);

  const handleAccept = async (n: AppNotification) => {
    setResolvedIds((s) => new Set(s).add(n.id));
    try {
      await acceptFriendRequest(n.actorId, currentUserId);
    } catch (err) {
      setResolvedIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleDecline = async (n: AppNotification) => {
    setResolvedIds((s) => new Set(s).add(n.id));
    try {
      await deleteFriendRelation(currentUserId, n.actorId);
    } catch (err) {
      setResolvedIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleAcceptGroup = async (n: AppNotification) => {
    if (!n.groupId) return;
    setResolvedIds((s) => new Set(s).add(n.id));
    try {
      await acceptGroupInvite(n.groupId, currentUserId);
    } catch (err) {
      setResolvedIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleDeclineGroup = async (n: AppNotification) => {
    if (!n.groupId) return;
    setResolvedIds((s) => new Set(s).add(n.id));
    try {
      await removeGroupMember(n.groupId, currentUserId);
    } catch (err) {
      setResolvedIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  // Une notification mène à ce dont elle parle. L'ordre compte : une notification liée à une main
  // ouvre la main (y compris `group_posted`, qui annonce une main précise et pas le groupe entier),
  // sinon un groupe ouvre le groupe, et il ne reste que les notifications d'amitié — qui parlent
  // bien d'une personne.
  const handlePress = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    // Les notifications de modération sans cible (signalement traité, compte sanctionné) ne mènent
    // nulle part — surtout pas au profil de l'« acteur », qui est un admin. Un contenu retiré, lui,
    // porte un post_id : on ouvre la main pour que l'auteur y voie le bandeau.
    if (n.type === 'report_resolved' || n.type === 'account_sanctioned') return;
    if (n.postId) {
      const isCommentNotification =
        n.type === 'post_comment' ||
        n.type === 'comment_reply' ||
        n.type === 'comment_like' ||
        (n.type === 'content_removed' && n.commentId != null);
      onOpenPost(n.postId, isCommentNotification);
      return;
    }
    // Contenu retiré sans post_id (ne devrait pas arriver) : ne navigue nulle part.
    if (n.type === 'content_removed') return;
    // `group_invite` est la seule exception : tant que l'invitation n'est pas acceptée, la page du
    // groupe est inaccessible (`is_group_member` exige le statut accepté), donc on montre plutôt
    // qui invite. Les boutons Accepter/Refuser de la ligne restent le vrai chemin.
    if (n.groupId && n.type !== 'group_invite') {
      onOpenGroup(n.groupId);
      return;
    }
    onSelectProfile(n.actorId);
  };

  // Les lignes restent affichées (historique) ; seuls les boutons d'action apparaissent/disparaissent.
  const showFriendActions = (n: AppNotification) =>
    n.type === 'friend_request' && pendingFriendActorIds.has(n.actorId) && !resolvedIds.has(n.id);
  const showGroupActions = (n: AppNotification) =>
    n.type === 'group_invite' && !!n.groupId && pendingGroupIds.has(n.groupId) && !resolvedIds.has(n.id);

  return (
    <Popover visible={visible} onClose={onClose} width={320}>
      <Text style={styles.title}>{t('notif.titre')}</Text>
      {error && <Text style={styles.statusText}>{error}</Text>}

      {pushSupported() && perm !== 'granted' && (
        <Pressable
          style={styles.pushBanner}
          onPress={handleEnablePush}
          disabled={enabling || perm === 'denied'}
        >
          <BellIcon size={15} color={colors.action} />
          <Text style={styles.pushBannerText}>
            {perm === 'denied'
              ? t('notif.bloquees_message')
              : enabling
                ? t('notif.activation_en_cours')
                : t('notif.activer_sur_appareil')}
          </Text>
        </Pressable>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>{t('commun.chargement')}</Text>
        ) : notifications.length === 0 ? (
          <Text style={styles.statusText}>{t('notif.aucune')}</Text>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={[styles.row, !n.read && styles.rowUnread]}>
              <Pressable style={styles.rowInfo} onPress={() => handlePress(n)}>
                <View style={styles.iconBubble}>
                  {(() => {
                    const Icon = iconFor(n.type);
                    return <Icon size={16} color={colors.textPrimary} />;
                  })()}
                </View>
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowText}>{textFor(n)}</Text>
                  <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
                </View>
              </Pressable>
              {showFriendActions(n) && (
                <View style={styles.actions}>
                  <Pressable style={styles.declineButton} onPress={() => handleDecline(n)} hitSlop={hitSlopPairLeft}>
                    <Text style={styles.declineButtonText}>{t('commun.refuser')}</Text>
                  </Pressable>
                  <Pressable style={styles.acceptButton} onPress={() => handleAccept(n)} hitSlop={hitSlopPairRight}>
                    <Text style={styles.acceptButtonText}>{t('commun.accepter')}</Text>
                  </Pressable>
                </View>
              )}
              {showGroupActions(n) && (
                <View style={styles.actions}>
                  <Pressable style={styles.declineButton} onPress={() => handleDeclineGroup(n)} hitSlop={hitSlopPairLeft}>
                    <Text style={styles.declineButtonText}>{t('commun.refuser')}</Text>
                  </Pressable>
                  <Pressable style={styles.acceptButton} onPress={() => handleAcceptGroup(n)} hitSlop={hitSlopPairRight}>
                    <Text style={styles.acceptButtonText}>{t('commun.accepter')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </Popover>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  pushBanner: {
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,87,31,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,87,31,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  pushBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
    flexShrink: 1,
  },
  // `flexShrink` (et non `flex: 1`) : le panneau épouse la hauteur du contenu, et ne défile que
  // lorsqu'il atteint la hauteur max de la carte (cf. `Popover`).
  list: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    // Écart entre le bloc « profil » (étiré, cf. `flex: 1`) et le bouton d'action : au moins le
    // débordement de sa zone de touche (`HIT_SLOP`), sinon elle mord sur le bloc profil.
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  rowUnread: {
    backgroundColor: 'rgba(232,87,31,0.06)',
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.gold,
    fontSize: 15,
  },
  rowTextBlock: {
    flex: 1,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  declineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  declineButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  acceptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  acceptButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
