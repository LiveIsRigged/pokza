import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { colors, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '../data/blocks';

interface BlockedListScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectProfile?: (profileId: string) => void;
}

/**
 * Liste des comptes que l'utilisateur a bloqués, avec un bouton « Débloquer » par ligne. Séparé du
 * reste des réglages (accessible depuis le menu latéral) car c'est une action peu fréquente. La
 * discrétion du blocage est préservée : on ne voit QUE ses propres blocages, jamais qui nous a
 * bloqués (garanti par la RLS de `blocks`).
 */
export function BlockedListScreen({ currentUserId, onBack, onSelectProfile }: BlockedListScreenProps) {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Masque le bouton pendant l'appel réseau pour éviter un double-clic.
  const [unblocking, setUnblocking] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchBlockedUsers(currentUserId)
      .then((data) => {
        if (cancelled) return;
        setBlocked(data);
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

  const handleUnblock = async (userId: string) => {
    const previous = blocked;
    setUnblocking((s) => new Set(s).add(userId));
    setBlocked((b) => b.filter((u) => u.id !== userId));
    try {
      await unblockUser(currentUserId, userId);
    } catch (err) {
      setBlocked(previous);
      setError(errorMessage(err));
    } finally {
      setUnblocking((s) => {
        const next = new Set(s);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Comptes bloqués</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : blocked.length === 0 ? (
          <Text style={styles.statusText}>Tu n'as bloqué personne.</Text>
        ) : (
          blocked.map((u) => (
            <View key={u.id} style={styles.row}>
              <Pressable
                style={styles.rowInfo}
                onPress={() => onSelectProfile?.(u.id)}
                disabled={!onSelectProfile}
              >
                <Avatar url={u.avatarUrl} name={u.pseudo} size={40} />
                <Text style={styles.pseudo}>{u.pseudo}</Text>
              </Pressable>
              <Pressable
                style={styles.unblockButton}
                onPress={() => handleUnblock(u.id)}
                disabled={unblocking.has(u.id)}
                hitSlop={8}
              >
                <Text style={styles.unblockButtonText}>Débloquer</Text>
              </Pressable>
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pseudo: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  unblockButton: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  unblockButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
