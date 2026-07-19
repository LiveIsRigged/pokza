import type { GameType, Position, Visibility } from '../types/poker';

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
}

export interface ReviewData {
  title: string;
  voteQuestion?: string;
  visibility: Visibility;
}

export const DEFAULT_CONTEXT: ContextData = {
  gameType: 'cash',
  sb: 2,
  bb: 5,
  effectiveStack: 500,
  numPlayers: 6,
  heroPosition: 'CO',
};
