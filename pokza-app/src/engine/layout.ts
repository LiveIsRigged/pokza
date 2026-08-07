import type { Position, Seat } from '../types/poker';

const CANON_ORDER: Position[] = ['UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

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

// Géométrie du contenu d'un siège (cartes + badge), partagée entre le layout des sièges et le
// placement des mises : SOURCE UNIQUE, pour ne jamais désynchroniser ces constantes entre deux
// fichiers (c'était la cause de plusieurs bugs précédents — un chiffre changé d'un côté, oublié
// de l'autre).
export const SEAT_CARDS_HEIGHT = 46;
export const SEAT_CARDS_GAP = 4;
export const SEAT_BADGE_HEIGHT = 30;
// Distance, depuis l'ancre du siège (le point x,y renvoyé par layoutSeats), jusqu'au bord de son
// contenu le plus proche du centre de la table : le bas du badge pour un siège du haut, le haut
// des cartes pour un siège du bas (cf. SeatView, où l'ancre correspond à translateY:-39 dans un
// bloc cartes(46)+gap(4)+badge(30) = 80 de haut).
const SEAT_ANCHOR_OFFSET = 39;
export const SEAT_INNER_EDGE_TOP_HALF = SEAT_CARDS_HEIGHT + SEAT_CARDS_GAP + SEAT_BADGE_HEIGHT - SEAT_ANCHOR_OFFSET;
export const SEAT_INNER_EDGE_BOTTOM_HALF = SEAT_ANCHOR_OFFSET;

const CARD_MARGIN = 39;

// Hauteur réelle de la pastille "Pot X" (ChipsView), mesurée dans le DOM rendu : texte 11px +
// paddingVertical(1×2) + bordure(1×2) = 18. À resynchroniser si le style de ChipsView change.
export const POT_PILL_HEIGHT = 18;

/**
 * Le bloc board + pot (cartes, avec la pastille du pot empilée au-dessus) n'est pas symétrique :
 * seule la pastille dépasse d'un côté. Centré naïvement sur la table, ce bloc laisse donc bien
 * plus de marge au siège du bas (Hero) qu'à celui du haut (BB) — c'était la vraie cause du
 * chevauchement de BB avec le pot, pas une particularité de BB lui-même (cf. discussion sur
 * l'architecture du replayer). En redescendant le bloc de ce décalage, les deux sièges du milieu
 * récupèrent une marge égale des deux côtés, sans qu'aucun jeton n'ait besoin de bouger sur le
 * côté pour l'éviter.
 * Ce décalage ne dépend NI de la taille de la table NI de celle des cartes du board : dans le
 * calcul de l'écart entre BB et Hero, ces deux grandeurs s'annulent (elles pénalisent les deux
 * côtés à égalité) — seule l'asymétrie propre à la pastille du pot compte. C'est ce qui rend cette
 * valeur valable à n'importe quelle taille d'écran, sans avoir besoin de la recalculer.
 */
export function boardVerticalOffset(potPillHeight: number = POT_PILL_HEIGHT): number {
  return (SEAT_INNER_EDGE_TOP_HALF - SEAT_INNER_EDGE_BOTTOM_HALF) / 2 + potPillHeight / 2;
}

// Taille d'une carte du board (community cards) : SOURCE UNIQUE partagée avec `BoardView` et le
// placement des jetons, pour que les deux ne se désynchronisent jamais.
// La largeur du board est plafonnée à une FRACTION de la largeur de table (0.5) plutôt qu'à une
// taille de carte fixe : sur un petit écran, le board rétrécit donc proportionnellement au lieu de
// rester large et de manger l'anneau de felt où se posent les mises. Le plafond dur à 34px empêche
// juste les cartes de grossir démesurément sur grand écran.
const BOARD_CARD_GAP = 4;
const BOARD_CARD_ASPECT = 46 / 34;
export function boardCardSize(tableWidth: number): { width: number; height: number } {
  if (tableWidth <= 0) return { width: 34, height: 46 };
  const maxCardsWidth = tableWidth * 0.5;
  const width = Math.max(18, Math.min(34, (maxCardsWidth - 4 * BOARD_CARD_GAP) / 5));
  return { width, height: Math.round(width * BOARD_CARD_ASPECT) };
}

/**
 * Est-ce qu'un siège "du milieu" (BB, Hero) a assez de place, UNE FOIS le board recentré
 * (`boardVerticalOffset`), pour la pile de jetons pleine taille plutôt que le rendu compact ?
 * Calculé à partir de la géométrie RÉELLE de la table au moment du rendu (largeur, hauteur) —
 * jamais d'une valeur figée à une seule taille d'écran. Sur une table plus grande, `ry` grandit
 * alors que le contenu (cartes, badge, board, pot) garde une taille fixe : la marge disponible
 * grandit donc naturellement, et la pile complète redevient possible.
 */
export function centerSeatChipFits(
  tableWidth: number,
  tableHeight: number,
  spaceNeeded: number,
  potPillHeight: number = POT_PILL_HEIGHT
): boolean {
  const ry = seatEllipseRy(tableHeight);
  const { height: cardHeight } = boardCardSize(tableWidth);
  // Marge disponible pour BB ET pour Hero, une fois le board recentré à égalité entre les deux
  // (dérivée de la même géométrie que `boardVerticalOffset`).
  const balancedGap = ry - (SEAT_INNER_EDGE_TOP_HALF - 1) - cardHeight / 2 - potPillHeight / 2;
  return balancedGap >= spaceNeeded;
}

/** Rayon vertical de l'ellipse des sièges — extrait pour être réutilisé par le calcul de centrage du board. */
export function seatEllipseRy(height: number, seatMarginRatio = 0.16): number {
  // Les cartes + le badge (nom, position, stack) d'un siège sont dessinés AU-DESSUS de lui.
  // On plafonne le rayon vertical pour que les sièges du haut et du bas gardent toujours
  // cette marge dans la table, sinon leurs cartes/badges débordent et sont coupés par le
  // bord du feutre — ou chevauchent le pot flottant au centre.
  return Math.min((height / 2) * (1 - seatMarginRatio * 0.6), height / 2 - CARD_MARGIN);
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
  const ry = seatEllipseRy(height, seatMarginRatio);

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
