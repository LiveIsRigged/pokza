import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { Avatar } from '../ui/Avatar';
import { borders, colors, radius, spacing, tints } from '../../theme/theme';
import { useSheetDismiss, sheetGrabStyle } from '../ui/useSheetDismiss';
import { fetchVoters, type Voter } from '../../data/votes';
import { errorMessage } from '../../utils/errorMessage';

interface VotersSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  /** Les options du sondage, dans l'ordre où elles sont proposées — c'est l'ordre des sections. */
  options: string[];
  onSelectProfile?: (profileId: string) => void;
}

/**
 * Qui a voté quoi. N'est ouverte que par l'auteur du sondage ou par quelqu'un qui a déjà voté
 * (cf. `VotePoll`) : c'est la contrepartie du secret des résultats, pas une liste publique.
 *
 * Groupée par option et non triée par date : la question qu'on se pose en l'ouvrant est « qui est
 * de mon avis », pas « qui a voté en dernier ». Une option sans voix garde sa section, avec un
 * zéro — son absence se lirait comme un oubli.
 */
export function VotersSheet({ visible, onClose, postId, options, onSelectProfile }: VotersSheetProps) {
  const { dragY, grabHandlers } = useSheetDismiss(visible, onClose);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVoters(postId)
      .then((rows) => {
        if (cancelled) return;
        setVoters(rows);
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
  }, [visible, postId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: dragY }] }]}>
          <View style={sheetGrabStyle} {...grabHandlers}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Qui a voté quoi</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.listContent}>
            {loading ? (
              <ActivityIndicator style={styles.status} color={colors.action} />
            ) : error ? (
              <Text style={styles.statusText}>{error}</Text>
            ) : (
              options.map((option) => {
                const forThisOption = voters.filter((v) => v.option === option);
                return (
                  <View key={option} style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{option}</Text>
                      <Text style={styles.sectionCount}>{forThisOption.length}</Text>
                    </View>
                    {forThisOption.length === 0 ? (
                      <Text style={styles.sectionEmpty}>Personne pour l'instant.</Text>
                    ) : (
                      forThisOption.map((voter) => (
                        <Pressable
                          key={voter.id}
                          style={styles.row}
                          onPress={() => onSelectProfile?.(voter.id)}
                          disabled={!onSelectProfile}
                        >
                          <Avatar url={voter.avatarUrl} name={voter.pseudo} size={36} />
                          <Text style={styles.pseudo}>{voter.pseudo}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: tints.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.action,
    flexShrink: 1,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sectionEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  pseudo: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  status: {
    marginVertical: spacing.md,
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
});
