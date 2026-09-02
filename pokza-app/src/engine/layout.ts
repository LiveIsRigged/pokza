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

/**
 * LE GABARIT : la taille de ce que la table dessine.
 * ──────────────────────────────────────────────────
 * Deux tables coexistent désormais. Celle du FEED est une vitrine : elle a toute la largeur d'un
 * post et n'a rien d'autre à partager son écran. Celle de l'ATELIER (le créateur de main) vit
 * au-dessus d'une rangée de boutons, d'un sélecteur de cartes et d'un formulaire — elle n'a pas
 * la place d'être belle, elle doit être juste.
 *
 * Trois réductions, décidées avec Victor le 30/08/2026 après mesure de chaque levier séparément.
 * La leçon de cette mesure vaut d'être gardée : **aucun levier ne fait rien tout seul**. Réduire
 * les cartes des adversaires, à soi seul, ne rend que 13 px sur les 414 du plancher ; le board
 * seul en rend zéro. C'est la combinaison des trois qui fait tomber le plancher à 356.
 *
 *   1. les cartes des ADVERSAIRES passent à 24×32 — ce sont des dos, il n'y a rien à y lire ;
 *      celles de Hero ne bougent pas, ce sont les seules qui disent quelque chose ;
 *   2. le board plafonne à 26 px de large au lieu de 34 — pas une taille nouvelle : `boardCardSize`
 *      la produit déjà sur une table de 324 px de large, et sa borne basse est 18 ;
 *   3. le bloc de mise perd 4 px de haut (un cran de la pile de jetons), pas son montant.
 *
 * Ce qui NE change pas dans l'atelier : la largeur du bloc de mise (c'est elle qui décide où le
 * montant se coupe, cf. `CHIP_BLOCK_W` dans SeatView), et le badge nom+stack.
 */
export interface Gabarit {
  /** Cartes fermées d'un adversaire (dos, ou main révélée) — variantes à 2 cartes uniquement. */
  carteVilain: { width: number; height: number };
  /** Cartes fermées de Hero. Jamais réduites. */
  carteHero: { width: number; height: number };
  /** Hauteur supposée du badge nom + stack. */
  badgeHeight: number;
  /** Plafond de la largeur d'une carte de board (la formule reste proportionnelle à la table). */
  boardCardMax: number;
  /** Hauteur du bloc « pile de jetons + montant » posé devant un siège. */
  chipBlockHeight: number;
  /** Taille d'un jeton dessiné et nombre de jetons empilés visibles. */
  chipTokenSize: number;
  chipsVisibles: number;
  /**
   * Le halo « à toi de parler » est-il APPUYÉ (fond plein sous le badge) plutôt qu'un simple trait ?
   * Vrai dans l'atelier seulement : le créateur n'a plus la phrase « À X de jouer » (retirée le
   * 30/08), donc le halo est le SEUL signal de qui doit parler — un trait doré de 1,5 px suffit
   * quand il double une phrase, moins quand il est seul, et encore moins à dix joueurs.
   */
  haloAppuye?: boolean;
}

export const SEAT_CARDS_GAP = 4;

export const GABARIT_FEED: Gabarit = {
  carteVilain: { width: 34, height: 46 },
  carteHero: { width: 34, height: 46 },
  badgeHeight: 30,
  boardCardMax: 34,
  chipBlockHeight: 29,
  chipTokenSize: 11,
  chipsVisibles: 3,
};

export const GABARIT_ATELIER: Gabarit = {
  carteVilain: { width: 24, height: 32 },
  carteHero: { width: 34, height: 46 },
  badgeHeight: 30,
  boardCardMax: 26,
  chipBlockHeight: 25,
  chipTokenSize: 9,
  chipsVisibles: 2,
  haloAppuye: true,
};

/**
 * LE DOUBLE BOARD D'UN BOMB POT, où tout est dessiné plus petit.
 * ─────────────────────────────────────────────────────────────
 * Deux rangées de board au lieu d'une, c'est 41 px de plus au centre de la table — et le centre est
 * précisément l'endroit où les jetons de mise viennent buter. Mesuré : à six joueurs, garder les
 * cartes de l'atelier ferait passer le plancher de 342 à 460 px. Une table pareille ne laisserait
 * plus rien au sélecteur ni aux champs.
 *
 * On paye donc en taille plutôt qu'en hauteur, pour CE FORMAT SEULEMENT (décision de Victor,
 * 31/08/2026) : cartes du board à 18 (le minimum absolu de `boardCardSize`) et un cran de jeton en
 * moins dans les piles. Il reste malgré tout +45 px au pire — mesuré, pas estimé : la seconde
 * rangée ne peut pas être gratuite.
 *
 * ⚠️ RÉDUIRE LES CARTES DES ADVERSAIRES N'ACHÈTE PAS DE BOARD — mesuré le 31/08 après que Victor
 * a proposé l'échange. Descendre les vilains de 24×32 à 18×24, une réduction énorme, ne rend que
 * 14 px au six-max, tandis que remonter le board de 18 à 20 en coûte 20. La contrainte n'est pas
 * la taille des sièges mais le trajet des jetons vers le centre. Les cartes des adversaires
 * gardent donc leur taille d'atelier : une déviation visuelle de moins, pour 5 px.
 */
export const GABARIT_ATELIER_DOUBLE: Gabarit = {
  ...GABARIT_ATELIER,
  boardCardMax: 18,
  chipBlockHeight: 21,
  chipsVisibles: 1,
};

/**
 * HAUTEUR DE LA TABLE DANS LE CRÉATEUR, par nombre de sièges.
 * ──────────────────────────────────────────────────────────
 * Le feed impose `largeur × 1,25` et n'a personne avec qui partager l'écran. L'atelier, lui, vit
 * au-dessus d'une rangée de boutons et d'un sélecteur de cartes : il prend le PLANCHER de son
 * nombre de sièges, et pas un pixel de plus.
 *
 * Ces valeurs sont RELEVÉES, pas devinées : `scripts/test-table-geometrie.js` rejoue le modèle de
 * collision (sièges, jetons de mise, board, pastille de pot) et vérifie que chacune reste au-dessus
 * du plancher mesuré, à toutes les largeurs d'iPhone. Trois décisions sont incorporées :
 *
 *   • le maximum SUR LES LARGEURS, pour que la table ne change pas de taille d'un téléphone à
 *     l'autre — le plancher brut varie de 60 px entre 339 et 430 px de large à neuf joueurs ;
 *   • un maximum COURANT sur le nombre de sièges, pour que sept joueurs ne donnent jamais une table
 *     plus courte que six. Le plancher brut, lui, n'est pas monotone (l'angle entre deux sièges
 *     voisins change le siège qui coince), et une table qui rapetisse quand on ajoute un joueur
 *     serait incompréhensible ;
 *   • rien en dessous de 268 px : c'est le plancher des tables de 2 à 4 joueurs, où plus rien ne
 *     se chevauche et où c'est le board au centre qui commande.
 */
const HAUTEURS_ATELIER: Record<number, number> = {
  2: 268, 3: 268, 4: 268, 5: 300, 6: 342, 7: 342, 8: 342, 9: 387, 10: 425,
};

/**
 * Et les mêmes planchers pour un DOUBLE BOARD (cf. `GABARIT_ATELIER_DOUBLE`), relevés de la même
 * façon : maximum sur les largeurs d'iPhone, puis maximum courant sur le nombre de sièges.
 *
 * Deux valeurs surprennent et sont justes :
 *   • 3 joueurs coûte plus cher que 4 (311 contre 279) — et seulement sur l'iPhone le plus étroit
 *     (339 px), où le board rétrécit avec la table mais pas les jetons. Le maximum courant tire
 *     donc 4 à 311 avec lui ;
 *   • à 9 et 10 joueurs, rien n'est ajouté : les hauteurs du board simple couvrent déjà tout, parce
 *     que le board y est dessiné plus petit et que ce sont les sièges qui commandent.
 */
const HAUTEURS_ATELIER_DOUBLE: Record<number, number> = {
  2: 279, 3: 311, 4: 311, 5: 316, 6: 387, 7: 387, 8: 387, 9: 387, 10: 425,
};

export function hauteurTableAtelier(nbSieges: number, doubleBoard = false): number {
  const borne = Math.max(2, Math.min(10, Math.round(nbSieges)));
  return (doubleBoard ? HAUTEURS_ATELIER_DOUBLE : HAUTEURS_ATELIER)[borne];
}

/**
 * LE GABARIT DE L'ÉTAPE 1 — « La table ».
 * ───────────────────────────────────────
 * L'atelier avec ses cartes à 80 %. Rien d'autre ne change : mêmes badges, mêmes jetons.
 *
 * ⚠️ L'ÉTAPE 2 NE L'UTILISE PAS (choix de Victor, 01/09/2026). Elle garde les cartes de l'atelier :
 * c'est l'écran où l'on choisit SA main et où on la regarde apparaître sur le feutre — le plus
 * mauvais endroit pour rapetisser des cartes. Le gain qu'on y perd est petit et mesuré : les 80 %
 * ne rendent que 26 à 33 px au-delà de l'aplatissement, alors que l'aplatissement seul suffit à
 * empêcher le sélecteur de défiler (cf. `hauteurTableCartes`).
 *
 * Pourquoi ce sont les CARTES qu'on réduit, et pas autre chose (mesuré le 01/09/2026, après que
 * Victor a entouré le vide au centre d'une table à dix) : la hauteur d'une table est commandée par
 * la hauteur du BLOC d'un siège — cartes + écart + badge — et par elle seule. Rentrer les sièges
 * vers le centre EMPIRE tout (le plancher à dix passe de 345 à 489 quand on resserre l'ellipse) :
 * dix plaques de 80 px demandent 800 px de tour, et raccourcir l'anneau les fait se percuter. Le
 * trou au milieu n'est pas de la place perdue, c'est l'intérieur d'un anneau presque plein.
 *
 * Les cartes de HERO comptent double : c'est leur demi-hauteur que `seatEllipseRy` retranche pour
 * plafonner le rayon vertical. Les réduire raccourcit le bloc ET agrandit l'ellipse.
 *
 * 80 % est le choix de Victor entre les échelles mesurées. En dessous, les cartes des adversaires
 * passeraient sous les 18 px de `boardCardSize` et la cible tactile d'un siège tomberait à la
 * moitié de sa surface.
 */
export const GABARIT_CONTEXTE: Gabarit = {
  ...GABARIT_ATELIER,
  carteVilain: { width: 19, height: 26 },
  carteHero: { width: 27, height: 37 },
};

/**
 * LES PLANCHERS DES DEUX ÉTAPES DE RÉGLAGE, où la main n'a pas commencé.
 * ─────────────────────────────────────────────────────────────────────
 * Deux choses les font descendre bien plus bas que ceux de l'atelier :
 *
 *   • le board est absent (`TableVue.sansBoard`) ;
 *   • ⚠️ SEULES LA SB ET LA BB ONT UN JETON DEVANT ELLES. Personne n'a encore agi : il n'y a que les
 *     blindes. Le modèle qui posait un jeton devant CHAQUE siège mesurait une autre table que celle
 *     qu'on dessine, et c'est ce qui a fait annoncer 425 px à dix joueurs pendant tout août.
 *
 * Relevés au maximum sur les largeurs d'iPhone (339 → 430), puis maximum courant sur le nombre de
 * sièges — ajouter un joueur ne doit jamais rétrécir la table. Le maximum courant est ce qui tient
 * 3, 6 et 7 joueurs au-dessus de leur plancher propre.
 *
 * ⚠️ Chaque table va avec SON gabarit, et les rejouer avec l'autre ferait mordre des jetons ;
 * `scripts/test-table-geometrie.js` le vérifie pour les deux.
 */
const HAUTEURS_CONTEXTE: Record<number, number> = {
  2: 211, 3: 211, 4: 211, 5: 226, 6: 233, 7: 233, 8: 241, 9: 274, 10: 312,
};

/** Étape 2, cartes de l'atelier : mêmes règles, blocs plus hauts, donc planchers plus hauts. */
const HAUTEURS_CARTES: Record<number, number> = {
  2: 226, 3: 226, 4: 226, 5: 235, 6: 242, 7: 242, 8: 267, 9: 303, 10: 345,
};

const borneSieges = (n: number) => Math.max(2, Math.min(10, Math.round(n)));

/** Étape 1 « La table » — avec `GABARIT_CONTEXTE`. */
export function hauteurTableContexte(nbSieges: number): number {
  return HAUTEURS_CONTEXTE[borneSieges(nbSieges)];
}

/** Étape 2 « Tes cartes » — avec `GABARIT_ATELIER`, cartes pleine taille. */
export function hauteurTableCartes(nbSieges: number): number {
  return HAUTEURS_CARTES[borneSieges(nbSieges)];
}

/** Hauteur du bloc d'un siège : rangée de cartes + écart + badge. */
export function blocSiegeHauteur(g: Gabarit, hero: boolean): number {
  return (hero ? g.carteHero.height : g.carteVilain.height) + SEAT_CARDS_GAP + g.badgeHeight;
}

/**
 * Distance de l'ancre du siège (le point renvoyé par `layoutSeats`) jusqu'au HAUT de son bloc.
 *
 * Le feed garde sa valeur historique, 39 pour un bloc de 80 — un pixel au-dessus du centre, et il
 * n'y a aucune raison de le corriger : ce serait déplacer six sièges pour rien. L'atelier, lui,
 * centre chaque bloc sur son point, sans quoi un siège aux cartes réduites flotterait 7 px trop
 * haut sur l'ellipse.
 */
export function ancreDepuisLeHaut(g: Gabarit, hero: boolean): number {
  if (g.carteVilain.height === g.carteHero.height && g.carteHero.height === 46) return 39;
  return blocSiegeHauteur(g, hero) / 2;
}

// Conservés pour les appelants qui raisonnent encore sur le gabarit du feed.
export const SEAT_CARDS_HEIGHT = GABARIT_FEED.carteHero.height;
export const SEAT_BADGE_HEIGHT = GABARIT_FEED.badgeHeight;

/**
 * Bord du contenu d'un siège le plus proche du centre de la table : le bas du badge pour un siège
 * du haut (toujours un adversaire — Hero est fixé en bas), le haut des cartes pour Hero.
 */
export function bordInterieurHaut(g: Gabarit): number {
  return blocSiegeHauteur(g, false) - ancreDepuisLeHaut(g, false);
}
export function bordInterieurBas(g: Gabarit): number {
  return ancreDepuisLeHaut(g, true);
}

export const SEAT_INNER_EDGE_TOP_HALF = bordInterieurHaut(GABARIT_FEED);
export const SEAT_INNER_EDGE_BOTTOM_HALF = bordInterieurBas(GABARIT_FEED);

/** Marge verticale réservée en haut et en bas de la table pour que les blocs de siège y tiennent. */
function margeCarte(g: Gabarit): number {
  return Math.max(ancreDepuisLeHaut(g, true), ancreDepuisLeHaut(g, false));
}

// Hauteur réelle de la pastille "Pot X" (ChipsView), mesurée dans le DOM rendu : texte 11px +
// paddingVertical(1×2) + bordure(1×2) = 18. À resynchroniser si le style de ChipsView change.
export const POT_PILL_HEIGHT = 18;

/**
 * Le bloc board + pot (cartes, avec la pastille du pot empilée au-dessus) n'est pas symétrique :
 * seule la pastille dépasse d'un côté. Centré naïvement sur la table, ce bloc laisse donc bien
 * plus de marge au siège du bas (Hero) qu'à celui du haut (BB) — c'était la vraie cause du
 * chevauchement de BB avec le pot, pas une particularité de BB lui-même. En redescendant le bloc
 * de ce décalage, les deux sièges du milieu récupèrent une marge égale des deux côtés, sans
 * qu'aucun jeton n'ait besoin de bouger sur le côté pour l'éviter.
 *
 * Ce décalage ne dépend NI de la taille de la table NI de celle des cartes du board : dans le
 * calcul de l'écart entre BB et Hero, ces deux grandeurs s'annulent (elles pénalisent les deux
 * côtés à égalité) — seule l'asymétrie propre à la pastille du pot compte, plus, depuis l'atelier,
 * celle des deux blocs de siège quand ils n'ont plus la même hauteur.
 */
export function boardVerticalOffset(
  potPillHeight: number = POT_PILL_HEIGHT,
  gabarit: Gabarit = GABARIT_FEED
): number {
  return (bordInterieurHaut(gabarit) - bordInterieurBas(gabarit)) / 2 + potPillHeight / 2;
}

// Taille d'une carte du board (community cards) : SOURCE UNIQUE partagée avec `BoardView` et le
// placement des jetons, pour que les deux ne se désynchronisent jamais.
// La largeur du board est plafonnée à une FRACTION de la largeur de table (0.5) plutôt qu'à une
// taille de carte fixe : sur un petit écran, le board rétrécit donc proportionnellement au lieu de
// rester large et de manger l'anneau de felt où se posent les mises. Le plafond dur (34 au feed,
// 26 à l'atelier) empêche juste les cartes de grossir démesurément sur grand écran.
const BOARD_CARD_GAP = 4;
const BOARD_CARD_ASPECT = 46 / 34;
export function boardCardSize(
  tableWidth: number,
  gabarit: Gabarit = GABARIT_FEED
): { width: number; height: number } {
  const max = gabarit.boardCardMax;
  if (tableWidth <= 0) return { width: max, height: Math.round(max * BOARD_CARD_ASPECT) };
  const maxCardsWidth = tableWidth * 0.5;
  const width = Math.max(18, Math.min(max, (maxCardsWidth - 4 * BOARD_CARD_GAP) / 5));
  return { width, height: Math.round(width * BOARD_CARD_ASPECT) };
}

/**
 * Rayon vertical de l'ellipse des sièges — extrait pour être réutilisé par le calcul de centrage
 * du board. Les cartes + le badge (nom, position, stack) d'un siège sont dessinés AU-DESSUS de lui :
 * on plafonne le rayon pour que les sièges du haut et du bas gardent toujours cette marge dans la
 * table, sinon leurs cartes/badges débordent et sont coupés par le bord du feutre — ou chevauchent
 * le pot flottant au centre.
 */
export function seatEllipseRy(
  height: number,
  seatMarginRatio = 0.16,
  gabarit: Gabarit = GABARIT_FEED
): number {
  return Math.min((height / 2) * (1 - seatMarginRatio * 0.6), height / 2 - margeCarte(gabarit));
}

/**
 * Place les sièges sur une ellipse, hero fixe en bas au centre.
 * Angle 90° = bas (hero), puis répartition régulière en cercle.
 */
export function layoutSeats(
  seats: Seat[],
  width: number,
  height: number,
  seatMarginRatio = 0.16,
  gabarit: Gabarit = GABARIT_FEED
): SeatCoordinate[] {
  const ordered = orderSeatsFromHero(seats);
  const n = ordered.length;
  const cx = width / 2;
  const cy = height / 2;
  const rx = (width / 2) * (1 - seatMarginRatio);
  const ry = seatEllipseRy(height, seatMarginRatio, gabarit);

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
