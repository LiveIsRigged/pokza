import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { borders, colors, radius } from '../../theme/theme';

interface PastilleEtatProps {
  label: string;
  /** Fourni → la pastille se touche (« Invité ✓ » propose d'annuler). Absent → état définitif. */
  onPress?: () => void;
  /** Gabarit des petits boutons de la section « Invitations en attente » du profil (11 px). */
  compacte?: boolean;
}

/**
 * LA PASTILLE À CONTOUR QUI PREND LA PLACE D'UN BOUTON UNE FOIS L'ACTION FAITE : « Invité ✓ » dans
 * l'invitation à un groupe, « ✓ Amis », « ✓ Membre » ou « Refusé » après une demande traitée. La
 * ligne reste et dit ce qui s'est passé : la faire disparaître laissait croire que rien n'était
 * parti (Victor, 15/09/2026). Pastille plutôt que texte gris, et ces libellés : tranchés par Victor
 * le même jour.
 *
 * Elle ne vit que le temps de l'écran : les listes où elle apparaît ne chargent que les demandes
 * encore en attente, donc une demande traitée n'y revient pas à la visite suivante.
 *
 * La ligne ne bouge pas : la pastille a la hauteur d'un bouton plein de ces listes (le contour mange
 * 1 px par côté, rendu au rembourrage). Mesuré dans « Mes invitations » : 57 px avant et après.
 */
export function PastilleEtat({ label, onPress, compacte = false }: PastilleEtatProps) {
  const style = [styles.pastille, compacte && styles.pastilleCompacte];
  const texte = <Text style={[styles.texte, compacte && styles.texteCompact]}>{label}</Text>;
  if (onPress) {
    return (
      <Pressable style={style} onPress={onPress} hitSlop={8}>
        {texte}
      </Pressable>
    );
  }
  return <View style={style}>{texte}</View>;
}

const styles = StyleSheet.create({
  // Face aux boutons pleins des listes : 14 / 8 de rembourrage, 12 px.
  pastille: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  // Face aux boutons du profil : 10 / 6 de rembourrage, 11 px.
  pastilleCompacte: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  texte: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  texteCompact: {
    fontSize: 11,
  },
});
