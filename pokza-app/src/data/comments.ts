import { supabase } from '../lib/supabase';
import type { Comment, ModStatus } from '../types/poker';
import { resizeToBase64, uploadPrivateImage, type PickedImage } from './images';
import { assertWritten, refusedMessage } from './writeGuard';

const COMMENT_PHOTO_BUCKET = 'comment-photos';
/** Une photo de commentaire s'affiche en petit dans le fil ; 1024px de long côté couvre large les
 * écrans à forte densité sans envoyer un fichier de plusieurs Mo. */
const COMMENT_PHOTO_MAX_DIMENSION = 1024;
/** Le lien signé n'a besoin de vivre que le temps d'un affichage — 1h laisse une bonne marge sans
 * garder un accès valable indéfiniment sur une photo potentiellement privée. */
const SIGNED_URL_TTL_SECONDS = 3600;

// Forme renvoyée par la vue `comments_feed` (cf. script SQL) : author_name déjà résolu via
// `get_display_name`, comme pour `posts_feed`.
interface CommentFeedRow {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  body: string | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  /** Ajouté en fin de la vue `comments_feed` par la migration modération. */
  mod_status?: ModStatus;
}

function rowToComment(
  row: CommentFeedRow,
  imageUrl?: string,
  gifUrl?: string,
  mediaWidth?: number,
  mediaHeight?: number,
  authorAvatarUrl?: string
): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id ?? undefined,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl,
    body: row.body ?? '',
    createdAt: row.created_at,
    likeCount: row.like_count,
    likedByMe: row.liked_by_me,
    modStatus: row.mod_status ?? 'visible',
    imageUrl,
    gifUrl,
    mediaWidth,
    mediaHeight,
  };
}

/**
 * `image_path`/`gif_url` ne sont pas exposés par la vue `comments_feed` (elle ne remonte que ce
 * qu'il fallait avant l'ajout des pièces jointes) — plutôt que de risquer de casser cette vue en la
 * recréant à l'aveugle, une seconde requête légère sur `comments` complète les infos manquantes.
 * `image_path` est un chemin de bucket PRIVÉ : il faut le transformer en lien signé temporaire
 * avant de pouvoir l'afficher, un par un serait lent donc `createSignedUrls` en fait un seul appel.
 */
export async function fetchComments(postId: string): Promise<Comment[]> {
  const [{ data: rows, error }, { data: mediaRows, error: mediaError }] = await Promise.all([
    supabase.from('comments_feed').select('*').eq('post_id', postId).order('created_at', { ascending: true }),
    supabase.from('comments').select('id, image_path, gif_url, image_width, image_height').eq('post_id', postId),
  ]);
  if (error) throw error;
  if (mediaError) throw mediaError;

  const mediaById = new Map((mediaRows ?? []).map((m) => [m.id as string, m]));
  const imagePaths = (mediaRows ?? [])
    .map((m) => m.image_path as string | null)
    .filter((path): path is string => Boolean(path));

  const signedUrlByPath = new Map<string, string>();
  if (imagePaths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(COMMENT_PHOTO_BUCKET)
      .createSignedUrls(imagePaths, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedUrlByPath.set(s.path, s.signedUrl);
    }
  }

  // La vue `comments_feed` ne remonte pas l'avatar de l'auteur : une requête légère sur `profiles`
  // pour les auteurs présents complète l'info (avatar_url est une URL publique, pas de lien signé).
  const authorIds = [...new Set((rows as CommentFeedRow[]).map((r) => r.author_id))];
  const avatarById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', authorIds);
    if (profilesError) throw profilesError;
    for (const p of profiles ?? []) {
      if (p.avatar_url) avatarById.set(p.id as string, p.avatar_url as string);
    }
  }

  return (rows as CommentFeedRow[]).map((row) => {
    const media = mediaById.get(row.id);
    const imagePath = (media?.image_path as string | null) ?? null;
    return rowToComment(
      row,
      imagePath ? signedUrlByPath.get(imagePath) : undefined,
      media?.gif_url ?? undefined,
      media?.image_width ?? undefined,
      media?.image_height ?? undefined,
      avatarById.get(row.author_id)
    );
  });
}

export interface NewCommentInput {
  postId: string;
  authorId: string;
  authorName: string;
  /** Peut être vide si une image ou un GIF est joint — un commentaire n'a plus besoin de texte
   * pour exister (contrainte assouplie côté base). */
  body: string;
  parentCommentId?: string;
  /** Photo choisie depuis la galerie, non recadrée (contrairement à un avatar, une photo de
   * commentaire garde sa forme). */
  image?: PickedImage;
  /** GIF choisi dans `GifPicker` — ses dimensions (déjà connues via GIPHY) sont conservées pour
   * l'afficher selon ses vraies proportions, comme une photo. */
  gif?: { url: string; width: number; height: number };
}

/**
 * `posts.comment_count` est maintenu par un trigger côté base (réponses incluses).
 *
 * La photo est envoyée en DEUX temps : la ligne `comments` doit exister avant de connaître son id,
 * qui sert de dossier dans le bucket. Si l'envoi de la photo échoue, le commentaire tout juste créé
 * est supprimé plutôt que laissé sans image — la personne n'a jamais voulu poster un commentaire
 * texte seul dans ce cas, autant qu'elle puisse réessayer proprement.
 */
export async function createComment(input: NewCommentInput): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: input.postId,
      author_id: input.authorId,
      body: input.body || null,
      parent_comment_id: input.parentCommentId,
      gif_url: input.gif?.url ?? null,
      image_width: input.gif?.width ?? null,
      image_height: input.gif?.height ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  if (!input.image) {
    return rowToComment(
      { ...data, author_name: input.authorName, like_count: 0, liked_by_me: false },
      undefined,
      input.gif?.url,
      input.gif?.width,
      input.gif?.height
    );
  }

  try {
    const resized = await resizeToBase64(input.image, COMMENT_PHOTO_MAX_DIMENSION);
    const path = `${data.id}/photo.jpg`;
    await uploadPrivateImage(COMMENT_PHOTO_BUCKET, path, resized.base64);
    const { data: updated, error: updateError } = await supabase
      .from('comments')
      .update({ image_path: path, image_width: resized.width, image_height: resized.height })
      .eq('id', data.id)
      .select('id');
    if (updateError) throw updateError;
    // Sans ce garde-fou, une modification refusée répondait `204` sans erreur : la photo partait
    // bien dans le bucket, le commentaire s'affichait AVEC son image grâce à l'URL signée rendue
    // juste en dessous, et l'image disparaissait au rechargement suivant — la ligne n'ayant jamais
    // reçu son `image_path`. Ici l'échec est rattrapable : le `catch` supprime le commentaire tout
    // juste créé, la personne peut réessayer au lieu de garder un commentaire amputé.
    assertWritten(updated, refusedMessage("La photo du commentaire n'a pas été enregistrée"));
    const { data: signed, error: signError } = await supabase.storage
      .from(COMMENT_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;
    return rowToComment(
      { ...data, author_name: input.authorName, like_count: 0, liked_by_me: false },
      signed?.signedUrl,
      undefined,
      resized.width,
      resized.height
    );
  } catch (err) {
    await supabase.from('comments').delete().eq('id', data.id);
    throw err;
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage("Le commentaire n'a pas été supprimé"));
}

/** `comments.like_count` est maintenu par un trigger côté base. */
export async function setCommentLiked(commentId: string, userId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .select('comment_id');
    if (error) throw error;
    assertWritten(data, refusedMessage("Le like n'a pas été retiré"));
  }
}
