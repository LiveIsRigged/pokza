import type { GameType, Position, Variant, Visibility } from '../types/poker';

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
  /** Noms des adversaires par position, optionnel (sinon l'acronyme de position est affiché) */
  opponentNames?: Partial<Record<Position, string>>;
  /** Stack par position, optionnel (sinon "Stack effectif" s'applique à tous) */
  seatStacks?: Partial<Record<Position, number>>;
  /** Type d'ante : aucun, "BB ante" (posté uniquement par la BB), ou un ante par joueur */
  anteType: AnteType;
  /** Montant de l'ante (par joueur, ou pour la BB si anteType === 'bb') */
  ante: number;
  /** Nombre de straddles consécutifs (cash game uniquement), postés par les joueurs successifs
   * après la BB : 0 = aucun, 1 = simple, 2 = double, 3 = triple. */
  straddleCount: 0 | 1 | 2 | 3;
  /** Montant du premier straddle (par défaut 2x la BB) — le double vaut 2x ce montant, le triple 4x. */
  straddleAmount: number;
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
  heroPosition: 'CO',
  anteType: 'none',
  ante: 0,
  straddleCount: 0,
  straddleAmount: 0,
};
