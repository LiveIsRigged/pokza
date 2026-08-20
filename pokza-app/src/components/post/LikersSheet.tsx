import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { Avatar } from '../ui/Avatar';
import { borders, colors, radius, spacing, tints } from '../../theme/theme';
import { useSheetDismiss, sheetGrabStyle } from '../ui/useSheetDismiss';
import { fetchCommentLikers, fetchPostLikers, type Liker } from '../../data/likes';
import { errorMessage } from '../../utils/errorMessage';

interface LikersSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Ce dont on liste les likes : une main ou un commentaire. */
  source: { kind: 'post' | 'comment'; id: string };
  /** Absent → les lignes ne sont pas cliquables (aucun écran de profil à ouvrir depuis ici). */
  onSelectProfile?: (profileId: string) => void;
}

/**
 * Qui a aimé — ouverte en touchant le CHIFFRE à côté du cœur (le cœur, lui, garde son rôle de
 * bouton j'aime), comme partout ailleurs sur les réseaux sociaux.
 *
 * La feuille se dimensionne sur son contenu jusqu'à 70 % de la hauteur : trois personnes ne
 * doivent pas ouvrir un panneau de la taille de l'écran. Contrairement aux commentaires, on
 * recharge à chaque ouverture (`visible`) plutôt qu'une fois pour toutes : la liste bouge pendant
 * qu'on lit la main, et elle est trop courte pour que le rechargement se voie.
 */
export function LikersSheet({ visible, onClose, source, onSelectProfile }: LikersSheetProps) {
  const { dragY, grabHandlers } = useSheetDismiss(visible, onClose);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = source.kind === 'post' ? fetchPostLikers(source.id) : fetchCommentLikers(source.id);
    load
      .then((rows) => {
        if (cancelled) return;
        setLikers(rows);
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
  }, [visible, source.kind, source.id]);

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
              <Text style={styles.headerTitle}>Qui a aimé</Text>
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
            ) : likers.length === 0 ? (
              // Atteignable sans bug : le compteur est tenu par un trigger côté base, qui ignore
              // les blocages de celui qui regarde (cf. `fetchLikers`). Un « 1 » peut donc n'ouvrir
              // aucune ligne si la seule personne concernée est bloquée ou bannie.
              <Text style={styles.statusText}>Personne à afficher ici.</Text>
            ) : (
              likers.map((liker) => (
                <Pressable
                  key={liker.id}
                  style={styles.row}
                  onPress={() => onSelectProfile?.(liker.id)}
                  disabled={!onSelectProfile}
                >
                  <Avatar url={liker.avatarUrl} name={liker.pseudo} size={36} />
                  <Text style={styles.pseudo}>{liker.pseudo}</Text>
                </Pressable>
              ))
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
    // Pas de `height` fixe, contrairement aux commentaires : la liste est souvent courte.
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
