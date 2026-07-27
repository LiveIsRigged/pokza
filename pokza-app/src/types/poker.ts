// Modèle de données central du replayer.
// Doit pouvoir être alimenté à la fois par le formulaire live (saisie manuelle)
// et par le parser online (extraction depuis une hand history texte).

export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type Position =
  | 'UTG' | 'UTG1' | 'UTG2' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export interface Seat {
  id: string;
  position: Position;
  /** Nom affiché ; si absent, l'acronyme de position est utilisé */
  playerName?: string;
  isHero: boolean;
  startingStack: number;
  /** Connues seulement pour le hero, ou si un joueur a montré ses cartes */
  holeCards?: [Card, Card];
}

export interface Board {
  flop?: [Card, Card, Card];
  turn?: Card;
  river?: Card;
}

export type ActionType =
  | 'post-sb'
  | 'post-bb'
  | 'post-ante'
  | 'post-straddle'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise';

export interface Action {
  id: string;
  street: Street;
  seatId: string;
  type: ActionType;
  /** Montant total misé par ce joueur sur cette action (pas juste l'incrément) */
  amount?: number;
  /** Ordre séquentiel global de l'action dans la main, toutes streets confondues */
  order: number;
}

export type GameType = 'cash' | 'tournament';
export type Variant = 'nlhe' | 'plo';
export type Visibility = 'public' | 'private' | 'group';

export interface Blinds {
  sb: number;
  bb: number;
  ante?: number;
}

export interface Hand {
  id: string;
  variant: Variant;
  gameType: GameType;
  blinds: Blinds;
  effectiveStack: number;
  visibility: Visibility;
  seats: Seat[];
  board: Board;
  actions: Action[];
  /** Contrôle QUAND les mains adverses saisies à l'abattage deviennent visibles dans le replayer.
   * Activé : cachées pendant tout le coup, révélées seulement à l'abattage (gagnant ou perdant).
   * Désactivé (défaut) : visibles dès le début du replay, comme Hero. Sans effet sur un adversaire
   * dont les cartes n'ont pas été saisies (toujours mucké) ni sur Hero (toujours visible). */
  revealShowdown?: boolean;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  createdAt: string;
  location?: string;
  buyIn?: string;
  level?: string;
  title: string;
  /** Contexte détaillé de la main, écrit par l'auteur. Limité à 600 caractères (cf. PostCard). */
  description?: string;
  hand: Hand;
  voteQuestion?: string;
  voteOptions?: string[];
  /** Nombre de votes déjà reçus par option (clé = texte de l'option) */
  voteCounts?: Record<string, number>;
  likeCount: number;
  commentCount: number;
  visibility: Visibility;
}
