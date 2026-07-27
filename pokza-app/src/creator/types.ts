import type { GameType, Position, Visibility } from '../types/poker';

export type AnteType = 'none' | 'bb' | 'per-player';

export interface ContextData {
  gameType: GameType;
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

export const DESCRIPTION_MAX_LENGTH = 600;

export interface ReviewData {
  title: string;
  description?: string;
  voteQuestion?: string;
  voteOptions?: string[];
  visibility: Visibility;
}

export const DEFAULT_CONTEXT: ContextData = {
  gameType: 'cash',
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
