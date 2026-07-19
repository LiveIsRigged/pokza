import React, { useState } from 'react';
import type { Action, Board, Card, Hand, Post, Seat } from '../types/poker';
import { ContextStep } from './steps/ContextStep';
import { HoleCardsStep } from './steps/HoleCardsStep';
import { StreetStep } from './steps/StreetStep';
import { ShowdownStep } from './steps/ShowdownStep';
import { ReviewStep } from './steps/ReviewStep';
import { buildSeats } from './positions';
import { DEFAULT_CONTEXT, type ContextData, type ReviewData } from './types';

type Phase =
  | 'context'
  | 'holeCards'
  | 'street-preflop'
  | 'street-flop'
  | 'street-turn'
  | 'street-river'
  | 'showdown'
  | 'review';

const TOTAL_STEPS = 7;
// L'abattage est un écran optionnel intercalé avant la publication : pas de numéro d'étape.
const PHASE_STEP: Partial<Record<Phase, number>> = {
  context: 1,
  holeCards: 2,
  'street-preflop': 3,
  'street-flop': 4,
  'street-turn': 5,
  'street-river': 6,
  review: 7,
};

interface Snapshot {
  phase: Phase;
  context: ContextData;
  seats: Seat[];
  heroCards: [Card | undefined, Card | undefined];
  actions: Action[];
  activeSeatIds: string[];
  board: Board;
  revealedCards: Record<string, (Card | undefined)[]>;
}

interface LiveHandCreatorProps {
  onCreated: (post: Post) => void;
  onCancel: () => void;
}

export function LiveHandCreator({ onCreated, onCancel }: LiveHandCreatorProps) {
  const [phase, setPhase] = useState<Phase>('context');
  const [context, setContext] = useState<ContextData>(DEFAULT_CONTEXT);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [heroCards, setHeroCards] = useState<[Card | undefined, Card | undefined]>([undefined, undefined]);
  const [actions, setActions] = useState<Action[]>([]);
  const [activeSeatIds, setActiveSeatIds] = useState<string[]>([]);
  const [board, setBoard] = useState<Board>({});
  const [review, setReview] = useState<ReviewData>({ title: '', voteQuestion: '', visibility: 'public' });
  // Cartes montrées par les adversaires à l'abattage (seatId -> deux cartes, éventuellement partielles).
  const [revealedCards, setRevealedCards] = useState<Record<string, (Card | undefined)[]>>({});
  const [history, setHistory] = useState<Snapshot[]>([]);
  // Change à chaque changement de phase, pour forcer un remount propre des écrans de street
  // (sinon revenir en arrière puis ré-avancer réutilise un composant à l'état "terminé").
  const [phaseKey, setPhaseKey] = useState(0);

  // Cartes prises par le hero et le board (sert de base d'exclusion aux sélecteurs).
  const baseUsedCards: Card[] = [
    ...(heroCards.filter(Boolean) as Card[]),
    ...(board.flop ?? []),
    ...(board.turn ? [board.turn] : []),
    ...(board.river ? [board.river] : []),
  ];
  const revealedUsedCards: Card[] = Object.values(revealedCards)
    .flat()
    .filter(Boolean) as Card[];
  const usedCards: Card[] = [...baseUsedCards, ...revealedUsedCards];

  // Sièges adverses encore en jeu (non couchés) à qui on peut attribuer des cartes à l'abattage.
  const villainSeats = seats.filter((s) => !s.isHero && activeSeatIds.includes(s.id));

  // Enregistre l'état courant avant de passer à la phase suivante, pour pouvoir revenir en arrière sans perdre ni dupliquer les données.
  const pushSnapshotAndGo = (nextPhase: Phase, patch: Partial<Omit<Snapshot, 'phase'>> = {}) => {
    setHistory((h) => [...h, { phase, context, seats, heroCards, actions, activeSeatIds, board, revealedCards }]);
    if (patch.context !== undefined) setContext(patch.context);
    if (patch.seats !== undefined) setSeats(patch.seats);
    if (patch.heroCards !== undefined) setHeroCards(patch.heroCards);
    if (patch.actions !== undefined) setActions(patch.actions);
    if (patch.activeSeatIds !== undefined) setActiveSeatIds(patch.activeSeatIds);
    if (patch.board !== undefined) setBoard(patch.board);
    if (patch.revealedCards !== undefined) setRevealedCards(patch.revealedCards);
    setPhase(nextPhase);
    setPhaseKey((k) => k + 1);
  };

  // Après la dernière street (ou un fold général), propose l'abattage s'il reste un adversaire en jeu, sinon publie.
  const finishHand = (patch: Partial<Omit<Snapshot, 'phase'>>) => {
    const remaining = patch.activeSeatIds ?? activeSeatIds;
    const currentSeats = patch.seats ?? seats;
    const hasVillain = currentSeats.some((s) => !s.isHero && remaining.includes(s.id));
    pushSnapshotAndGo(hasVillain ? 'showdown' : 'review', patch);
  };

  const goBack = () => {
    if (history.length === 0) {
      onCancel();
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setContext(prev.context);
    setSeats(prev.seats);
    setHeroCards(prev.heroCards);
    setActions(prev.actions);
    setActiveSeatIds(prev.activeSeatIds);
    setBoard(prev.board);
    setRevealedCards(prev.revealedCards);
    setPhase(prev.phase);
    setPhaseKey((k) => k + 1);
  };

  const finalize = (finalActions: Action[], finalBoard: Board) => {
    const seatsWithCards = seats.map((s) => {
      if (s.isHero) return { ...s, holeCards: heroCards as [Card, Card] };
      const rc = revealedCards[s.id];
      if (rc && rc[0] && rc[1]) return { ...s, holeCards: [rc[0], rc[1]] as [Card, Card] };
      return s;
    });
    const hand: Hand = {
      id: `hand-${Date.now()}`,
      variant: 'nlhe',
      gameType: context.gameType,
      blinds: { sb: context.sb, bb: context.bb },
      effectiveStack: context.effectiveStack,
      visibility: review.visibility,
      seats: seatsWithCards,
      board: finalBoard,
      actions: finalActions,
    };
    const post: Post = {
      id: `post-${Date.now()}`,
      authorId: 'user-1',
      authorName: 'Hero',
      createdAt: new Date().toISOString(),
      location: context.location,
      buyIn: context.buyIn,
      level: context.level,
      title: review.title,
      voteQuestion: review.voteQuestion || undefined,
      likeCount: 0,
      commentCount: 0,
      visibility: review.visibility,
      hand,
    };
    onCreated(post);
  };

  const step = PHASE_STEP[phase];

  switch (phase) {
    case 'showdown':
      return (
        <ShowdownStep
          villains={villainSeats}
          revealed={revealedCards}
          baseUsedCards={baseUsedCards}
          onChange={(seatId, cards) => setRevealedCards((r) => ({ ...r, [seatId]: cards }))}
          onBack={goBack}
          onNext={() => pushSnapshotAndGo('review')}
        />
      );

    case 'context':
      return (
        <ContextStep
          value={context}
          onChange={setContext}
          step={step}
          totalSteps={TOTAL_STEPS}
          onNext={() => {
            const builtSeats = buildSeats(context.numPlayers, context.heroPosition, context.effectiveStack);
            const sbSeat = builtSeats.find((s) => s.position === 'SB') ?? builtSeats.find((s) => s.position === 'BTN')!;
            const bbSeat = builtSeats.find((s) => s.position === 'BB')!;
            const blindActions: Action[] = [
              { id: 'blind-sb', street: 'preflop', seatId: sbSeat.id, type: 'post-sb', amount: context.sb, order: 1 },
              { id: 'blind-bb', street: 'preflop', seatId: bbSeat.id, type: 'post-bb', amount: context.bb, order: 2 },
            ];
            pushSnapshotAndGo('holeCards', {
              seats: builtSeats,
              actions: blindActions,
              activeSeatIds: builtSeats.map((s) => s.id),
            });
          }}
        />
      );

    case 'holeCards':
      return (
        <HoleCardsStep
          cards={heroCards}
          onChange={setHeroCards}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onNext={() => pushSnapshotAndGo('street-preflop')}
        />
      );

    case 'street-preflop': {
      const sbSeat = seats.find((s) => s.position === 'SB') ?? seats.find((s) => s.position === 'BTN');
      const bbSeat = seats.find((s) => s.position === 'BB');
      const initialContributions: Record<string, number> = {};
      if (sbSeat) initialContributions[sbSeat.id] = context.sb;
      if (bbSeat) initialContributions[bbSeat.id] = context.bb;
      return (
        <StreetStep
          key={`preflop-${phaseKey}`}
          street="preflop"
          boardCount={0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          initialBetAmount={context.bb}
          initialContributions={initialContributions}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onComplete={(_board, newActions, remaining) => {
            pushSnapshotAndGo('street-flop', { actions: [...actions, ...newActions], activeSeatIds: remaining });
          }}
          onHandEndsEarly={(_board, newActions, remaining) => {
            finishHand({ actions: [...actions, ...newActions], activeSeatIds: remaining, board: {} });
          }}
        />
      );
    }

    case 'street-flop':
      return (
        <StreetStep
          key={`flop-${phaseKey}`}
          street="flop"
          boardCount={3}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onComplete={(boardCards, newActions, remaining) => {
            pushSnapshotAndGo('street-turn', {
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, newActions, remaining) => {
            finishHand({
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
        />
      );

    case 'street-turn':
      return (
        <StreetStep
          key={`turn-${phaseKey}`}
          street="turn"
          boardCount={1}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onComplete={(boardCards, newActions, remaining) => {
            pushSnapshotAndGo('street-river', {
              board: { ...board, turn: boardCards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, newActions, remaining) => {
            finishHand({
              board: { ...board, turn: boardCards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
        />
      );

    case 'street-river':
      return (
        <StreetStep
          key={`river-${phaseKey}`}
          street="river"
          boardCount={1}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onComplete={(boardCards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
        />
      );

    case 'review':
      return (
        <ReviewStep
          value={review}
          onChange={setReview}
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onSubmit={() => finalize(actions, board)}
        />
      );

    default:
      return null;
  }
}
