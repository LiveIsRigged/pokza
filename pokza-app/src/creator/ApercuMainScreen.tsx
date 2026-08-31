import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { colors, spacing, typography } from '../theme/theme';
import type { Hand } from '../types/poker';

interface ApercuMainScreenProps {
  /** La main telle qu'elle sera publiée — celle que construit `construitMain`, pas une copie. */
  hand: Hand;
  onFermer: () => void;
}

/**
 * REVOIR LA MAIN AVANT DE LA PUBLIER.
 * ──────────────────────────────────
 * Le vrai replayer du feed, en plein écran, avec ses commandes : on le fait tourner, on vérifie ce
 * qu'on voulait vérifier, on referme, et on revient à ses champs — le titre déjà tapé est toujours
 * là, l'écran de publication n'a pas bougé.
 *
 * C'est `HandReplayer` lui-même et rien d'autre : la table de l'atelier montre un instant figé, ce
 * qu'on veut voir ici c'est le DÉROULÉ, dans la forme exacte où les lecteurs le verront. Un aperçu
 * qui ne serait pas le composant du feed ne prouverait rien.
 *
 * Overlay LOCAL au créateur, jamais un écran de `App.tsx` (même raison que `GroupPickerScreen`) :
 * le créateur n'est monté que le temps de la saisie, en sortir perdrait la main. Et frère de
 * l'étape plutôt qu'enfant, pour que le glissement de bord du wizard ne recule pas d'une étape
 * dans le dos de l'aperçu.
 */
export function ApercuMainScreen({ hand, onFermer }: ApercuMainScreenProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.topRow}>
        <Pressable onPress={onFermer} hitSlop={8}>
          <Text style={styles.retour}>←</Text>
        </Pressable>
        <Text style={styles.titre}>Revoir la main</Text>
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.replayer}>
          <HandReplayer hand={hand} />
        </View>
        <Text style={styles.note}>
          Rien n'est publié : cet aperçu est là pour vérifier, et se referme sans rien changer.
        </Text>
      </ScrollView>
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
    paddingTop: 50,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: spacing.md,
  },
  retour: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  titre: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  contenu: {
    paddingBottom: spacing.xl,
  },
  /* La table va d'un bord à l'autre, comme dans le feed : c'est justement le format qu'on vérifie. */
  replayer: {
    marginHorizontal: 0,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
  },
});
