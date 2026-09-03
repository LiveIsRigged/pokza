import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borders, colors, radius, tints } from '../theme/theme';

/**
 * NOTRE PROPRE PAVÉ NUMÉRIQUE — pour ne plus appeler celui d'iOS.
 * ──────────────────────────────────────────────────────────────
 * Décidé par Victor le 03/09/2026, après une matinée passée à contourner le clavier système.
 *
 * LE PROBLÈME QU'IL RÈGLE, EN CHIFFRES
 *   Le clavier d'iOS prend 386 px — 44 % de l'écran de Victor — pour saisir quatre chiffres au
 *   plus. Sur l'étape 3, ce qui reste ne suffit pas : la table (342 px à six joueurs, 425 à dix)
 *   et le chrome (112 px) en occupent 454, sur 487 disponibles. Il restait une trentaine de pixels
 *   pour un champ qui en fait 44. Le champ était donc invisible, derrière le clavier.
 *
 *   Tant que Safari faisait glisser toute la page, le défaut ne se voyait pas : le glissement
 *   escamotait la table et découvrait le champ. Il rendait ce service par accident. En le
 *   supprimant (cf. `src/web/hauteurVisible.ts`), on a mis le vrai manque à nu.
 *
 *   Les trois issues étaient : replier la table (elle perd tout son sens au moment précis où l'on
 *   dimensionne une mise), la faire glisser à moitié, ou cesser d'appeler le clavier système.
 *   Victor a tranché pour la troisième : c'est la seule qui ne sacrifie rien.
 *
 * LE COMPTE, UNE FOIS LE PAVÉ EN PLACE
 *   Plus de clavier système, donc les 873 px de l'écran restent disponibles. Table 342 + chrome 112
 *   + formulaire 320 (raccourcis, champ, pavé) = 774. Il reste 99 px à six joueurs, 16 à dix. La
 *   table reste ENTIÈRE, ce qui était la condition posée.
 *
 * CE QU'IL NE FAIT PAS
 *   Ni « tapis » ni « valider » : ces boutons existent déjà à l'écran, et les dupliquer ici
 *   donnerait deux chemins pour la même action à 40 px l'un de l'autre.
 */

/** 48 px : au-dessus de la cible tactile recommandée de 44. */
const HAUTEUR_TOUCHE = 48;
const ECART = 6;

/** Ce que mesure le pavé en tout : 156 px. Sert au calcul de place de l'étape 3 — le tenir à jour. */
export const HAUTEUR_PAVE = HAUTEUR_TOUCHE * 3 + ECART * 2;

/**
 * TROIS RANGÉES ET NON QUATRE, ET LA QUATRIÈME COLONNE EST LÀ POUR ÇA.
 * Le pavé téléphone habituel (3 colonnes, 4 rangées) fait 210 px. Mesuré le 03/09/2026 sur
 * l'iPhone de Victor : à dix joueurs la table prend 425 px et il ne reste que 125 px au pavé ;
 * même à six joueurs il en manquait, et les deux dernières rangées vivaient sous le pli.
 * En 3×4 il tombe à 156 et tient partout, sans réduire les touches sous la cible tactile.
 *
 * Les chiffres 1 à 9 gardent leur carré habituel : c'est lui qu'on tape sans regarder. Seule la
 * colonne de droite est nouvelle, et ses trois touches sont celles qu'on cherche des yeux de toute
 * façon. Le 0 y descend en bas à droite au lieu du bas au centre — c'est le prix payé, et il est
 * moindre que deux rangées invisibles.
 */
const RANGEES = [
  ['1', '2', '3', '⌫'],
  ['4', '5', '6', ','],
  ['7', '8', '9', '0'],
] as const;

export function PaveNumerique({
  onTouche,
  onEffacer,
  onToutEffacer,
}: {
  /** Un chiffre, ou la virgule. */
  onTouche: (caractere: string) => void;
  onEffacer: () => void;
  /** Appui long sur la correction : on repart de zéro sans marteler la touche. */
  onToutEffacer: () => void;
}) {
  return (
    <View style={styles.pave}>
      {RANGEES.map((rangee) => (
        <View key={rangee.join('')} style={styles.rangee}>
          {rangee.map((touche) => {
            const correction = touche === '⌫';
            return (
              <Pressable
                key={touche}
                style={({ pressed }) => [
                  styles.touche,
                  correction && styles.toucheCorrection,
                  pressed && styles.toucheEnfoncee,
                ]}
                onPress={() => (correction ? onEffacer() : onTouche(touche))}
                onLongPress={correction ? onToutEffacer : undefined}
                accessibilityLabel={correction ? 'Effacer' : touche === ',' ? 'Virgule' : touche}
              >
                <Text style={[styles.libelle, correction && styles.libelleCorrection]}>{touche}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pave: {
    gap: ECART,
  },
  rangee: {
    flexDirection: 'row',
    gap: ECART,
  },
  touche: {
    flex: 1,
    height: HAUTEUR_TOUCHE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: borders.default,
    backgroundColor: '#FFFFFF',
  },
  // La correction ne se dispute pas l'attention avec les chiffres : même dessin, fond estompé.
  toucheCorrection: {
    backgroundColor: tints.faint,
  },
  // Le retour au toucher est ici INDISPENSABLE et non décoratif : sans clavier système, plus de
  // clic ni de bond de touche pour dire que l'appui a porté.
  toucheEnfoncee: {
    backgroundColor: tints.medium,
  },
  libelle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  libelleCorrection: {
    fontSize: 20,
    color: colors.textSecondary,
  },
});
