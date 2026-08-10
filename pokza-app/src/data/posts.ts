import { supabase } from '../lib/supabase';
import type { Hand, ModStatus, Post, Visibility } from '../types/poker';

// Forme exacte renvoyée par la vue `posts_feed` (cf. script SQL) : author_name/avatar déjà résolus
// côté base via `get_display_name`, pas besoin de refaire cette logique ici.
interface PostFeedRow {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  created_at: string;
  location: string | null;
  buy_in: string | null;
  level: string | null;
  title: string;
  description: string | null;
  hand: Hand;
  vote_question: string | null;
  vote_options: string[] | null;
  vote_counts: Record<string, number>;
  my_vote: string | null;
  like_count: number;
  comment_count: number;
  visibility: Visibility;
  liked_by_me: boolean;
  /** Ajouté en fin des 4 vues de lecture par la migration modération. Non `visible` = l'auteur
   * regarde son propre contenu modéré (la RLS ne le laisse pas passer aux autres). */
  mod_status?: ModStatus;
  /** Présents uniquement via la vue `posts_ranked` (feed principal), pas sur `posts_feed`. */
  author_is_friend?: boolean;
  mutual_friend_count?: number;
  /** Présent uniquement via la vue `posts_feed_with_group` (page d'un groupe). */
  group_id?: string | null;
  /** Présent uniquement via la vue `posts_ranked` (feed principal) — cf. pastille 👥 du `PostCard`. */
  group_name?: string | null;
}

function rowToPost(row: PostFeedRow): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url ?? undefined,
    createdAt: row.created_at,
    location: row.location ?? undefined,
    buyIn: row.buy_in ?? undefined,
    level: row.level ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    hand: row.hand,
    voteQuestion: row.vote_question ?? undefined,
    voteOptions: row.vote_options ?? undefined,
    voteCounts: row.vote_counts,
    myVote: row.my_vote ?? undefined,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: row.liked_by_me,
    visibility: row.visibility,
    modStatus: row.mod_status ?? 'visible',
    groupId: row.group_id ?? undefined,
    groupName: row.group_name ?? undefined,
    authorIsFriend: row.author_is_friend,
    mutualFriendCount: row.mutual_friend_count,
  };
}

/** Nombre de mains chargées d'un coup dans le feed. Une main affiche un replayer complet, donc
 * même une dizaine représente déjà beaucoup à l'écran. */
export const FEED_PAGE_SIZE = 10;

/**
 * Feed principal : classé par affinité sociale (vue `posts_ranked`), pas par date. Un post d'ami
 * ou de quelqu'un avec beaucoup d'amis en commun remonte, sans jamais faire disparaître les
 * inconnus — sinon découvrir de nouvelles personnes deviendrait impossible sur une app qui démarre.
 *
 * Le tri secondaire par date n'est pas cosmétique : `affinity_score` produit beaucoup d'ex æquo
 * (tous les inconnus sans ami commun ont le même score), et sans départage stable Postgres est
 * libre de renvoyer ces lignes dans un ordre différent d'un appel à l'autre — une même main
 * pourrait alors apparaître sur deux pages, ou aucune.
 */
export async function fetchFeed(offset = 0): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts_ranked')
    .select('*')
    .order('affinity_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + FEED_PAGE_SIZE - 1);
  if (error) throw error;
  return (data as PostFeedRow[]).map(rowToPost);
}

/** Posts d'un seul auteur (page de profil) : ordre chronologique, le classement social n'a pas de
 * sens quand tout vient de la même personne. */
export async function fetchPosts(authorId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts_feed')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachGroupNames((data as PostFeedRow[]).map(rowToPost));
}

/** `posts_feed` n'expose pas `group_id`/nom du groupe (contrairement à `posts_ranked`) — complété
 * ici par deux petites requêtes plutôt qu'en modifiant la vue, pour ne pas risquer de casser son
 * ordre de colonnes (cf. l'incident `CREATE OR REPLACE VIEW` sur `posts_ranked`). Alimente le badge
 * 👥 du `PostCard` sur la page de profil, sans jamais le faire apparaître sur la page du groupe
 * lui-même (qui continue de lire `posts_feed_with_group` via `fetchGroupPosts`, non touchée ici). */
async function attachGroupNames(posts: Post[]): Promise<Post[]> {
  const groupPostIds = posts.filter((p) => p.visibility === 'group').map((p) => p.id);
  if (groupPostIds.length === 0) return posts;
  const { data: postRows, error: postError } = await supabase.from('posts').select('id, group_id').in('id', groupPostIds);
  if (postError) throw postError;
  const groupIdByPostId = new Map((postRows ?? []).map((r) => [r.id, r.group_id as string | null]));
  const groupIds = Array.from(new Set(Array.from(groupIdByPostId.values()).filter((id): id is string => Boolean(id))));
  if (groupIds.length === 0) return posts;
  const { data: groupRows, error: groupError } = await supabase.from('groups').select('id, name').in('id', groupIds);
  if (groupError) throw groupError;
  const nameById = new Map((groupRows ?? []).map((g) => [g.id, g.name as string]));
  return posts.map((p) => {
    const groupId = groupIdByPostId.get(p.id);
    return groupId ? { ...p, groupId, groupName: nameById.get(groupId) ?? undefined } : p;
  });
}

/** Mains d'un groupe (page dédiée) : ordre chronologique, comme la page de profil — un groupe est
 * déjà un cercle restreint, pas besoin d'un classement par affinité. */
export async function fetchGroupPosts(groupId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts_feed_with_group')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as PostFeedRow[]).map(rowToPost);
}

/**
 * Une seule main, pour sa page dédiée. Passe par `posts_feed_with_group` (la vue la plus complète)
 * pour que la page connaisse aussi le groupe d'origine du post.
 *
 * `maybeSingle` et non `single` : la main peut très bien ne plus être visible au moment du clic —
 * supprimée par son auteur, repassée en privé, ou groupe quitté depuis l'envoi de la notification.
 * RLS renvoie alors zéro ligne, ce qui n'est pas une erreur technique mais un cas d'affichage
 * normal ("cette main n'est plus disponible") ; `single` le transformerait en exception.
 */
export async function fetchPost(postId: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts_feed_with_group')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPost(data as PostFeedRow) : null;
}

interface NewPostInput {
  authorId: string;
  location?: string;
  buyIn?: string;
  level?: string;
  title: string;
  description?: string;
  hand: Hand;
  voteQuestion?: string;
  voteOptions?: string[];
  visibility: Visibility;
  /** Requis si `visibility === 'group'` (contrainte vérifiée côté base). */
  groupId?: string;
}

/** Insère le post et renvoie la version complète (id/date/compteurs réels attribués par la base). */
export async function createPost(
  input: NewPostInput,
  authorName: string,
  authorAvatarUrl?: string
): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: input.authorId,
      location: input.location,
      buy_in: input.buyIn,
      level: input.level,
      title: input.title,
      description: input.description,
      hand: input.hand,
      vote_question: input.voteQuestion,
      vote_options: input.voteOptions,
      visibility: input.visibility,
      group_id: input.groupId,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPost({
    ...data,
    author_name: authorName,
    author_avatar_url: authorAvatarUrl ?? null,
    liked_by_me: false,
    vote_counts: {},
    my_vote: null,
  });
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export interface PostEditInput {
  title: string;
  description?: string;
  location?: string;
  buyIn?: string;
  level?: string;
  voteQuestion?: string;
  voteOptions?: string[];
  visibility: Visibility;
  groupId?: string;
}

/** Ne touche jamais à `hand` — seul le texte/contexte du post est modifiable après publication. */
export async function updatePost(postId: string, edits: PostEditInput): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({
      title: edits.title,
      description: edits.description,
      location: edits.location,
      buy_in: edits.buyIn,
      level: edits.level,
      vote_question: edits.voteQuestion,
      vote_options: edits.voteOptions,
      visibility: edits.visibility,
      group_id: edits.visibility === 'group' ? edits.groupId : null,
    })
    .eq('id', postId);
  if (error) throw error;
}

/** `posts.like_count` est maintenu par un trigger côté base — rien à recalculer ici. */
export async function setLiked(postId: string, userId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  }
}

/** Un seul vote par utilisateur et par post (contrainte de clé primaire côté base). */
export async function castVote(postId: string, userId: string, option: string): Promise<void> {
  const { error } = await supabase.from('votes').insert({ post_id: postId, user_id: userId, option });
  if (error) throw error;
}

/** Retire le vote de l'utilisateur courant sur ce post, pour lui permettre de revoter ensuite. */
export async function retractVote(postId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('votes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}
