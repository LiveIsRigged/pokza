import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Action, Card, Seat } from '../../types/poker';
import { borders, colors, typography } from '../../theme/theme';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker, memeCarte } from '../MultiCardPicker';
import { Chip } from '../Chip';
import { straddleSeatLabel } from '../../engine/handEngine';
import { potDeFinDeMain, siegesDeFinDeMain } from '../tableReglage';
import { TableVue, type SiegeAffiche } from '../../components/table/TableVue';
import { GABARIT_ATELIER, GABARIT_ATELIER_DOUBLE, hauteurTableAtelier } from '../../engine/layout';
import type { GameType } from '../../types/poker';
import type { CodeDevise } from '../../utils/currency';

interface ShowdownStepProps {
  /** Nombre de cartes fermées par joueur selon la variante : 2 (Hold'em), 4 (PLO) ou 5 (PLO5). */
  count: number;
  /** Sièges adverses encore en jeu à l'abattage, à qui on peut attribuer des cartes */
  villains: Seat[];
  /** TOUS les sièges de la main (pas seulement les villains) — nécessaire pour calculer le rang
   * d'un siège dans l'ordre d'action préflop (cf. `straddleSeatLabel`), faux sur un sous-ensemble filtré. */
  seats: Seat[];
  /** Cartes révélées par siège (seatId -> deux cartes, éventuellement partielles) */
  revealed: Record<string, (Card | undefined)[]>;
  onChange: (seatId: string, cards: (Card | undefined)[]) => void;
  /** Cartes déjà prises par le hero et le board */
  baseUsedCards: Card[];
  /** Actions de la main (dont un éventuel straddle préflop) — sert uniquement à l'affichage du nom des sièges */
  actions: Action[];
  /** QUAND les mains saisies ci-dessous apparaissent dans le replayer — jamais SI : une main saisie
   * finit toujours par se montrer, gagnante ou perdante. Activé : dos de carte jusqu'à l'abattage.
   * Désactivé : visibles dès le début, comme Hero. Ne concerne jamais Hero. Réglage global à la
   * main, pas par adversaire.
   *
   * Le nom du drapeau dit « révéler À l'abattage », l'écran demande « cacher JUSQU'À l'abattage » :
   * c'est la même chose vue des deux bouts, et c'est la seconde formulation qui a été retenue (cf.
   * le libellé plus bas). */
  revealShowdown: boolean;
  onChangeRevealShowdown: (value: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  /** Correction en cours : « Valider » publie directement au lieu de continuer l'assistant. */
  nextLabel?: string;
  /** La phrase collée au bouton, qui annonce ce que le changement en cours va coûter. */
  footerNote?: string | null;
  /** Empêche de valider une correction qui ne change rien — elle coûterait ses réactions pour rien. */
  nextBloque?: boolean;
  /** De quoi dessiner la table de fin de main : le board tombé, la main de Hero, et qui est encore là. */
  board: Card[];
  board2?: Card[];
  heroCards: Card[];
  activeSeatIds: string[];
  gameType?: GameType;
  currency?: CodeDevise;
  bb: number;
  holeCardCount: number;
}

function seatLabel(seat: Seat, seats: Seat[], actions: Action[]): string {
  return seat.playerName ?? straddleSeatLabel(seats, actions, seat.id) ?? seat.position;
}

export function ShowdownStep({
  count,
  villains,
  seats,
  revealed,
  onChange,
  baseUsedCards,
  actions,
  revealShowdown,
  onChangeRevealShowdown,
  onNext,
  onBack,
  nextLabel,
  footerNote,
  nextBloque,
  board,
  board2,
  heroCards,
  activeSeatIds,
  gameType = 'cash',
  currency,
  bb,
  holeCardCount,
}: ShowdownStepProps) {
  const [selectedId, setSelectedId] = useState<string>(villains[0]?.id ?? '');

  /**
   * LES MAINS ADVERSES SE SAISISSENT SUR LE FEUTRE, comme tout le reste.
   * ────────────────────────────────────────────────────────────────────
   * Les adversaires encore en jeu montrent des emplacements en pointillés devant eux. Taper l'un
   * d'eux CHOISIT ce joueur (halo doré) et, s'il y avait une carte, la retire — la suivante choisie
   * vient s'y loger. La rangée de puces « UTG / CO / BTN » qui servait à désigner le joueur a donc
   * disparu : elle répétait des noms déjà écrits sur les badges, et la table dit mieux qui est
   * encore là, avec quel tapis, sur quel board.
   */
  const emplacementsDe = (seatId: string): (Card | undefined)[] =>
    Array.from({ length: count }, (_, i) => (revealed[seatId] ?? [])[i]);

  const taperCarte = (seatId: string) => (i: number) => {
    setSelectedId(seatId);
    const cartes = emplacementsDe(seatId);
    if (cartes[i]) onChange(seatId, cartes.map((c, j) => (j === i ? undefined : c)));
  };

  const selectedCards = emplacementsDe(selectedId);

  // Cartes indisponibles pour le siège en cours d'édition : hero + board + cartes des AUTRES adversaires.
  const disabledForSelected: Card[] = [
    ...baseUsedCards,
    ...villains
      .filter((v) => v.id !== selectedId)
      .flatMap((v) => (revealed[v.id] ?? []).filter(Boolean) as Card[]),
  ];

  const doubleBoard = Boolean(board2 && board2.length > 0);
  const sieges: SiegeAffiche[] = siegesDeFinDeMain({
    seats,
    actions,
    activeSeatIds,
    heroCards,
    revealed,
    nbCartes: count,
  }).map((s) => {
    const adversaireEnJeu = activeSeatIds.includes(s.seat.id) && !s.seat.isHero;
    return {
      ...s,
      // Le halo désigne le joueur dont on saisit la main — c'est ce que la rangée de puces disait.
      isActive: s.seat.id === selectedId,
      cartesAttendues: adversaireEnJeu,
      onCartePress: adversaireEnJeu ? taperCarte(s.seat.id) : undefined,
    };
  });

  return (
    <WizardScreen
      title="L'abattage"
      onNext={onNext}
      nextLabel={nextLabel ?? 'Continuer'}
      nextDisabled={Boolean(nextBloque)}
      footerNote={footerNote}
      onBack={onBack}
      zoneFixe={
        <TableVue
          sieges={sieges}
          board={board}
          board2={doubleBoard ? board2 : undefined}
          pot={potDeFinDeMain(actions)}
          gameType={gameType}
          currency={currency}
          bb={bb}
          holeCardCount={holeCardCount}
          hauteur={hauteurTableAtelier(seats.length, doubleBoard)}
          gabarit={doubleBoard ? GABARIT_ATELIER_DOUBLE : GABARIT_ATELIER}
        />
      }
    >
      {/* « CACHER jusqu'à l'abattage », et non « révéler à l'abattage ». Un testeur lisait la
          question précédente de travers : « Révéler les mains » avec « Non » posé EN PREMIER faisait
          choisir, à qui allait vite, exactement l'inverse de ce qu'il croyait. Ici le premier chip
          est celui qu'on veut presque toujours, et il dit ce qu'il fait. Attention en relisant :
          « Oui » vaut `revealShowdown = true` — le drapeau nomme la révélation, la question nomme
          l'attente. */}
      <Text style={styles.label}>Cacher les mains jusqu'à l'abattage</Text>
      <View style={styles.revealRow}>
        <Chip label="Oui" selected={revealShowdown} onPress={() => onChangeRevealShowdown(true)} />
        <Chip label="Non" selected={!revealShowdown} onPress={() => onChangeRevealShowdown(false)} />
      </View>
      <Text style={styles.revealHint}>
        {revealShowdown
          ? "Les cartes resteront cachées pendant le coup, et n'apparaîtront qu'à l'abattage."
          : 'Les cartes seront visibles dans le replay dès le début.'}
      </Text>

      {selectedId ? (
        <View style={styles.pickerSection}>
          <Text style={[typography.contextLine, styles.hint]}>
            Cartes de {seatLabel(villains.find((v) => v.id === selectedId)!, seats, actions)}
          </Text>
          {/* Sans aperçu : les emplacements sont sur le feutre, devant leur joueur. */}
          <MultiCardPicker
            sansApercu
            count={count}
            selected={selectedCards}
            disabledCards={disabledForSelected}
            onChange={(next) => {
              // Le sélecteur renvoie une liste TASSÉE : on replace par différence, pour qu'une carte
              // remplacée retrouve exactement sa place au lieu de glisser au bout.
              const posees = selectedCards.filter(Boolean) as Card[];
              const ajoutee = next.find((c) => c && !posees.some((p) => memeCarte(p, c))) as Card | undefined;
              if (ajoutee) {
                const trou = selectedCards.findIndex((c) => !c);
                if (trou >= 0) onChange(selectedId, selectedCards.map((c, i) => (i === trou ? ajoutee : c)));
                return;
              }
              const retire = selectedCards.findIndex((c) => c && !next.some((n) => n && memeCarte(n, c)));
              if (retire >= 0) onChange(selectedId, selectedCards.map((c, i) => (i === retire ? undefined : c)));
            }}
          />
        </View>
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    // La table est en `zoneFixe`, hors du defilement, et rien ne l'en separait : mesure a 0 px, la
    // question etait collee au feutre. 12, comme le `paddingTop` de la rangee fixe et du socle —
    // c'est deja l'espace de cet ecran entre ce qui ne defile pas et ce qui suit.
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  revealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  revealHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  pickerSection: {
    marginTop: 4,
  },
  hint: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
});
