import type { CodeDevise } from '../utils/currency';

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
  | 'UTG' | 'UTG1' | 'UTG2' | 'UTG3' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export interface Seat {
  id: string;
  position: Position;
  /** Nom affiché ; si absent, l'acronyme de position est utilisé */
  playerName?: string;
  isHero: boolean;
  startingStack: number;
  /** Connues seulement pour le hero, ou si un joueur a montré ses cartes. Longueur variable selon la
   * variante : 2 en Hold'em, 4 en PLO, 5 en PLO5 (cf. `holeCardCount`). */
  holeCards?: Card[];
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
export type Variant = 'nlhe' | 'plo' | 'plo5';
export type Visibility = 'public' | 'private' | 'group';
/** État de modération d'un contenu, DISTINCT de `Visibility` (qui est la portée sociale voulue par
 * l'auteur). `visible` = normal ; `hidden`/`removed` = décision de modération. La RLS ne renvoie un
 * contenu non `visible` qu'à son propre auteur (pour lui afficher le bandeau), jamais aux autres. */
export type ModStatus = 'visible' | 'hidden' | 'removed';

/** Nombre de cartes fermées par joueur selon la variante : 2 en Hold'em, 4 en PLO, 5 en PLO5.
 * Tolérant à `undefined` (anciennes mains sans champ `variant`) → 2, le défaut Hold'em. */
export function holeCardCount(variant: Variant | undefined): number {
  return variant === 'plo5' ? 5 : variant === 'plo' ? 4 : 2;
}

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
  /** Second board d'un bomb pot en "double board" : deux boards distincts sont distribués, chacun
   * remporte la moitié du pot (gagner les deux = scoop). Absent = un seul board (cas normal). Les
   * cartes des deux boards se révèlent ensemble à chaque street (même event `reveal`). */
  board2?: Board;
  actions: Action[];
  /** Bomb pot : pas de preflop, chaque joueur poste un ante fixe (la "bombe") et on voit le flop
   * directement, puis mises normales flop/turn/river. Techniquement, la main n'a que des `post-ante`
   * en preflop (un par siège) et aucune blinde. Ce drapeau ne sert qu'à l'affichage (libellé) — le
   * moteur reconstitue tout à partir des actions. Absent/false = main classique. */
  bombPot?: boolean;
  /** Devise dans laquelle les montants de cette main sont écrits (cf. `DEVISES`). ABSENTE sur toute
   * main publiée avant l'arrivée du sélecteur : elle se lit alors comme l'euro (cf. `devise`), ce
   * qui les laisse s'afficher exactement comme avant, sans migration. Ignorée en tournoi, où les
   * jetons ne sont pas de l'argent réel. */
  currency?: CodeDevise;
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
  /** Date de la dernière modification du CONTENU (cf. trigger `posts_mark_edited`). Absente = la
   * main n'a jamais été retouchée. Ce n'est pas encore la mention « modifié » à l'écran : celle-ci
   * n'apparaît qu'au-delà du délai de grâce, cf. `wasEdited()`. */
  editedAt?: string;
  location?: string;
  buyIn?: string;
  level?: string;
  title: string;
  /** Contexte détaillé de la main, écrit par l'auteur. Limité à 600 caractères (cf. PostCard). */
  description?: string;
  hand: Hand;
  voteQuestion?: string;
  voteOptions?: string[];
  /** Nombre de votes déjà reçus par option (clé = texte de l'option), calculé en direct côté base
   * à partir de la table `votes` — jamais stocké tel quel sur le post. */
  voteCounts?: Record<string, number>;
  /** Option déjà choisie par l'utilisateur courant, s'il a déjà voté (cf. vue `posts_feed`). */
  myVote?: string;
  likeCount: number;
  commentCount: number;
  /** Vrai si l'utilisateur courant a déjà liké ce post (résolu côté base, cf. vue `posts_feed`). */
  likedByMe?: boolean;
  /** Renseignés seulement dans le feed principal (vue `posts_ranked`), qui classe par affinité
   * sociale — absents sur la page de profil, qui reste chronologique. */
  authorIsFriend?: boolean;
  mutualFriendCount?: number;
  visibility: Visibility;
  /** État de modération (cf. `ModStatus`). Absent/`visible` = normal ; sinon la RLS ne l'a laissé
   * passer que parce que l'utilisateur courant EST l'auteur → on lui montre un bandeau. */
  modStatus?: ModStatus;
  /** Requis si `visibility === 'group'`. */
  groupId?: string;
  /** Nom du groupe, pour la pastille 👥. Renseigné dans le feed principal (vue `posts_ranked`) et
   * sur la page de profil (complété par `attachGroupNames`) — volontairement absent sur la page du
   * groupe lui-même, où rappeler le groupe n'aurait aucun sens. */
  groupName?: string;
  /** Mention sociale du feed, cf. `FriendEcho`. Absente partout ailleurs. */
  friendEcho?: FriendEcho;
}

/**
 * « Julien et 2 autres amis ont aimé cette main » : la ligne discrète qui explique pourquoi une
 * main d'inconnu est dans le fil. Renseignée par `attachFriendEchoes`, et UNIQUEMENT dans le feed
 * principal — sur un profil ou dans un groupe elle n'expliquerait rien (tout y vient de la même
 * personne, ou tout le monde y voit déjà tout).
 */
export interface FriendEcho {
  /** Les deux réactions ne se mélangent jamais sur une ligne : commenter prime sur aimer. */
  kind: 'like' | 'comment';
  /** Pseudo de l'ami dont la réaction est la plus récente — le seul nom affiché. */
  name: string;
  /** Nombre d'AUTRES amis ayant fait la même chose. 0 = cet ami est seul. */
  otherCount: number;
}

export interface Comment {
  id: string;
  postId: string;
  /** Absent pour un commentaire de premier niveau, sinon id du commentaire auquel il répond —
   * une seule profondeur de réponse (pas de réponse à une réponse), volontairement simple. */
  parentCommentId?: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  /** État de modération (cf. `ModStatus`). Comme pour `Post` : non `visible` n'arrive au client que
   * pour l'auteur du commentaire, à qui on affiche un bandeau à la place du contenu. */
  modStatus?: ModStatus;
  /** Lien signé temporaire (bucket privé) vers la photo jointe — absent si le commentaire n'en a
   * pas. Régénéré à chaque chargement, ne jamais le mettre en cache au-delà de la session. */
  imageUrl?: string;
  /** URL GIPHY directe — publique par nature (un GIF choisi dans une recherche), pas besoin de
   * lien signé contrairement à une photo personnelle. */
  gifUrl?: string;
  /** Dimensions réelles de la photo/du GIF joint — permet d'afficher selon les vraies proportions
   * (plafonnées en hauteur) plutôt que de recadrer dans une boîte de taille arbitraire. */
  mediaWidth?: number;
  mediaHeight?: number;
}
