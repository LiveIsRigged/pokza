import type { Position, Seat } from '../types/poker';

const CANON_ORDER: Position[] = ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Réordonne les sièges en partant du hero (toujours en position 0), dans l'ordre réel de jeu autour de la table. */
export function orderSeatsFromHero(seats: Seat[]): Seat[] {
  const present = CANON_ORDER.filter((p) => seats.some((s) => s.position === p));
  const heroSeat = seats.find((s) => s.isHero);
  if (!heroSeat) return seats;
  const heroIdx = present.indexOf(heroSeat.position);
  const rotated = [...present.slice(heroIdx), ...present.slice(0, heroIdx)];
  return rotated
    .map((pos) => seats.find((s) => s.position === pos))
    .filter((s): s is Seat => Boolean(s));
}

export interface SeatCoordinate {
  seat: Seat;
  x: number;
  y: number;
}

/**
 * Place les sièges sur une ellipse, hero fixe en bas au centre.
 * Angle 90° = bas (hero), puis répartition régulière en cercle.
 */
export function layoutSeats(
  seats: Seat[],
  width: number,
  height: number,
  seatMarginRatio = 0.16
): SeatCoordinate[] {
  const ordered = orderSeatsFromHero(seats);
  const n = ordered.length;
  const cx = width / 2;
  const cy = height / 2;
  const rx = (width / 2) * (1 - seatMarginRatio);
  // Les cartes d'un siège sont dessinées AU-DESSUS de lui (~46px). On plafonne le rayon
  // vertical pour que les sièges du haut et du bas gardent toujours cette marge dans la
  // table, sinon leurs cartes débordent et sont coupées par le bord du feutre.
  const CARD_MARGIN = 46;
  const ry = Math.min((height / 2) * (1 - seatMarginRatio * 0.6), height / 2 - CARD_MARGIN);

  return ordered.map((seat, i) => {
    const angleDeg = 90 + (i * 360) / n;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      seat,
      x: cx + rx * Math.cos(angleRad),
      y: cy + ry * Math.sin(angleRad),
    };
  });
}
