import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { Hand } from '../../types/poker';
import { computeHandState, describeAction, initialReplayStep, totalReplaySteps } from '../../engine/handEngine';
import { layoutSeats } from '../../engine/layout';
import { colors } from '../../theme/theme';
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
  const actionText = step > initialStep && state.lastAction ? describeAction(hand, state.lastAction) : null;

  const winnerSeat = state.winningSeatId ? hand.seats.find((s) => s.id === state.winningSeatId) : null;
  const winnerSeatCoord = state.winningSeatId
    ? seatCoords.find((sc) => sc.seat.id === state.winningSeatId)?.x
    : null;
  const winnerCoords = winnerSeatCoord
    ? seatCoords.find((sc) => sc.seat.id === state.winningSeatId)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.tableArea} onLayout={onLayout}>
        <TableSurface width={size.width} height={size.height} />

        {size.width > 0 && (
          <View style={[styles.boardWrapper, { width: size.width, height: size.height }]} pointerEvents="none">
            <BoardView
              cards={state.board}
              pot={state.potTotal}
              winningSeatId={state.winningSeatId}
              winnerSeatCoords={
                winnerCoords
                  ? {
                      x: winnerCoords.x - tableCenter.x,
                      y: winnerCoords.y - tableCenter.y,
                    }
                  : null
              }
              gameType={hand.gameType}
              tableWidth={size.width}
            />
          </View>
        )}

        {seatCoords.map(({ seat, x, y }) => (
          <SeatView
            key={seat.id}
            seat={seat}
            x={x}
            y={y}
            tableCenter={tableCenter}
            folded={state.foldedSeatIds.has(seat.id)}
            stackRemaining={state.stacks[seat.id] ?? seat.startingStack}
            currentBet={state.streetContribution[seat.id]}
            isActive={state.lastAction?.seatId === seat.id && !state.foldedSeatIds.has(seat.id)}
            isWinner={state.winningSeatId === seat.id}
            gameType={hand.gameType}
          />
        ))}
      </View>

      <ActionCallout text={actionText} stepKey={step} />

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
        onTogglePlay={() => {
          setPlaying((p) => {
            if (!p && step >= totalSteps) setStep(initialStep);
            return !p;
          });
        }}
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
    aspectRatio: 1.25,
    position: 'relative',
    backgroundColor: colors.feedBackground,
  },
  boardWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
