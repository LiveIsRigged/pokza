import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Action, Board, Card, GameType, Seat, Street } from '../../types/poker';
import { Pressable } from '../../components/ui/Pressable';
import { borders, colors, radius } from '../../theme/theme';
import { describeAction } from '../../engine/handEngine';
import { MultiCardPicker } from '../MultiCardPicker';
import { WizardScreen } from '../WizardScreen';

const TITRES: Record<Street, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

/**
 * LA CORRECTION D'UNE STREET — l'écran qui remplace `StreetStep` quand on reprend une main publiée
 * à l'une de ses streets.
 *
 * POURQUOI UN ÉCRAN À PART, et pas un `StreetStep` prérempli : `StreetStep` n'est pas un
 * formulaire, c'est un ENREGISTREUR SÉQUENTIEL — une file de joueurs, des contributions, une
 * relance minimale qui se recalcule à chaque action. Il ne sait pas démarrer à moitié rempli, et
 * il ne peut donc pas « détecter » qu'on vient de modifier une mise au milieu. Le rendre éditable
 * en place voudrait dire rejouer toute la suite en revalidant la légalité de chaque action.
 *
 * D'où DEUX GESTES DISTINCTS plutôt qu'un effacement implicite :
 * - la ou les cartes de cette street se corrigent ici même, sans rien perdre (aucune action ne
 *   référence une carte : le vainqueur se recalcule, rien ne devient illégal) ;
 * - les mises, elles, ne se retouchent pas — on choisit explicitement de les REFAIRE, et c'est ce
 *   choix-là, jamais la simple entrée dans l'écran, qui efface la suite.
 *
 * Le préflop n'a pas de carte : cet écran n'y propose donc que « Refaire les mises ».
 */
interface StreetCorrectionStepProps {
  street: Street;
  seats: Seat[];
  actions: Action[];
  gameType: GameType;
  bb: number;
  board: Board;
  board2: Board;
  /** Publie la main avec les cartes corrigées, sans repasser par les étapes suivantes. */
  onValider: (board: Board, board2: Board) => void;
  /** Efface à partir de cette street et rend la main à l'enregistreur normal. */
  onRefaireLesMises: () => void;
  onBack: () => void;
}

/** Les cartes que CETTE street apporte au board — le préflop n'en apporte aucune. */
function cartesDeLaStreet(board: Board, street: Street): Card[] {
  if (street === 'flop') return board.flop ? [...board.flop] : [];
  if (street === 'turn') return board.turn ? [board.turn] : [];
  if (street === 'river') return board.river ? [board.river] : [];
  return [];
}

/** Repose les cartes corrigées à leur place, sans jamais changer l'étendue du board. */
function reposer(board: Board, street: Street, cartes: Card[]): Board {
  if (street === 'flop' && board.flop) return { ...board, flop: [cartes[0], cartes[1], cartes[2]] };
  if (street === 'turn' && board.turn) return { ...board, turn: cartes[0] };
  if (street === 'river' && board.river) return { ...board, river: cartes[0] };
  return board;
}

/** Toutes les cartes déjà distribuées ailleurs : elles doivent rester impossibles à re-choisir. */
function cartesPrisesAilleurs(board: Board, board2: Board, seats: Seat[], street: Street): Card[] {
  const duBoard = (b: Board) =>
    [...(b.flop ?? []), ...(b.turn ? [b.turn] : []), ...(b.river ? [b.river] : [])];
  const aGarder = (b: Board) => {
    const deLaStreet = cartesDeLaStreet(b, street);
    return duBoard(b).filter((c) => !deLaStreet.some((d) => d.rank === c.rank && d.suit === c.suit));
  };
  return [...aGarder(board), ...aGarder(board2), ...seats.flatMap((s) => s.holeCards ?? [])];
}

export function StreetCorrectionStep({
  street,
  seats,
  actions,
  gameType,
  bb,
  board,
  board2,
  onValider,
  onRefaireLesMises,
  onBack,
}: StreetCorrectionStepProps) {
  const initiales = cartesDeLaStreet(board, street);
  const initiales2 = cartesDeLaStreet(board2, street);
  const [cartes, setCartes] = useState<(Card | undefined)[]>(initiales);
  const [cartes2, setCartes2] = useState<(Card | undefined)[]>(initiales2);

  const mises = actions.filter((a) => a.street === street && !a.type.startsWith('post-'));
  const prises = cartesPrisesAilleurs(board, board2, seats, street);
  const contexteLibelle = { seats, actions, gameType, blinds: { sb: 0, bb } };

  const complet =
    cartes.filter(Boolean).length === initiales.length && cartes2.filter(Boolean).length === initiales2.length;
  const memeQuAvant = (a: (Card | undefined)[], b: Card[]) =>
    a.length === b.length && a.every((c, i) => c && c.rank === b[i].rank && c.suit === b[i].suit);
  const rienNAChange = memeQuAvant(cartes, initiales) && memeQuAvant(cartes2, initiales2);

  return (
    <WizardScreen
      title={TITRES[street]}
      subtitle={initiales.length ? 'Corrige les cartes, ou refais les mises' : 'Refais les mises de cette street'}
      onNext={
        initiales.length
          ? () =>
              onValider(
                reposer(board, street, cartes.filter(Boolean) as Card[]),
                reposer(board2, street, cartes2.filter(Boolean) as Card[])
              )
          : undefined
      }
      nextLabel="Valider"
      nextDisabled={!complet || rienNAChange}
      footerNote={rienNAChange ? null : "Rien d'autre ne sera à ressaisir."}
      onBack={onBack}
    >
      <View>
        {initiales.length > 0 && (
          <>
            <Text style={styles.label}>{initiales2.length ? 'Board 1' : 'Cartes de cette street'}</Text>
            <MultiCardPicker
              count={initiales.length}
              selected={cartes}
              disabledCards={[...prises, ...(cartes2.filter(Boolean) as Card[])]}
              onChange={(next) => {
                const rempli = [...next];
                while (rempli.length < initiales.length) rempli.push(undefined);
                setCartes(rempli);
              }}
            />
          </>
        )}

        {initiales2.length > 0 && (
          <>
            <Text style={styles.label}>Board 2</Text>
            <MultiCardPicker
              count={initiales2.length}
              selected={cartes2}
              disabledCards={[...prises, ...(cartes.filter(Boolean) as Card[])]}
              onChange={(next) => {
                const rempli = [...next];
                while (rempli.length < initiales2.length) rempli.push(undefined);
                setCartes2(rempli);
              }}
            />
          </>
        )}

        <Text style={styles.label}>Mises de cette street</Text>
        {mises.length === 0 ? (
          <Text style={styles.vide}>Personne n'a parlé sur cette street.</Text>
        ) : (
          mises.map((a, i) => (
            <Text key={`${a.seatId}-${a.order ?? i}`} style={styles.mise}>
              {describeAction(contexteLibelle, a)}
            </Text>
          ))
        )}

        {/* Le SEUL geste qui efface, et il est explicite. Reprendre les mises d'une street impose
            de refaire celles qui suivent : leur légalité dépend de ce qui vient d'être misé. */}
        <Pressable style={styles.refaire} onPress={onRefaireLesMises}>
          <Text style={styles.refaireTexte}>Refaire les mises</Text>
        </Pressable>
        <Text style={styles.avertissement}>
          Refaire les mises efface celles de cette street et des suivantes. Les cartes, elles, sont
          conservées.
        </Text>
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mise: {
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  vide: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  refaire: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refaireTexte: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  avertissement: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
