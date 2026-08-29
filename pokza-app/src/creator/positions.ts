import type { Position, Seat, Street } from '../types/poker';
import type { ContextData } from './types';

export const CANON_ORDER: Position[] = ['UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

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
  10: ['UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export function buildSeats(
  numPlayers: number,
  heroPosition: Position,
  startingStack: number,
  opponentNames?: Partial<Record<Position, string>>,
  seatStacks?: Partial<Record<Position, number>>,
  /** Nom du héros ; absent ou vide, il reste « Hero » partout (cf. `SeatView`, `seatDisplay`). */
  heroName?: string
): Seat[] {
  const positions = POSITION_SETS[numPlayers] ?? POSITION_SETS[6];
  return positions.map((position) => {
    const isHero = position === heroPosition;
    const name = (isHero ? heroName : opponentNames?.[position])?.trim();
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

/**
 * Qui parle en premier après le flop : le premier joueur à gauche du bouton.
 *
 * ⚠️ LE CAS HEADS-UP, QUI A LONGTEMPS ÉTÉ FAUX ICI. À deux, le bouton EST la petite blinde —
 * d'où `POSITION_SETS[2] = ['BTN', 'BB']`, sans siège `SB`. L'ancien code, ne trouvant pas de
 * `SB`, retombait sur `BTN` : le bouton parlait avant la grosse blinde sur toutes les streets.
 * C'est l'inverse de la règle. Le bouton parle en premier PRÉFLOP (il est la petite blinde) et
 * en DERNIER ensuite ; postflop, c'est donc la grosse blinde qui ouvre.
 */
function postflopStartPosition(present: Position[]): Position {
  if (present.includes('SB')) return 'SB';
  if (present.includes('BB')) return 'BB';
  return 'BTN';
}

/** Ordre d'action pour une street donnée (préflop: ordre naturel ; postflop: à partir de SB/BB). */
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


/**
 * Reporte sur des sièges DÉJÀ CONSTRUITS les seuls champs du contexte qui ne changent pas la
 * structure de la main : les noms et les tapis. Contrairement à `buildSeats`, qui refabrique les
 * sièges de zéro, celle-ci préserve leurs identifiants, leurs positions et leurs cartes — donc
 * toutes les actions qui les référencent.
 *
 * C'est ce qui permet de corriger un nom ou un tapis sans ressaisir le déroulé : les noms vivent à
 * deux endroits (dans les sièges, que la publication utilise, et dans le contexte, d'où
 * `buildSeats` les reconstruit), et sans ce report l'un des deux mentirait à l'autre.
 */
export function appliquerContexteAuxSieges(seats: Seat[], ctx: ContextData): Seat[] {
  return seats.map((seat) => {
    const nom = (seat.isHero ? ctx.heroName : ctx.opponentNames?.[seat.position])?.trim();
    const tapis = ctx.seatStacks?.[seat.position];
    const { playerName, ...reste } = seat;
    return {
      ...reste,
      startingStack: tapis && tapis > 0 ? tapis : ctx.effectiveStack,
      ...(nom ? { playerName: nom } : {}),
    };
  });
}
