import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from './Pressable';
import { ChevronLeftIcon, MoreIcon } from './icons';
import { colors, radius, tints } from '../../theme/theme';

/** Diamètre de la pastille visible. */
const PASTILLE = 36;
/** Zone de toucher : la pastille et son rembourrage. */
const ZONE = 44;
/** Ce que la zone déborde de la pastille, de chaque côté. */
const DEBORD = (ZONE - PASTILLE) / 2;
const TAILLE_ICONE = 22;

interface HeaderButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Boutons ronds des en-têtes d'écran : le retour (chevron) et le menu (⋯).
 *
 * Choisis par Victor le 15/09/2026 (« B chevron ») sur une page qui comparait quatre allures, pour
 * remplacer les caractères « ← » et « ⋯ » posés à même le beige. Ils étaient jugés moches, et c'était
 * le seul contrôle sans forme d'écrans où tout ce qui se touche est une pastille. Pastille teintée
 * `tints.light` (celle du « +N » de la pile de membres d'un groupe), sans contour ni ombre, dessin navy.
 *
 * Géométrie : pastille de 36 dans une zone de toucher de 44. Le rembourrage est RÉEL, car `hitSlop` ne
 * fait rien sur le web ; une marge négative du côté du bord le compense, pour que ce soit la PASTILLE
 * qui s'aligne sur la marge de l'écran. Le haut de l'écran se règle avec `SCREEN_TOP`.
 */
export function BackButton({ onPress, disabled }: HeaderButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.zone, styles.bordGauche]}>
      <View style={styles.pastille}>
        <ChevronLeftIcon size={TAILLE_ICONE} color={colors.tableFelt} />
      </View>
    </Pressable>
  );
}

// `forwardRef` : les écrans de profil et de groupe mesurent ce bouton pour y ancrer leur menu.
export const MoreButton = React.forwardRef<View, HeaderButtonProps>(function MoreButton({ onPress, disabled }, ref) {
  return (
    <Pressable ref={ref} onPress={onPress} disabled={disabled} style={[styles.zone, styles.bordDroit]}>
      <View style={styles.pastille}>
        <MoreIcon size={TAILLE_ICONE} color={colors.tableFelt} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  zone: {
    width: ZONE,
    height: ZONE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordGauche: {
    marginLeft: -DEBORD,
  },
  bordDroit: {
    marginRight: -DEBORD,
  },
  pastille: {
    width: PASTILLE,
    height: PASTILLE,
    borderRadius: radius.full,
    backgroundColor: tints.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
