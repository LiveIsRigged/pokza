import React, { useState } from 'react';
import type { Action, Board, Card, Hand, Post, Seat } from '../types/poker';
import { holeCardCount } from '../types/poker';
import type { Group } from '../data/groups';
import { ContextStep } from './steps/ContextStep';
import { HoleCardsStep } from './steps/HoleCardsStep';
import { StreetStep } from './steps/StreetStep';
import { ShowdownStep } from './steps/ShowdownStep';
import { ReviewStep } from './steps/ReviewStep';
import { buildSeats, getActingOrder } from './positions';
import { committedBySeat } from '../engine/handEngine';
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

// Un bomb pot n'a pas de preflop : une étape de moins (6 au lieu de 7), et la numérotation des
// étapes décale d'autant. L'abattage reste un écran optionnel intercalé avant la publication, sans
// numéro d'étape dans les deux cas.
const totalStepsFor = (bombPot: boolean): number => (bombPot ? 6 : 7);
const phaseStepMap = (bombPot: boolean): Partial<Record<Phase, number>> =>
  bombPot
    ? { context: 1, holeCards: 2, 'street-flop': 3, 'street-turn': 4, 'street-river': 5, review: 6 }
    : { context: 1, holeCards: 2, 'street-preflop': 3, 'street-flop': 4, 'street-turn': 5, 'street-river': 6, review: 7 };

interface Snapshot {
  phase: Phase;
  context: ContextData;
  seats: Seat[];
  heroCards: (Card | undefined)[];
  actions: Action[];
  activeSeatIds: string[];
  board: Board;
  board2: Board;
  revealedCards: Record<string, (Card | undefined)[]>;
}

interface LiveHandCreatorProps {
  authorId: string;
  authorName: string;
  onCreated: (post: Post) => void;
  onCancel: () => void;
  groups: Group[];
}

export function LiveHandCreator({ authorId, authorName, onCreated, onCancel, groups }: LiveHandCreatorProps) {
  const [phase, setPhase] = useState<Phase>('context');
  const [context, setContext] = useState<ContextData>(DEFAULT_CONTEXT);
  const [seats, setSeats] = useState<Seat[]>([]);
  // Longueur variable selon la variante (2/4/5) : remplie à l'étape "Tes cartes", et retaillée à la
  // sortie du contexte si la variante a changé (cf. onNext de ContextStep).
  const [heroCards, setHeroCards] = useState<(Card | undefined)[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [activeSeatIds, setActiveSeatIds] = useState<string[]>([]);
  const [board, setBoard] = useState<Board>({});
  // Second board d'un double board bomb pot ; reste vide en un seul board.
  const [board2, setBoard2] = useState<Board>({});
  const [review, setReview] = useState<ReviewData>({
    title: '',
    description: '',
    voteQuestion: '',
    visibility: 'public',
  });
  // Cartes montrées par les adversaires à l'abattage (seatId -> deux cartes, éventuellement partielles).
  const [revealedCards, setRevealedCards] = useState<Record<string, (Card | undefined)[]>>({});
  // Réglage global à la main (pas par adversaire, cf. ShowdownStep) : une fois activé, les mains
  // adverses saisies ci-dessus restent visibles dans le replayer même perdantes. Comme
  // `review.visibility`, ce n'est pas dans `Snapshot` — persiste tel quel à travers la navigation
  // arrière/avant plutôt que d'être restauré à une valeur antérieure.
  const [revealShowdown, setRevealShowdown] = useState(false);
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
    ...(board2.flop ?? []),
    ...(board2.turn ? [board2.turn] : []),
    ...(board2.river ? [board2.river] : []),
  ];
  const revealedUsedCards: Card[] = Object.values(revealedCards)
    .flat()
    .filter(Boolean) as Card[];
  const usedCards: Card[] = [...baseUsedCards, ...revealedUsedCards];

  // Sièges adverses encore en jeu (non couchés) à qui on peut attribuer des cartes à l'abattage.
  const villainSeats = seats.filter((s) => !s.isHero && activeSeatIds.includes(s.id));

  // Total misé par chaque siège lors des streets précédant `street` (exclut donc les blindes de la street courante).
  const priorCommittedFor = (street: 'preflop' | 'flop' | 'turn' | 'river') =>
    committedBySeat(actions.filter((a) => a.street !== street));

  // Enregistre l'état courant avant de passer à la phase suivante, pour pouvoir revenir en arrière sans perdre ni dupliquer les données.
  const pushSnapshotAndGo = (nextPhase: Phase, patch: Partial<Omit<Snapshot, 'phase'>> = {}) => {
    setHistory((h) => [
      ...h,
      { phase, context, seats, heroCards, actions, activeSeatIds, board, board2, revealedCards },
    ]);
    if (patch.context !== undefined) setContext(patch.context);
    if (patch.seats !== undefined) setSeats(patch.seats);
    if (patch.heroCards !== undefined) setHeroCards(patch.heroCards);
    if (patch.actions !== undefined) setActions(patch.actions);
    if (patch.activeSeatIds !== undefined) setActiveSeatIds(patch.activeSeatIds);
    if (patch.board !== undefined) setBoard(patch.board);
    if (patch.board2 !== undefined) setBoard2(patch.board2);
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
    setBoard2(prev.board2);
    setRevealedCards(prev.revealedCards);
    setPhase(prev.phase);
    setPhaseKey((k) => k + 1);
  };

  const finalize = (finalActions: Action[], finalBoard: Board) => {
    // Un adversaire n'est "connu" (et donc départageable/inclus dans l'équité) que si TOUTES ses
    // cartes ont été saisies — une main Omaha partielle (< count cartes) n'est pas évaluable, on la
    // traite alors comme mucked, exactement comme au Hold'em où il fallait les 2 cartes.
    const cardCount = holeCardCount(context.variant);
    const seatsWithCards = seats.map((s) => {
      if (s.isHero) return { ...s, holeCards: heroCards.filter(Boolean) as Card[] };
      const rc = (revealedCards[s.id] ?? []).filter(Boolean) as Card[];
      if (rc.length === cardCount) return { ...s, holeCards: rc };
      return s;
    });
    const hand: Hand = {
      id: `hand-${Date.now()}`,
      variant: context.variant,
      gameType: context.gameType,
      // Bomb pot : pas de blindes. On garde `bb` = montant de l'ante comme unité d'affichage (le
      // bomb pot se raisonne en nombre d'antes), et `sb` à 0.
      blinds: context.bombPot
        ? { sb: 0, bb: context.bombAnte }
        : {
            sb: context.sb,
            bb: context.bb,
            ante: context.anteType === 'bb' ? context.bb : context.anteType === 'per-player' ? context.ante : undefined,
          },
      effectiveStack: context.effectiveStack,
      visibility: review.visibility,
      seats: seatsWithCards,
      board: finalBoard,
      // Double board (bomb pot uniquement) : le second board n'est posé que si l'option est active.
      board2: context.bombPot && context.doubleBoard ? board2 : undefined,
      actions: finalActions,
      bombPot: context.bombPot || undefined,
      revealShowdown,
    };
    const post: Post = {
      id: `post-${Date.now()}`,
      authorId,
      authorName,
      createdAt: new Date().toISOString(),
      location: context.location,
      buyIn: context.buyIn,
      level: context.level,
      title: review.title,
      description: review.description?.trim() || undefined,
      voteQuestion: review.voteQuestion || undefined,
      voteOptions: review.voteQuestion
        ? (review.voteOptions ?? []).map((o) => o.trim()).filter(Boolean)
        : undefined,
      likeCount: 0,
      commentCount: 0,
      visibility: review.visibility,
      groupId: review.groupId,
      hand,
    };
    onCreated(post);
  };

  const totalSteps = totalStepsFor(context.bombPot);
  const step = phaseStepMap(context.bombPot)[phase];

  switch (phase) {
    case 'showdown':
      return (
        <ShowdownStep
          count={holeCardCount(context.variant)}
          villains={villainSeats}
          seats={seats}
          revealed={revealedCards}
          baseUsedCards={baseUsedCards}
          actions={actions}
          onChange={(seatId, cards) => setRevealedCards((r) => ({ ...r, [seatId]: cards }))}
          revealShowdown={revealShowdown}
          onChangeRevealShowdown={setRevealShowdown}
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
          totalSteps={totalSteps}
          onBack={goBack}
          onNext={() => {
            const builtSeats = buildSeats(
              context.numPlayers,
              context.heroPosition,
              context.effectiveStack,
              context.opponentNames,
              context.seatStacks
            );
            let order = 1;
            const blindActions: Action[] = [];

            if (context.bombPot) {
              // Bomb pot : chaque siège poste l'ante (la "bombe") en preflop, aucune blinde ni
              // straddle. Tous les joueurs restent en jeu et l'on saute directement au flop (cf.
              // onNext de holeCards).
              for (const seat of builtSeats) {
                blindActions.push({
                  id: `bomb-${seat.id}`,
                  street: 'preflop',
                  seatId: seat.id,
                  type: 'post-ante',
                  amount: context.bombAnte,
                  order: order++,
                });
              }
            } else {
            const sbSeat = builtSeats.find((s) => s.position === 'SB') ?? builtSeats.find((s) => s.position === 'BTN')!;
            const bbSeat = builtSeats.find((s) => s.position === 'BB')!;

            // Ante par joueur : chaque siège poste son ante avant les blindes.
            if (context.anteType === 'per-player' && context.ante > 0) {
              for (const seat of builtSeats) {
                blindActions.push({
                  id: `ante-${seat.id}`,
                  street: 'preflop',
                  seatId: seat.id,
                  type: 'post-ante',
                  amount: context.ante,
                  order: order++,
                });
              }
            }

            blindActions.push({
              id: 'blind-sb',
              street: 'preflop',
              seatId: sbSeat.id,
              type: 'post-sb',
              amount: context.sb,
              order: order++,
            });
            blindActions.push({
              id: 'blind-bb',
              street: 'preflop',
              seatId: bbSeat.id,
              type: 'post-bb',
              amount: context.bb,
              order: order++,
            });

            // BB ante : seule la BB poste l'ante (montant = BB), après les blindes.
            if (context.anteType === 'bb' && context.bb > 0) {
              blindActions.push({
                id: 'ante-bb',
                street: 'preflop',
                seatId: bbSeat.id,
                type: 'post-ante',
                amount: context.bb,
                order: order++,
              });
            }

            // Straddle(s) (cash game) : les joueurs successifs après la BB postent chacun un
            // montant volontaire qui double à chaque fois (simple, double, triple), devenant le
            // niveau à suivre. Le dernier straddleur agira en dernier (comme la BB en temps
            // normal), l'action reprenant après lui.
            if (context.gameType === 'cash' && context.straddleCount > 0 && context.straddleAmount > 0) {
              const straddleOrder = getActingOrder(builtSeats, 'preflop');
              for (let i = 0; i < context.straddleCount; i++) {
                const straddlerSeat = straddleOrder[i];
                if (!straddlerSeat) break;
                blindActions.push({
                  id: `straddle-${i + 1}`,
                  street: 'preflop',
                  seatId: straddlerSeat.id,
                  type: 'post-straddle',
                  amount: context.straddleAmount * 2 ** i,
                  order: order++,
                });
              }
            }
            }

            // Si la variante a changé depuis la dernière visite de cette étape, on retaille les
            // cartes déjà choisies au nouveau nombre (ex : PLO5→PLO ne garde que 4 cartes) — sans ça,
            // un surplus de cartes rendrait l'étape "Tes cartes" impossible à valider.
            const trimmedHero = (heroCards.filter(Boolean) as Card[]).slice(0, holeCardCount(context.variant));
            pushSnapshotAndGo('holeCards', {
              seats: builtSeats,
              actions: blindActions,
              activeSeatIds: builtSeats.map((s) => s.id),
              heroCards: trimmedHero,
            });
          }}
        />
      );

    case 'holeCards':
      return (
        <HoleCardsStep
          count={holeCardCount(context.variant)}
          cards={heroCards}
          onChange={setHeroCards}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          // Bomb pot : pas de preflop, on enchaîne direct sur le flop (les antes sont déjà postés).
          onNext={() => pushSnapshotAndGo(context.bombPot ? 'street-flop' : 'street-preflop')}
        />
      );

    case 'street-preflop': {
      const sbSeat = seats.find((s) => s.position === 'SB') ?? seats.find((s) => s.position === 'BTN');
      const bbSeat = seats.find((s) => s.position === 'BB');
      const straddleActions = actions.filter((a) => a.type === 'post-straddle').sort((a, b) => a.order - b.order);
      const lastStraddle = straddleActions[straddleActions.length - 1];
      const initialContributions: Record<string, number> = {};
      if (sbSeat) initialContributions[sbSeat.id] = context.sb;
      if (bbSeat) initialContributions[bbSeat.id] = context.bb;
      for (const straddleAction of straddleActions) {
        initialContributions[straddleAction.seatId] = straddleAction.amount ?? 0;
      }
      return (
        <StreetStep
          key={`preflop-${phaseKey}`}
          street="preflop"
          boardCount={0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          initialBetAmount={lastStraddle ? lastStraddle.amount : context.bb}
          initialContributions={initialContributions}
          priorCommitted={priorCommittedFor('preflop')}
          anteCommitted={committedBySeat(actions.filter((a) => a.type === 'post-ante'))}
          firstToActAfterSeatId={lastStraddle?.seatId}
          priorActions={actions}
          bb={context.bb}
          gameType={context.gameType}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(_board, _board2, newActions, remaining) => {
            pushSnapshotAndGo('street-flop', { actions: [...actions, ...newActions], activeSeatIds: remaining });
          }}
          onHandEndsEarly={(_board, _board2, newActions, remaining) => {
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
          boardCount2={context.bombPot && context.doubleBoard ? 3 : 0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('flop')}
          priorActions={actions}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            pushSnapshotAndGo('street-turn', {
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              board2: { ...board2, flop: board2Cards as [Card, Card, Card] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              board2: { ...board2, flop: board2Cards as [Card, Card, Card] },
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
          boardCount2={context.bombPot && context.doubleBoard ? 1 : 0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('turn')}
          priorActions={actions}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            pushSnapshotAndGo('street-river', {
              board: { ...board, turn: boardCards[0] },
              board2: { ...board2, turn: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, turn: boardCards[0] },
              board2: { ...board2, turn: board2Cards[0] },
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
          boardCount2={context.bombPot && context.doubleBoard ? 1 : 0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('river')}
          priorActions={actions}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              board2: { ...board2, river: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              board2: { ...board2, river: board2Cards[0] },
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
          totalSteps={totalSteps}
          onBack={goBack}
          onSubmit={() => finalize(actions, board)}
          groups={groups}
        />
      );

    default:
      return null;
  }
}
