import type { Position, Seat, Street } from '../types/poker';

export const CANON_ORDER: Position[] = ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Sièges présents à table selon le nombre de joueurs, dans l'ordre naturel de jeu (préflop). */
export const POSITION_SETS: Record<number, Position[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'UTG1', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export function buildSeats(
  numPlayers: number,
  heroPosition: Position,
  startingStack: number,
  opponentNames?: Partial<Record<Position, string>>,
  seatStacks?: Partial<Record<Position, number>>
): Seat[] {
  const positions = POSITION_SETS[numPlayers] ?? POSITION_SETS[6];
  return positions.map((position) => {
    const isHero = position === heroPosition;
    const name = !isHero ? opponentNames?.[position]?.trim() : undefined;
    const stack = seatStacks?.[position];
    return {
      id: `s-${position.toLowerCase()}`,
      position,
      isHero,
      startingStack: stack && stack > 0 ? stack : startingStack,
      ...(name ? { playerName: name } : {}),
    };
  });
}

function postflopStartPosition(present: Position[]): Position {
  return present.includes('SB') ? 'SB' : 'BTN';
}

/** Ordre d'action pour une street donnée (préflop: ordre naturel ; postflop: à partir de SB/BTN). */
export function getActingOrder(seats: Seat[], street: Street): Seat[] {
  const present = CANON_ORDER.filter((p) => seats.some((s) => s.position === p));
  const orderedPositions =
    street === 'preflop' ? present : rotateToStart(present, postflopStartPosition(present));
  return orderedPositions
    .map((pos) => seats.find((s) => s.position === pos))
    .filter((s): s is Seat => Boolean(s));
}

function rotateToStart(list: Position[], start: Position): Position[] {
  const idx = list.indexOf(start);
  if (idx === -1) return list;
  return [...list.slice(idx), ...list.slice(0, idx)];
}

/**
 * Ordre d'action après une mise/relance : reprend la rotation normale de la street
 * en repartant du siège juste après celui qui vient d'agir (et non depuis le début
 * de la street), pour que les joueurs déjà passés n'agissent qu'en dernier.
 */
export function getActingOrderAfter(seats: Seat[], street: Street, afterSeatId: string): Seat[] {
  const full = getActingOrder(seats, street);
  const idx = full.findIndex((s) => s.id === afterSeatId);
  if (idx === -1) return full;
  return [...full.slice(idx + 1), ...full.slice(0, idx + 1)];
}
