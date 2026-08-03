import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../data/notifications';
import { acceptFriendRequest, deleteFriendRelation, fetchPendingRequests } from '../data/friends';
import { acceptGroupInvite, fetchPendingGroupInvites, removeGroupMember } from '../data/groups';

interface NotificationsScreenProps {
  currentUserId: string;
  onBack: () => void;
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
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}

function iconFor(type: AppNotification['type']): string {
  switch (type) {
    case 'post_like':
    case 'comment_like':
      return '♥';
    case 'post_comment':
    case 'comment_reply':
      return '💬';
    case 'friend_request':
    case 'friend_accept':
      return '👤';
    case 'friend_posted':
      return '♠';
    case 'group_invite':
    case 'group_accept':
    case 'group_posted':
      return '👥';
  }
}

function textFor(n: AppNotification): string {
  switch (n.type) {
    case 'post_like':
      return `${n.actorName} a aimé ta main`;
    case 'comment_like':
      return `${n.actorName} a aimé ton commentaire`;
    case 'post_comment':
      return `${n.actorName} a commenté ta main`;
    case 'comment_reply':
      return `${n.actorName} a répondu à ton commentaire`;
    case 'friend_request':
      return `${n.actorName} veut devenir ami avec toi`;
    case 'friend_accept':
      return `${n.actorName} a accepté ta demande d'ami`;
    case 'friend_posted':
      return n.postLocation
        ? `${n.actorName} a posté une main à ${n.postLocation}`
        : `${n.actorName} a posté une main`;
    case 'group_invite':
      return `${n.actorName} t'invite dans le groupe privé ${n.groupName ?? '?'}`;
    case 'group_accept':
      return `${n.actorName} a rejoint le groupe privé ${n.groupName ?? '?'}`;
    case 'group_posted':
      return `${n.actorName} a posté une main dans le groupe privé ${n.groupName ?? '?'}`;
  }
}

export function NotificationsScreen({
  currentUserId,
  onBack,
  onSelectProfile,
  onOpenGroup,
  onOpenPost,
}: NotificationsScreenProps) {
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

  useEffect(() => {
    let cancelled = false;
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
  }, [currentUserId]);

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
    if (n.postId) {
      const isCommentNotification =
        n.type === 'post_comment' || n.type === 'comment_reply' || n.type === 'comment_like';
      onOpenPost(n.postId, isCommentNotification);
      return;
    }
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
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : notifications.length === 0 ? (
          <Text style={styles.statusText}>Aucune notification pour l'instant.</Text>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={[styles.row, !n.read && styles.rowUnread]}>
              <Pressable style={styles.rowInfo} onPress={() => handlePress(n)}>
                <View style={styles.iconBubble}>
                  <Text style={styles.iconText}>{iconFor(n.type)}</Text>
                </View>
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowText}>{textFor(n)}</Text>
                  <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
                </View>
              </Pressable>
              {showFriendActions(n) && (
                <View style={styles.actions}>
                  <Pressable style={styles.declineButton} onPress={() => handleDecline(n)} hitSlop={8}>
                    <Text style={styles.declineButtonText}>Refuser</Text>
                  </Pressable>
                  <Pressable style={styles.acceptButton} onPress={() => handleAccept(n)} hitSlop={8}>
                    <Text style={styles.acceptButtonText}>Accepter</Text>
                  </Pressable>
                </View>
              )}
              {showGroupActions(n) && (
                <View style={styles.actions}>
                  <Pressable style={styles.declineButton} onPress={() => handleDeclineGroup(n)} hitSlop={8}>
                    <Text style={styles.declineButtonText}>Refuser</Text>
                  </Pressable>
                  <Pressable style={styles.acceptButton} onPress={() => handleAcceptGroup(n)} hitSlop={8}>
                    <Text style={styles.acceptButtonText}>Accepter</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
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
    gap: spacing.xs,
  },
  declineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
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
