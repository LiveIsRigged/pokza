import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, iconMuted } from '../../theme/theme';

// La silhouette est volontairement celle d'un menu "hamburger" — trois barres horizontales de
// même largeur, sans décalage : c'est ce qui fait que l'icône est comprise sans réfléchir. Le
// vocabulaire poker (tranche des jetons, alternance des couleurs) n'est qu'un habillage par-dessus.
const CHIPS = [
  { fill: colors.tableFelt, rim: 'rgba(201,162,39,0.55)' },
  { fill: colors.gold, rim: iconMuted },
  { fill: colors.tableFelt, rim: 'rgba(201,162,39,0.55)' },
];

// Sur fond marine (en-tête du feed) : jetons clairs (parchemin / or vif) pour rester visibles.
const CHIPS_DARK = [
  { fill: colors.textOnFelt, rim: iconMuted },
  { fill: colors.goldBright, rim: iconMuted },
  { fill: colors.textOnFelt, rim: iconMuted },
];

interface ChipStackIconProps {
  /** Largeur d'un jeton ; l'épaisseur et l'espacement en découlent. */
  width?: number;
  /** Variante claire, pour un fond sombre (en-tête marine). */
  onDark?: boolean;
}

export function ChipStackIcon({ width = 26, onDark = false }: ChipStackIconProps) {
  const chips = onDark ? CHIPS_DARK : CHIPS;
  const height = Math.max(5, Math.round(width / 3.6));
  const gap = Math.max(2, Math.round(width / 9));
  return (
    <View style={styles.container}>
      {chips.map((chip, index) => (
        <View
          key={index}
          style={[
            styles.chip,
            {
              width,
              height,
              borderRadius: height / 2,
              backgroundColor: chip.fill,
              borderColor: chip.rim,
              marginTop: index === 0 ? 0 : gap,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1,
  },
});
