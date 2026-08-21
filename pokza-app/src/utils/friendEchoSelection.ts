import type { FriendEcho } from '../types/poker';

/**
 * Combien de mains d'une page de 10 peuvent porter la mention « Julien a aimé cette main ».
 *
 * Ni 100 %, ni tirage au sort. À 100 % la ligne devient du papier peint dès que le lecteur a
 * quelques amis actifs — et elle coûte ~20 pt de hauteur sur un feed déjà mesuré à 942 pt par main
 * pour 700 disponibles. Au hasard, elle apparaîtrait et disparaîtrait d'un rendu à l'autre : on
 * remonte dans le fil, la mention n'est plus là, ça se lit comme une panne.
 */
export const FRIEND_ECHO_MAX_PER_PAGE = 3;

/** Une réaction d'ami, `likes` et `comments` ramenés à la même forme. */
export interface ReactionRow {
  postId: string;
  userId: string;
  createdAt: string;
}

interface PostReactions {
  /** Amis DISTINCTS : un ami qui commente trois fois ne compte qu'une. */
  userIds: Set<string>;
  latestUserId: string;
  latestAt: string;
}

/** Les lignes arrivent triées du plus récent au plus ancien : la PREMIÈRE vue pour une main est
 * donc la plus récente, aucune date à comparer. */
function groupByPost(rows: ReactionRow[]): Map<string, PostReactions> {
  const byPost = new Map<string, PostReactions>();
  for (const row of rows) {
    const seen = byPost.get(row.postId);
    if (seen) seen.userIds.add(row.userId);
    else byPost.set(row.postId, { userIds: new Set([row.userId]), latestUserId: row.userId, latestAt: row.createdAt });
  }
  return byPost;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Choisit les mains d'une page qui porteront la mention, et ce qu'elle dira.
 *
 * Séparé de l'accès à la base parce que c'est ici qu'est toute la logique — priorité du
 * commentaire sur le like, comptage des amis distincts, plafond, stabilité de l'ordre — et que
 * cette logique se vérifie sans base (cf. `scripts/test-friend-echo.js`).
 *
 * `likeRows` et `commentRows` doivent déjà être triées du plus récent au plus ancien et ne
 * contenir que des amis du lecteur.
 */
export function pickFriendEchoes(
  candidateIds: string[],
  likeRows: ReactionRow[],
  commentRows: ReactionRow[],
  pseudoById: Map<string, string>
): Map<string, FriendEcho> {
  const likesByPost = groupByPost(likeRows);
  const commentsByPost = groupByPost(commentRows);

  // Commenter prime sur aimer : c'est le geste le plus engageant, et mélanger les deux verbes sur
  // une ligne (« Julien a aimé et Marc a commenté ») la rend illisible.
  const found = candidateIds.flatMap((postId) => {
    const commented = commentsByPost.get(postId);
    const source = commented ?? likesByPost.get(postId);
    if (!source) return [];
    const name = pseudoById.get(source.latestUserId);
    // Pseudo introuvable = compte supprimé entre-temps : on saute plutôt que d'écrire « ? a aimé ».
    if (!name) return [];
    const echo: FriendEcho = { kind: commented ? 'comment' : 'like', name, otherCount: source.userIds.size - 1 };
    return [{ postId, friendCount: source.userIds.size, latestAt: source.latestAt, echo }];
  });

  // Départage jusqu'au bout, id compris : une même page rechargée (retour d'un profil, reprise de
  // l'app) doit porter EXACTEMENT les mêmes mentions, sinon elles clignotent.
  // Comparaison brute et non `localeCompare` : la collation ICU peut traiter la ponctuation comme
  // négligeable, et nos dates ISO se départagent justement sur « + » contre « . ».
  found.sort((a, b) => b.friendCount - a.friendCount || compare(b.latestAt, a.latestAt) || compare(a.postId, b.postId));

  return new Map(found.slice(0, FRIEND_ECHO_MAX_PER_PAGE).map((item) => [item.postId, item.echo]));
}
