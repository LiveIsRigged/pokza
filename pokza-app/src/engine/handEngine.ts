import type { Action, Card, Hand, Street } from '../types/poker';
import { formatChipAmount } from '../utils/chipFormat';

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * Nombre total de steps pour rejouer une main, incluant les steps de run-out.
 * Un step = soit une action, soit une carte du board révélée pendant le run-out.
 * Ex: tapis au flop avec turn+river distribués → actions.length + 2 steps.
 */
export function totalReplaySteps(hand: Hand): number {
  if (hand.actions.length === 0) return 0;

  const lastAction = hand.actions[hand.actions.length - 1];
  const lastStreetIndex = STREET_ORDER.indexOf(lastAction.street);

  let runoutCount = 0;
  for (let i = lastStreetIndex + 1; i < STREET_ORDER.length; i++) {
    const street = STREET_ORDER[i];
    if (
      (street === 'flop' && hand.board.flop) ||
      (street === 'turn' && hand.board.turn) ||
      (street === 'river' && hand.board.river)
    ) {
      runoutCount++;
    }
  }

  return hand.actions.length + runoutCount;
}

/**
 * Poster la SB/BB n'est pas une décision du joueur : on démarre le replay juste après,
 * pour ne pas faire cliquer sur ces deux steps mécaniques à chaque main.
 */
export function initialReplayStep(hand: Hand): number {
  let i = 0;
  while (i < hand.actions.length && (hand.actions[i].type === 'post-sb' || hand.actions[i].type === 'post-bb')) {
    i++;
  }
  return i;
}

/**
 * Total misé par chaque siège sur l'ensemble des actions fournies.
 * `amount` est cumulé par street pour les actions de mise (check/call/bet/raise/blindes) : on garde
 * donc la dernière valeur de chaque street. L'ante est une mise forcée indépendante (elle ne compte
 * pas dans ce qu'il faut suivre) : ses montants s'additionnent plutôt que de s'écraser, pour le cas
 * où un même siège poste à la fois une blinde et un ante sur la même street (ex: BB ante).
 */
export function committedBySeat(actions: Action[]): Record<string, number> {
  const perStreet: Record<string, Partial<Record<Street, number>>> = {};
  const antePerStreet: Record<string, Partial<Record<Street, number>>> = {};
  for (const a of actions) {
    if (a.amount == null) continue;
    if (a.type === 'post-ante') {
      antePerStreet[a.seatId] = antePerStreet[a.seatId] ?? {};
      antePerStreet[a.seatId]![a.street] = (antePerStreet[a.seatId]![a.street] ?? 0) + a.amount;
    } else {
      perStreet[a.seatId] = perStreet[a.seatId] ?? {};
      perStreet[a.seatId]![a.street] = a.amount;
    }
  }
  const seatIds = new Set([...Object.keys(perStreet), ...Object.keys(antePerStreet)]);
  const totals: Record<string, number> = {};
  for (const seatId of seatIds) {
    totals[seatId] = STREET_ORDER.reduce(
      (sum, st) => sum + (perStreet[seatId]?.[st] ?? 0) + (antePerStreet[seatId]?.[st] ?? 0),
      0
    );
  }
  return totals;
}

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
  /** ID du siège gagnant si déterminable, null si showdown ou main non terminée */
  winningSeatId: string | null;
}

export function computeHandState(hand: Hand, step: number): HandState {
  const actionsSoFar = hand.actions.slice(0, step);
  const lastAction = actionsSoFar[actionsSoFar.length - 1] ?? null;
  const currentStreet: Street = lastAction ? lastAction.street : 'preflop';

  const foldedSeatIds = new Set<string>();
  const contributions: Record<string, Partial<Record<Street, number>>> = {};
  const anteContributions: Record<string, Partial<Record<Street, number>>> = {};

  for (const act of actionsSoFar) {
    if (act.type === 'fold') {
      foldedSeatIds.add(act.seatId);
      continue;
    }
    if (act.amount == null) continue;
    if (act.type === 'post-ante') {
      anteContributions[act.seatId] = anteContributions[act.seatId] ?? {};
      anteContributions[act.seatId]![act.street] = (anteContributions[act.seatId]![act.street] ?? 0) + act.amount;
    } else {
      contributions[act.seatId] = contributions[act.seatId] ?? {};
      contributions[act.seatId]![act.street] = act.amount;
    }
  }

  const contributionFor = (seatId: string, street: Street) =>
    (contributions[seatId]?.[street] ?? 0) + (anteContributions[seatId]?.[street] ?? 0);

  let potTotal = 0;
  const stacks: Record<string, number> = {};
  for (const seat of hand.seats) {
    let totalContributed = 0;
    for (const street of STREET_ORDER) {
      const v = contributionFor(seat.id, street);
      if (v) {
        totalContributed += v;
        potTotal += v;
      }
    }
    stacks[seat.id] = seat.startingStack - totalContributed;
  }

  // La bulle de mise devant le siège ne montre que la blinde/mise/relance en cours,
  // pas l'ante : l'ante part directement au pot (dead money), il ne reste pas "devant" le joueur.
  const streetContribution: Record<string, number> = {};
  for (const seat of hand.seats) {
    const v = contributions[seat.id]?.[currentStreet];
    if (v) streetContribution[seat.id] = v;
  }

  const streetIndex = STREET_ORDER.indexOf(currentStreet);

  // Déterminer quelle street du board afficher : normalement streetIndex,
  // ou progressivement pendant le run-out si step > actions.length.
  let displayStreetIndex = streetIndex;
  if (step > hand.actions.length && lastAction) {
    const lastStreetIndex = STREET_ORDER.indexOf(lastAction.street);
    const runoutOffset = step - hand.actions.length; // 1-indexed: 1 = first runout step

    let currentOffset = 0;
    for (let i = lastStreetIndex + 1; i < STREET_ORDER.length; i++) {
      const street = STREET_ORDER[i];
      if (
        (street === 'flop' && hand.board.flop) ||
        (street === 'turn' && hand.board.turn) ||
        (street === 'river' && hand.board.river)
      ) {
        currentOffset++;
        if (currentOffset === runoutOffset) {
          displayStreetIndex = i;
          break;
        }
      }
    }
  }

  const board: Card[] = [];
  if (displayStreetIndex >= 1 && hand.board.flop) board.push(...hand.board.flop);
  if (displayStreetIndex >= 2 && hand.board.turn) board.push(hand.board.turn);
  if (displayStreetIndex >= 3 && hand.board.river) board.push(hand.board.river);

  // Au dernier step, déterminer le gagnant
  let winningSeatId: string | null = null;
  if (step >= totalReplaySteps(hand)) {
    winningSeatId = determineWinner(hand);
  }

  return {
    step,
    totalSteps: totalReplaySteps(hand),
    currentStreet,
    foldedSeatIds,
    stacks,
    streetContribution,
    potTotal,
    board,
    lastAction,
    winningSeatId,
  };
}

function seatLabel(hand: Hand, seatId: string): string {
  const seat = hand.seats.find((s) => s.id === seatId);
  return seat?.playerName ?? seat?.position ?? '';
}

/**
 * Détermine le gagnant de la main. Retourne l'ID du siège gagnant si déterminable.
 * Cas 1: un seul joueur n'a pas folded → il gagne
 * Cas 2: plusieurs joueurs non-foldés → showdown, on ne peut pas déterminer sans cartes
 */
export function determineWinner(hand: Hand): string | null {
  const foldedSeatIds = new Set<string>();
  for (const action of hand.actions) {
    if (action.type === 'fold') {
      foldedSeatIds.add(action.seatId);
    }
  }

  const notFoldedSeats = hand.seats.filter((s) => !foldedSeatIds.has(s.id));
  if (notFoldedSeats.length === 1) {
    return notFoldedSeats[0].id;
  }

  return null;
}

export function describeAction(hand: Hand, action: Action): string {
  const who = seatLabel(hand, action.seatId);
  const amount = action.amount != null ? formatChipAmount(action.amount, hand.gameType) : undefined;
  switch (action.type) {
    case 'post-sb':
      return `${who} poste la petite blinde (${amount})`;
    case 'post-bb':
      return `${who} poste la grosse blinde (${amount})`;
    case 'post-ante':
      return `${who} poste l'ante (${amount})`;
    case 'post-straddle':
      return `${who} straddle (${amount})`;
    case 'fold':
      return `${who} se couche`;
    case 'check':
      return `${who} check`;
    case 'call':
      return `${who} suit (${amount})`;
    case 'bet':
      return `${who} mise ${amount}`;
    case 'raise':
      return `${who} relance à ${amount}`;
    default:
      return who;
  }
}
