import type { Action, Board, Card, GameType, Position, Seat, Variant, Visibility } from '../types/poker';

export type AnteType = 'none' | 'bb' | 'per-player';

export interface ContextData {
  gameType: GameType;
  /** Variante jouée : Hold'em (2 cartes), PLO (4) ou PLO5 (5). Détermine le nombre de cartes
   * fermées saisies par joueur (cf. `holeCardCount`) et la règle d'évaluation des mains. */
  variant: Variant;
  /** Bomb pot : pas de preflop, chaque joueur poste `bombAnte` et on va direct au flop. Quand actif,
   * les blindes/straddle/ante classiques sont remplacés par le seul champ `bombAnte`. */
  bombPot: boolean;
  /** Montant de l'ante posté par CHAQUE joueur en bomb pot (ignoré si `bombPot` est faux). */
  bombAnte: number;
  /** Double board (bomb pot uniquement) : deux boards, moitié du pot chacun. Ignoré si `bombPot`
   * est faux. */
  doubleBoard: boolean;
  sb: number;
  bb: number;
  effectiveStack: number;
  numPlayers: number;
  heroPosition: Position;
  location?: string;
  buyIn?: string;
  level?: string;
  /** Nom du héros, optionnel — vide, il s'affiche « Hero » partout. Séparé d'`opponentNames` (qui
   * est indexé par position) parce qu'il suit le joueur : changer de position ne doit pas donner
   * son nom au siège qu'il vient de quitter. */
  heroName?: string;
  /** Noms des adversaires par position, optionnel (sinon l'acronyme de position est affiché) */
  opponentNames?: Partial<Record<Position, string>>;
  /** Stack par position, optionnel (sinon "Stack effectif" s'applique à tous) */
  seatStacks?: Partial<Record<Position, number>>;
  /** Type d'ante : aucun, "BB ante" (posté uniquement par la BB), ou un ante par joueur */
  anteType: AnteType;
  /** Montant de l'ante (par joueur, ou pour la BB si anteType === 'bb') */
  ante: number;
  /** Nombre TOTAL de straddles de la main (cash game uniquement) : 0 = aucun, 1 = simple, 2 =
   * double, 3 = triple. Postés par les joueurs successifs après la BB — sauf le DERNIER quand
   * `straddleBouton` est vrai, qui passe alors au bouton (cf. `straddlesAPoster`). « Double », ce
   * sont donc toujours deux straddles : UTG + UTG1, ou UTG + bouton. */
  straddleCount: 0 | 1 | 2 | 3;
  /** Montant du premier straddle de la chaîne (par défaut 2x la BB) — le suivant vaut 2x ce
   * montant, celui d'après 4x. Sans objet quand la chaîne est vide (`straddleCount` à 1 avec
   * `straddleBouton`) : le seul straddle est alors celui du bouton. */
  straddleAmount: number;
  /** Le dernier straddle est posté par le BOUTON au lieu du siège suivant de la chaîne. L'action
   * s'ouvre alors à la SB et le bouton parle en dernier — c'est tout ce que le "BTN straddle"
   * change au déroulé. */
  straddleBouton: boolean;
  /** Montant du straddle du bouton (ignoré si `straddleBouton` est faux). Libre, et proposé à 2x
   * le dernier straddle de la chaîne — 2x la BB quand il n'y en a pas. */
  straddleBoutonMontant: number;
}

// Réexporté depuis la source unique des limites, pour ne pas casser les imports existants.
export { DESCRIPTION_MAX_LENGTH } from '../constants/limits';

export interface ReviewData {
  title: string;
  description?: string;
  voteQuestion?: string;
  voteOptions?: string[];
  visibility: Visibility;
  /** Requis si `visibility === 'group'`. */
  groupId?: string;
}

/**
 * Réglages qui accompagnent un contexte de tournoi : premier palier de blindes et 50BB de stack
 * (cf. `defaultStackFor` dans ContextStep). Partagés entre la chip « Tournoi » du formulaire et la
 * présélection d'après le format favori du joueur (cf. `defaultContextForPlayer`), pour que les
 * deux chemins donnent exactement la même table de départ.
 */
export const TOURNAMENT_DEFAULTS = { sb: 100, bb: 200, effectiveStack: 200 * 50 } as const;

/**
 * Table de départ d'une main, avant toute personnalisation. `heroPosition` vaut BTN : c'est la
 * position la plus souvent racontée (et le siège le plus lisible d'une table de 6).
 */
export const DEFAULT_CONTEXT: ContextData = {
  gameType: 'cash',
  variant: 'nlhe',
  bombPot: false,
  bombAnte: 5,
  doubleBoard: false,
  sb: 2,
  bb: 5,
  effectiveStack: 500,
  numPlayers: 6,
  heroPosition: 'BTN',
  anteType: 'none',
  ante: 0,
  straddleCount: 0,
  straddleAmount: 0,
  straddleBouton: false,
  straddleBoutonMontant: 0,
};

/**
 * Les étapes du créateur, dans l'ordre. Un bomb pot saute `street-preflop` (chacun poste sa bombe
 * et on voit le flop directement), et `showdown` reste un écran optionnel intercalé avant la
 * publication — seulement s'il reste un adversaire en jeu.
 *
 * Vit ici plutôt que dans `LiveHandCreator` pour que la reprise d'une main publiée
 * (cf. `rehydrate.ts`) puisse reconstituer une pile d'historique sans importer le composant.
 */
export type Phase =
  | 'context'
  | 'holeCards'
  | 'street-preflop'
  | 'street-flop'
  | 'street-turn'
  | 'street-river'
  | 'showdown'
  | 'review';

/**
 * L'état du créateur à un instant donné, empilé AVANT chaque changement d'étape — c'est ce qui rend
 * le retour arrière possible sans perdre ni dupliquer les données.
 *
 * ⚠️ Un instantané porte l'état tel qu'il était PENDANT son étape, donc AVANT les données que cette
 * étape produit : l'instantané de `street-flop` ne contient pas le flop, qui n'est posé qu'en la
 * quittant. Revenir à une street y efface donc tout ce qui suit — comportement voulu, et ce qui
 * fait qu'on ne peut pas corriger une mise preflop sans ressaisir la suite.
 */
export interface Snapshot {
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
