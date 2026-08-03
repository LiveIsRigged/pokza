import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { Hand } from '../../types/poker';
import {
  computeHandState,
  describeAction,
  initialReplayStep,
  straddleSeatLabel,
  totalReplaySteps,
} from '../../engine/handEngine';
import { boardVerticalOffset, layoutSeats } from '../../engine/layout';
import { colors } from '../../theme/theme';
import { useDisplayUnit } from '../../state/displayUnit';
import { TableSurface } from './TableSurface';
import { BoardView } from './BoardView';
import { SeatView } from './SeatView';
import { ActionCallout } from './ActionCallout';
import { PlaybackControls } from './PlaybackControls';

const AUTOPLAY_INTERVAL_MS = 1400;

const STREET_LABELS: Record<string, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

interface HandReplayerProps {
  hand: Hand;
}

export function HandReplayer({ hand }: HandReplayerProps) {
  const { useBB, toggleUseBB } = useDisplayUnit();
  const initialStep = useMemo(() => initialReplayStep(hand), [hand]);
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = totalReplaySteps(hand);
  const state = useMemo(() => computeHandState(hand, step), [hand, step]);
  const seatCoords = useMemo(
    () => (size.width > 0 ? layoutSeats(hand.seats, size.width, size.height) : []),
    [hand.seats, size.width, size.height]
  );
  const tableCenter = { x: size.width / 2, y: size.height / 2 };

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep((s) => {
          if (s >= totalSteps) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      }, AUTOPLAY_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, totalSteps]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  // Au step de départ (SB/BB déjà postées), pas de bulle d'action : ce n'est pas une
  // décision du joueur, il n'y a rien à annoncer avant la première vraie action.
  // `allInSeatIds` persiste jusqu'à la fin de la main (cf. handEngine) : cette action précise n'est
  // "le" moment du tapis que si son propre siège vient d'y passer ET qu'elle a un montant (fold et
  // check ne peuvent jamais vider un stack). Ne s'applique que si le step courant EST cette action
  // (pas un event "reveal" qui suit, cf. ci-dessous) — sinon le prochain texte affiché hériterait
  // à tort du rouge du tapis qui vient de se produire juste avant.
  const currentEventIsAction = state.lastEvent?.kind === 'action';
  const lastActionIsAllIn = Boolean(
    currentEventIsAction &&
      state.lastAction &&
      state.allInSeatIds.has(state.lastAction.seatId) &&
      state.lastAction.type !== 'fold' &&
      state.lastAction.type !== 'check'
  );
  // Un event "reveal" reste un step à part entière (cf. `buildReplayEvents` — le segment avance,
  // le board se met à jour, les mises se nettoient), mais n'affiche aucune bulle centrale : la
  // carte qui tombe se voit déjà sur le board, pas besoin de l'annoncer en plus par du texte.
  const actionText =
    step > initialStep && state.lastEvent?.kind === 'action'
      ? describeAction(hand, state.lastEvent.action, lastActionIsAllIn, useBB)
      : null;

  // Coordonnées ABSOLUES (repère table) de CHAQUE siège gagnant — plusieurs en cas de split pot.
  // Décalées de quelques pixels vers le centre de la table (au lieu du point d'ancrage exact du
  // siège, qui est aussi celui de son bloc cartes+badge) : sans ce nudge, la pastille de pot qui
  // glisse jusqu'au vainqueur atterrit pile sur ses cartes plutôt qu'à côté, illisible dès qu'il y
  // a un split pot.
  const WINNER_TARGET_NUDGE = 48;
  const winnerCoordsList = state.winningSeatIds
    .map((id) => seatCoords.find((sc) => sc.seat.id === id))
    .filter((sc): sc is (typeof seatCoords)[number] => Boolean(sc))
    .map((sc) => {
      const dx = tableCenter.x - sc.x;
      const dy = tableCenter.y - sc.y;
      const dist = Math.hypot(dx, dy) || 1;
      return { ...sc, x: sc.x + (dx / dist) * WINNER_TARGET_NUDGE, y: sc.y + (dy / dist) * WINNER_TARGET_NUDGE };
    });

  // Chaque SeatView ne prend qu'UNE cible (cf. son propre système de glissement à deux segments) :
  // on lui donne le vainqueur le plus proche plutôt que de fragmenter visuellement le petit tas de
  // jetons d'un siège perdant entre plusieurs destinations. La pastille du pot, elle, se scinde
  // réellement en plusieurs parts égales (cf. `BoardView`) — c'est elle qui porte le vrai montant.
  function nearestWinnerPos(seatX: number, seatY: number): { x: number; y: number } | null {
    if (winnerCoordsList.length === 0) return null;
    let best = winnerCoordsList[0];
    let bestDist = Math.hypot(best.x - seatX, best.y - seatY);
    for (let i = 1; i < winnerCoordsList.length; i++) {
      const d = Math.hypot(winnerCoordsList[i].x - seatX, winnerCoordsList[i].y - seatY);
      if (d < bestDist) {
        bestDist = d;
        best = winnerCoordsList[i];
      }
    }
    return { x: best.x, y: best.y };
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableArea} onLayout={onLayout}>
        <TableSurface width={size.width} height={size.height} />

        {size.width > 0 && (
          <View style={[styles.boardWrapper, { width: size.width, height: size.height }]} pointerEvents="none">
            <BoardView
              cards={state.board}
              pot={state.potTotal}
              winnerTargets={winnerCoordsList.map((wc) => ({
                x: wc.x - tableCenter.x,
                y: wc.y - tableCenter.y,
              }))}
              gameType={hand.gameType}
              tableWidth={size.width}
              verticalOffset={boardVerticalOffset()}
              bb={hand.blinds.bb}
              useBB={useBB}
            />
          </View>
        )}

        {seatCoords.map(({ seat, x, y }) => {
          // Le libellé "fold" (+ nom estompé) ne concerne qu'un vrai fold, ou le muck classique de
          // fin de main pour un adversaire non gagnant dont on ne connaît PAS les cartes — jamais
          // Hero, jamais un adversaire encore actif (mid-hand) qui n'a simplement pas encore agi.
          const hasWinner = state.winningSeatIds.length > 0;
          const isWinner = state.winningSeatIds.includes(seat.id);
          const villainKnownCards = !seat.isHero && Boolean(seat.holeCards);
          const showFoldLabel =
            state.foldedSeatIds.has(seat.id) || (hasWinner && !isWinner && !seat.isHero && !villainKnownCards);

          // Dos de carte (pas d'opacité touchée, le siège reste normalement actif) : un adversaire
          // dont les cartes sont connues (saisies à l'abattage) mais que le créateur a choisi de ne
          // révéler qu'au showdown (`hand.revealShowdown`) — dos de carte jusqu'à l'event
          // `revealCards` (cf. `computeHandState`/`buildReplayEvents`), UN CRAN AVANT que le
          // gagnant ne soit désigné : les mains se dévoilent d'abord, le pot part vers le vainqueur
          // ensuite, deux steps distincts. Désactivé (défaut) : vraie carte visible dès le début.
          const showCardBacks = villainKnownCards && Boolean(hand.revealShowdown) && !state.cardsRevealed;

          return (
            <SeatView
              key={seat.id}
              seat={seat}
              x={x}
              y={y}
              tableCenter={tableCenter}
              folded={showFoldLabel}
              showCardBacks={showCardBacks}
              stackRemaining={state.stacks[seat.id] ?? seat.startingStack}
              currentBet={state.streetContribution[seat.id]}
              isActive={state.lastAction?.seatId === seat.id && !state.foldedSeatIds.has(seat.id)}
              isWinner={state.winningSeatIds.includes(seat.id)}
              isAllIn={state.allInSeatIds.has(seat.id)}
              // L'équité est une comparaison ENTRE toutes les mains en lice : dès qu'une seule main
              // du coup est cachée (`revealShowdown`), le % n'est plus interprétable pour AUCUN
              // siège — y compris Hero, dont le chiffre dépend justement de la main cachée pour
              // avoir un sens. `equities` n'existe de toute façon que si tous les contendants ont
              // des cartes connues (cf. `computeHandState`), donc dès que `revealShowdown` est
              // actif, au moins un adversaire du calcul est forcément caché tant que la main n'est
              // pas résolue : supprimé pour tout le monde, pas seulement le siège caché. Retombe
              // sur "ALL-IN" (un fait neutre sur le stack, pas sur la main).
              equityPct={hand.revealShowdown ? undefined : state.equities?.[seat.id]}
              winnerSeatPos={nearestWinnerPos(x, y)}
              gameType={hand.gameType}
              bb={hand.blinds.bb}
              useBB={useBB}
              straddleLabel={straddleSeatLabel(hand.seats, hand.actions, seat.id)}
            />
          );
        })}
      </View>

      <ActionCallout text={actionText} stepKey={step} danger={lastActionIsAllIn} />

      <PlaybackControls
        playing={playing}
        step={step - initialStep}
        totalSteps={totalSteps - initialStep}
        streetLabel={STREET_LABELS[state.currentStreet]}
        canGoBack={step > initialStep}
        canGoForward={step < totalSteps}
        onBack={() => {
          setPlaying(false);
          setStep((s) => Math.max(initialStep, s - 1));
        }}
        onForward={() => {
          setPlaying(false);
          setStep((s) => Math.min(totalSteps, s + 1));
        }}
        onSeek={(i) => {
          setPlaying(false);
          setStep(Math.min(totalSteps, initialStep + i + 1));
        }}
        onTogglePlay={() => {
          setPlaying((p) => {
            if (!p && step >= totalSteps) setStep(initialStep);
            return !p;
          });
        }}
        useBB={useBB}
        onToggleUseBB={toggleUseBB}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  tableArea: {
    width: '100%',
    // Ovale plus HAUT que large (l'inverse de l'ancien 1.25) : c'est ce qui crée l'anneau de felt
    // entre les sièges et le board central. Sans cette hauteur, le board (large) touche presque les
    // sièges de côté et il n'existe aucun espace "devant le joueur" pour poser une mise sans
    // chevaucher — aucun algorithme de placement ne peut inventer de l'espace inexistant.
    aspectRatio: 0.8,
    position: 'relative',
    backgroundColor: colors.feedBackground,
  },
  boardWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    // Le pot doit toujours rester visible au-dessus des jetons de mise "posés" (SeatView),
    // même si un siège vient après lui dans le JSX — le zIndex interne de la pastille ne suffit
    // pas, il ne joue que face à ses propres frères, pas face à un autre arbre de composants.
    zIndex: 10,
  },
});
