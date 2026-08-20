import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import {
  acceptFriendRequest,
  deleteFriendRelation,
  fetchPendingRequests,
  type PendingRequest,
} from '../data/friends';
import { acceptGroupInvite, fetchPendingGroupInvites, removeGroupMember, type PendingGroupInvite } from '../data/groups';
import { GroupTableIcon } from '../components/ui/icons';

interface InvitationsScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
  /** Prévient App.tsx qu'une invitation vient d'être traitée, pour rafraîchir le badge du menu
   * latéral sans attendre le prochain retour au premier plan de l'app. */
  onInvitationHandled: () => void;
}

/**
 * Vue dédiée aux demandes en attente (amis + groupes privés), séparée du flux Notifications qui
 * les noie parmi likes/commentaires — accessible depuis le menu latéral avec un badge de
 * comptage. Reprend exactement la logique d'acceptation/refus déjà éprouvée dans
 * `NotificationsScreen` (mêmes fonctions data), juste regroupée par type plutôt qu'en flux
 * chronologique unique.
 */
export function InvitationsScreen({ currentUserId, onBack, onSelectProfile, onInvitationHandled }: InvitationsScreenProps) {
  const [friendRequests, setFriendRequests] = useState<PendingRequest[]>([]);
  const [groupInvites, setGroupInvites] = useState<PendingGroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedFriendIds, setResolvedFriendIds] = useState<Set<string>>(new Set());
  const [resolvedGroupIds, setResolvedGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPendingRequests(currentUserId), fetchPendingGroupInvites(currentUserId)])
      .then(([requests, invites]) => {
        if (cancelled) return;
        setFriendRequests(requests);
        setGroupInvites(invites);
        setLoading(false);
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

  const handleAcceptFriend = async (senderId: string) => {
    setResolvedFriendIds((s) => new Set(s).add(senderId));
    try {
      await acceptFriendRequest(senderId, currentUserId);
      onInvitationHandled();
    } catch (err) {
      setResolvedFriendIds((s) => {
        const next = new Set(s);
        next.delete(senderId);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleDeclineFriend = async (senderId: string) => {
    setResolvedFriendIds((s) => new Set(s).add(senderId));
    try {
      await deleteFriendRelation(currentUserId, senderId);
      onInvitationHandled();
    } catch (err) {
      setResolvedFriendIds((s) => {
        const next = new Set(s);
        next.delete(senderId);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleAcceptGroup = async (groupId: string) => {
    setResolvedGroupIds((s) => new Set(s).add(groupId));
    try {
      await acceptGroupInvite(groupId, currentUserId);
      onInvitationHandled();
    } catch (err) {
      setResolvedGroupIds((s) => {
        const next = new Set(s);
        next.delete(groupId);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const handleDeclineGroup = async (groupId: string) => {
    setResolvedGroupIds((s) => new Set(s).add(groupId));
    try {
      await removeGroupMember(groupId, currentUserId);
      onInvitationHandled();
    } catch (err) {
      setResolvedGroupIds((s) => {
        const next = new Set(s);
        next.delete(groupId);
        return next;
      });
      setError(errorMessage(err));
    }
  };

  const visibleFriendRequests = friendRequests.filter((r) => !resolvedFriendIds.has(r.senderId));
  const visibleGroupInvites = groupInvites.filter((g) => !resolvedGroupIds.has(g.groupId));

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mes invitations</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : (
          <>
            {/* Les deux sections restent affichées même vides : sans elles, un écran qui ne dit que
                « aucune invitation » n'apprend pas ce qu'il est censé contenir. */}
            <Text style={styles.sectionTitle}>Demandes d'ami</Text>
            {visibleFriendRequests.length === 0 ? (
              <Text style={styles.sectionEmpty}>Aucune demande pour l'instant.</Text>
            ) : (
              visibleFriendRequests.map((req) => (
                <View key={req.senderId} style={styles.row}>
                  <Pressable style={styles.rowInfo} onPress={() => onSelectProfile(req.senderId)}>
                    <Avatar url={req.senderAvatarUrl} name={req.senderPseudo} size={36} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {req.senderPseudo}
                    </Text>
                  </Pressable>
                  <View style={styles.actions}>
                    <Pressable style={styles.declineButton} onPress={() => handleDeclineFriend(req.senderId)} hitSlop={hitSlopPairLeft}>
                      <Text style={styles.declineButtonText}>Refuser</Text>
                    </Pressable>
                    <Pressable style={styles.acceptButton} onPress={() => handleAcceptFriend(req.senderId)} hitSlop={hitSlopPairRight}>
                      <Text style={styles.acceptButtonText}>Accepter</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Groupes privés</Text>
            {visibleGroupInvites.length === 0 ? (
              <Text style={styles.sectionEmpty}>Aucune invitation pour l'instant.</Text>
            ) : (
              visibleGroupInvites.map((invite) => (
                <View key={invite.groupId} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <View style={styles.groupIconBubble}>
                      <GroupTableIcon size={16} color={colors.textSecondary} />
                    </View>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {invite.groupName}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <Pressable style={styles.declineButton} onPress={() => handleDeclineGroup(invite.groupId)} hitSlop={hitSlopPairLeft}>
                      <Text style={styles.declineButtonText}>Refuser</Text>
                    </Pressable>
                    <Pressable style={styles.acceptButton} onPress={() => handleAcceptGroup(invite.groupId)} hitSlop={hitSlopPairRight}>
                      <Text style={styles.acceptButtonText}>Accepter</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
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
  sectionEmpty: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    // Écart entre le bloc « profil » (étiré, cf. `flex: 1`) et le bouton d'action : au moins le
    // débordement de sa zone de touche (`HIT_SLOP`), sinon elle mord sur le bloc profil.
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  groupIconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIconText: {
    fontSize: 15,
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
