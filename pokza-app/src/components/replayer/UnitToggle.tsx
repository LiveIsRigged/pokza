import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../../theme/theme';

/**
 * Largeur rendue de la pastille : texte « BB » (11 px / 700) + padding 10×2 + bordure 1×2, mesuré
 * sur la fonte système. Exportée pour servir de largeur au cale-espace symétrique posé de l'autre
 * côté de la bulle d'action — c'est lui qui garde la bulle centrée sur l'axe de la table.
 * SOURCE UNIQUE : les deux valeurs ne peuvent pas diverger.
 */
export const UNIT_TOGGLE_WIDTH = 37;

interface UnitToggleProps {
  /** Affichage des montants en BB plutôt qu'en jetons bruts — préférence mémorisée pour tout le feed. */
  useBB: boolean;
  onToggle: () => void;
}

/**
 * Bascule jetons / big blinds. Vivait dans `PlaybackControls` ; remontée sur la ligne de la bulle
 * d'action, où elle occupe une place qui existait déjà (la bulle est plus haute qu'elle).
 *
 * ⚠️ Elle doit rester SŒUR de la bulle, jamais à l'intérieur : la bulle est une `Animated.View`
 * dont l'opacité retombe à 0 après 1,4 s (cf. `ActionCallout`). Placée dedans, la bascule
 * disparaîtrait avec elle.
 */
export function UnitToggle({ useBB, onToggle }: UnitToggleProps) {
  return (
    <Pressable onPress={onToggle} style={[styles.toggle, useBB && styles.toggleActive]} hitSlop={8}>
      <Text style={[styles.text, useBB && styles.textActive]}>BB</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  toggleActive: {
    backgroundColor: colors.tableFelt,
    borderColor: colors.tableFelt,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  textActive: {
    color: colors.textOnFelt,
  },
});
