import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import type { GroupMember } from '../data/groups';
import { PersonIcon } from '../components/ui/icons';

interface GroupMembersScreenProps {
  members: GroupMember[];
  ownerId: string;
  currentUserId: string;
  /** Fondateur uniquement, ouvert depuis « Exclure un membre » dans le menu ⋯. La bulle « Liste de
   * membres », elle, ouvre toujours cet écran en lecture seule (`canManage` absent) — même pour le
   * fondateur : l'exclusion d'un membre ne vit qu'à cet unique endroit, pas en double. */
  canManage?: boolean;
  onRemoveMember?: (userId: string) => void;
  onSelectProfile: (profileId: string) => void;
  onBack: () => void;
}

/** Overlay au-dessus de `GroupScreen`, même mécanique que `EditGroupScreen`. */
export function GroupMembersScreen({
  members,
  ownerId,
  currentUserId,
  canManage = false,
  onRemoveMember,
  onSelectProfile,
  onBack,
}: GroupMembersScreenProps) {
  // Un membre déjà accepté ne se retire pas sans confirmation (perte de son accès et de son
  // historique dans le groupe). Annuler une invitation encore en attente, elle, reste immédiate :
  // rien n'a encore d'effet, l'inviter à nouveau coûte un tap.
  const [excludingMember, setExcludingMember] = useState<GroupMember | null>(null);

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{canManage ? 'Exclure un membre' : 'Membres'}</Text>

        {members.map((m) => (
          <View key={m.userId} style={styles.memberRow}>
            <Pressable style={styles.memberInfo} onPress={() => onSelectProfile(m.userId)}>
              <Avatar url={m.avatarUrl} name={m.pseudo} size={36} />
              <Text style={styles.memberPseudo}>
                {m.pseudo}
                {m.userId === ownerId && ' 👑'}
              </Text>
              {m.status === 'pending' && <Text style={styles.memberPending}>en attente</Text>}
            </Pressable>
            {canManage && m.userId !== currentUserId && (
              <Pressable
                onPress={() => (m.status === 'pending' ? onRemoveMember?.(m.userId) : setExcludingMember(m))}
                hitSlop={8}
              >
                <Text style={styles.memberRemoveLink}>{m.status === 'pending' ? 'Annuler' : 'Retirer'}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <ConfirmSheet
        visible={excludingMember != null}
        icon={PersonIcon}
        title={`Retirer ${excludingMember?.pseudo ?? 'ce membre'} du groupe ?`}
        message="Il ne verra plus les mains partagées ici, et pourra être réinvité plus tard."
        confirmLabel="Retirer"
        onCancel={() => setExcludingMember(null)}
        onConfirm={() => {
          const userId = excludingMember?.userId;
          setExcludingMember(null);
          if (userId) onRemoveMember?.(userId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.feedBackground,
    zIndex: 10,
  },
  container: {
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 60,
  },
  topRow: {
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.tableFelt,
    marginBottom: 20,
    marginHorizontal: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  memberPseudo: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberPending: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  memberRemoveLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
