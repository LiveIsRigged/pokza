import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme/theme';

/**
 * LA COLONNE — LA LARGEUR MAXIMALE DE POKZA.
 * ════════════════════════════════════════
 * Sur un téléphone, ce composant ne fait RIEN : l'écran est plus étroit que le plafond. Il n'existe
 * que pour l'ordinateur, où Pokza s'étirait jusque-là sur toute la fenêtre.
 *
 * ⚠️ CE N'ÉTAIT PAS UN DÉFAUT ESTHÉTIQUE, C'ÉTAIT UN DÉFAUT MESURÉ. La table du feed prend la
 * proportion `aspectRatio: 0.8`, donc sa hauteur vaut la LARGEUR DU POST × 1,25 (cf. `TableVue`).
 * Sur une fenêtre de 1 280 px, ça donnait une table de **1 560 px de haut** — plus d'un écran pour
 * un seul post — avec des cartes de siège restées à 34 px, donc des confettis sur un immense
 * tapis. Le plafond ramène la table à 538 px.
 *
 * ⚠️ POURQUOI 430 ET PAS 500 OU 720. C'est le HAUT EXACT de la plage sur laquelle la géométrie de
 * la table a été RELEVÉE (339 → 430 px, cf. `HAUTEURS_ATELIER` dans `layout.ts` et
 * `test-table-geometrie.js` : planchers par nombre de sièges, chevauchements jeton/board). En
 * dessous de ce plafond, rien n'est extrapolé — au-dessus, tout l'est. Tranché par Victor le
 * 04/09/2026 sur cette base.
 *
 * ⚠️ LES CALQUES (`Modal`) NE PASSENT PAS PAR ICI : ils se rendent hors de la hiérarchie, dans leur
 * propre racine. Chacun doit donc poser sa propre colonne — sauf les deux qui s'ancrent à un
 * bouton (`Popover`, `OverflowMenu`), pour lesquels une largeur maximale n'a aucun sens : ils sont
 * déjà petits et positionnés.
 */

/** Le plafond, partout. */
export const LARGEUR_MAX = 430;

/**
 * Le plafond de l'écran d'IMPORT, plus large et pour une raison précise : une ligne de hand history
 * atteint une centaine de caractères, soit ~790 px en monospace 12 px. Il n'a aucune table à
 * dessiner, donc rien à perdre en s'élargissant — et c'est le seul écran de Pokza dont la maison
 * est l'ordinateur, puisque c'est là que vivent les fichiers.
 */
export const LARGEUR_MAX_IMPORT = 800;

interface ColonneProps {
  children: React.ReactNode;
  /** Défaut : `LARGEUR_MAX`. */
  largeur?: number;
  /** Style de la colonne elle-même (pas du fond). */
  style?: StyleProp<ViewStyle>;
  /** Couleur des marges, à gauche et à droite de la colonne. Défaut : le fond de l'app — les côtés
   *  ne doivent pas être blancs, sinon la colonne a l'air d'une fenêtre posée sur du vide. */
  fond?: string;
}

export function Colonne({ children, largeur = LARGEUR_MAX, style, fond }: ColonneProps) {
  return (
    <View style={[styles.fond, fond ? { backgroundColor: fond } : null]}>
      <View style={[styles.colonne, { maxWidth: largeur }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fond: {
    flex: 1,
    // Centre la colonne quand la fenêtre est plus large qu'elle ; sans effet quand elle est plus
    // étroite (la colonne fait alors 100 % et le `maxWidth` ne s'applique pas).
    alignItems: 'center',
    backgroundColor: colors.feedBackground,
  },
  colonne: {
    flex: 1,
    width: '100%',
  },
});
