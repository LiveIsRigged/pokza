import type { Action, Card, Hand, Street } from '../types/poker';

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface HandState {
  step: number;
  totalSteps: number;
  currentStreet: Street;
  /** IDs des sièges couchés au moment de ce step */
  foldedSeatIds: Set<string>;
  /** Stack restant par siège après les mises effectuées jusqu'à ce step */
  stacks: Record<string, number>;
  /** Mise en cours affichée devant chaque siège sur la street courante */
  streetContribution: Record<string, number>;
  /** Total du pot (toutes streets confondues) */
  potTotal: number;
  /** Cartes du board visibles à ce step */
  board: Card[];
  /** Dernière action jouée (pour le libellé central), ou null au tout début */
  lastAction: Action | null;
}

export function computeHandState(hand: Hand, step: number): HandState {
  const actionsSoFar = hand.actions.slice(0, step);
  const lastAction = actionsSoFar[actionsSoFar.length - 1] ?? null;
  const currentStreet: Street = lastAction ? lastAction.street : 'preflop';

  const foldedSeatIds = new Set<string>();
  const contributions: Record<string, Partial<Record<Street, number>>> = {};

  for (const act of actionsSoFar) {
    if (act.type === 'fold') {
      foldedSeatIds.add(act.seatId);
      continue;
    }
    if (act.amount != null) {
      contributions[act.seatId] = contributions[act.seatId] ?? {};
      contributions[act.seatId]![act.street] = act.amount;
    }
  }

  let potTotal = 0;
  const stacks: Record<string, number> = {};
  for (const seat of hand.seats) {
    const seatContrib = contributions[seat.id] ?? {};
    let totalContributed = 0;
    for (const street of STREET_ORDER) {
      const v = seatContrib[street];
      if (v) {
        totalContributed += v;
        potTotal += v;
      }
    }
    stacks[seat.id] = seat.startingStack - totalContributed;
  }

  const streetContribution: Record<string, number> = {};
  for (const seat of hand.seats) {
    const v = contributions[seat.id]?.[currentStreet];
    if (v) streetContribution[seat.id] = v;
  }

  const streetIndex = STREET_ORDER.indexOf(currentStreet);
  const board: Card[] = [];
  if (streetIndex >= 1 && hand.board.flop) board.push(...hand.board.flop);
  if (streetIndex >= 2 && hand.board.turn) board.push(hand.board.turn);
  if (streetIndex >= 3 && hand.board.river) board.push(hand.board.river);

  return {
    step,
    totalSteps: hand.actions.length,
    currentStreet,
    foldedSeatIds,
    stacks,
    streetContribution,
    potTotal,
    board,
    lastAction,
  };
}

function seatLabel(hand: Hand, seatId: string): string {
  const seat = hand.seats.find((s) => s.id === seatId);
  return seat?.playerName ?? seat?.position ?? '';
}

export function describeAction(hand: Hand, action: Action): string {
  const who = seatLabel(hand, action.seatId);
  switch (action.type) {
    case 'post-sb':
      return `${who} poste la petite blinde (${action.amount})`;
    case 'post-bb':
      return `${who} poste la grosse blinde (${action.amount})`;
    case 'post-ante':
      return `${who} poste l'ante (${action.amount})`;
    case 'fold':
      return `${who} se couche`;
    case 'check':
      return `${who} check`;
    case 'call':
      return `${who} suit (${action.amount})`;
    case 'bet':
      return `${who} mise ${action.amount}`;
    case 'raise':
      return `${who} relance à ${action.amount}`;
    default:
      return who;
  }
}
