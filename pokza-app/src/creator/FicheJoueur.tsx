import React, { useEffect } from 'react';
import { Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { OptionalDecimalTextInput } from '../components/ui/ChipAmountInput';
import { OPPONENT_NAME_MAX_LENGTH } from '../constants/limits';
import { borders, colors, radius, spacing } from '../theme/theme';
import type { GameType } from '../types/poker';
import { formatChipInput } from '../utils/chipFormat';

interface FicheJoueurProps {
  visible: boolean;
  /** Ce que la table écrit à cette place — straddle compris (« Straddle » plutôt que « UTG »). */
  libelle: string;
  estHero: boolean;
  nom: string;
  tapis?: number;
  /** Le stack effectif : ce que vaut le siège tant qu'on ne lui donne pas le sien. */
  tapisParDefaut: number;
  gameType: GameType;
  onNom: (nom: string) => void;
  onTapis: (tapis: number | undefined) => void;
  onChangerDePlace: () => void;
  onVider: () => void;
  onFermer: () => void;
}

/**
 * LA FICHE D'UN JOUEUR — ce qui s'ouvre quand on touche un siège sur la table.
 * ───────────────────────────────────────────────────────────────────────────
 * Un RACCOURCI DE CORRECTION, pas le chemin de la saisie (Victor, 01/09/2026). La liste sous la
 * table reste le chemin normal pour remplir une table neuve : dix fiches à ouvrir l'une après
 * l'autre serait un recul. Celle-ci sert au geste inverse — on voit « Marc » à la mauvaise place sur
 * le feutre, on le touche, on le corrige.
 *
 * C'est aussi le seul endroit d'où part un changement de place : « Changer de place » referme la
 * fiche et met la table en attente d'un second toucher. Deux gestes délibérés plutôt qu'un
 * glissement — à neuf ou dix joueurs, les sièges sont les plus petites cibles de l'écran, et c'est
 * exactement là qu'un doigt qui glisse rate sa cible.
 */
export function FicheJoueur({
  visible,
  libelle,
  estHero,
  nom,
  tapis,
  tapisParDefaut,
  gameType,
  onNom,
  onTapis,
  onChangerDePlace,
  onVider,
  onFermer,
}: FicheJoueurProps) {
  // Un siège où rien n'a été saisi n'a rien à remettre à zéro : le bouton reste là (sa place ne
  // bouge pas d'une fiche à l'autre) mais il est éteint, plutôt que de promettre un effet nul.
  const aQuelqueChoseAVider = nom.trim().length > 0 || tapis !== undefined;

  /**
   * REFERMER LA FEUILLE NE DÉFOCALISE PAS SON CHAMP.
   *
   * Mesuré le 01/09/2026 : sur le web, `Modal` garde son contenu MONTÉ et se contente de le
   * masquer (hauteur nulle, `pointer-events: none`) — après fermeture, `document.activeElement`
   * était toujours le champ « Nom » de cette feuille. Or `useClavierOuvert` répond « ouvert » tant
   * qu'un champ saisissable a le focus : la table du formulaire serait restée repliée pour de
   * bon, sans qu'aucun clavier ne soit à l'écran et sans rien pour l'expliquer.
   *
   * On rend donc le focus à la page. Le `focusout` qui s'ensuit réveille le hook, qui constate
   * qu'aucun champ n'est plus actif et redéploie la table.
   */
  useEffect(() => {
    if (visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const actif = document.activeElement as HTMLElement | null;
    if (actif && typeof actif.blur === 'function') actif.blur();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onFermer} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{estHero ? `${libelle} (toi)` : libelle}</Text>
            <Pressable onPress={onFermer} hitSlop={8}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.corps}>
            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              // Le héros est le seul dont le champ annonce sa valeur par défaut : laissé vide, il
              // s'affiche « Hero » partout dans la main (cf. `SeatView`).
              placeholder={estHero ? 'Hero' : 'Nom'}
              maxLength={OPPONENT_NAME_MAX_LENGTH}
              value={nom}
              onChangeText={onNom}
              autoFocus={!estHero && nom.length === 0}
            />

            <Text style={styles.label}>Tapis</Text>
            <OptionalDecimalTextInput
              style={styles.input}
              placeholder={formatChipInput(tapisParDefaut, gameType)}
              value={tapis}
              gameType={gameType}
              onChangeValue={onTapis}
            />

            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={onChangerDePlace}>
                <Text style={styles.actionTexte}>Changer de place</Text>
              </Pressable>
              <Pressable
                style={[styles.action, !aQuelqueChoseAVider && styles.actionEteinte]}
                disabled={!aQuelqueChoseAVider}
                onPress={onVider}
              >
                {/* « Reset » et non « Vider ce siège » (Victor, 01/09) : le second laissait croire
                    que le siège lui-même allait disparaître, alors que seuls le nom et le tapis
                    s'effacent — la place, elle, reste à table. */}
                <Text style={[styles.actionTexte, !aQuelqueChoseAVider && styles.actionTexteEteint]}>
                  Reset
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropFill: { flex: 1 },
  // Pas de hauteur imposée, contrairement aux feuilles de sélection : deux champs et deux boutons
  // n'ont pas besoin des trois quarts de l'écran, et une feuille courte laisse voir la table
  // au-dessus — c'est elle qu'on est en train de corriger.
  sheet: {
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
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
  headerTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  closeButton: { fontSize: 18, color: colors.textSecondary, padding: 4 },
  corps: { paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 24 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    // Cf. `ContextStep` : sur le web un TextInput devient un <input>, dont la largeur minimale
    // intrinsèque déborde de son conteneur tant que `minWidth` vaut `auto`.
    minWidth: 0,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 22 },
  action: {
    flex: 1,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionEteinte: { opacity: 0.4 },
  actionTexte: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  actionTexteEteint: { color: colors.textSecondary },
});
