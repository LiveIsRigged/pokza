import { supabase } from '../lib/supabase';

/**
 * Une personne qui a aimé une main ou un commentaire. Le pseudo plutôt que le nom d'affichage
 * complet : c'est ce qu'affichent déjà toutes les autres listes de personnes de l'app (amis,
 * recherche, membres d'un groupe, comptes bloqués), et ça tient en une seule requête.
 */
export interface Liker {
  id: string;
  pseudo: string;
  avatarUrl?: string;
}

/**
 * Qui a aimé, du plus récent au plus ancien.
 *
 * Aucun filtrage n'est fait ici : la RLS s'en charge intégralement côté base. Elle ne laisse lire
 * les likes d'une main que si la main elle-même est visible (`private.post_visible`), et masque
 * les comptes bloqués (dans les deux sens) ou bannis (cf. `docs/dev/likes-blocages.sql`). Un
 * `like_count` légèrement supérieur au nombre de lignes affichées est donc normal et voulu : le
 * compteur est tenu par un trigger, qui ne connaît pas les blocages de celui qui regarde.
 *
 * Deux requêtes plutôt qu'une jointure : `likes.user_id` pointe sur `auth.users`, pas sur
 * `profiles`, donc PostgREST ne sait pas imbriquer les deux. Même schéma que `fetchComments`.
 * Un like dont le profil ne revient pas (compte supprimé) est simplement omis.
 */
async function fetchLikers(
  table: 'likes' | 'comment_likes',
  column: 'post_id' | 'comment_id',
  targetId: string
): Promise<Liker[]> {
  const { data: rows, error } = await supabase
    .from(table)
    .select('user_id, created_at')
    .eq(column, targetId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = (rows ?? []).map((r) => r.user_id as string);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, pseudo, avatar_url')
    .in('id', userIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  // On repart de `userIds` et non de `profiles` : l'ordre d'affichage est celui des likes (le
  // plus récent en haut), pas celui, arbitraire, dans lequel la base rend les profils.
  return userIds.flatMap((id) => {
    const p = profileById.get(id);
    return p ? [{ id, pseudo: p.pseudo as string, avatarUrl: (p.avatar_url as string) ?? undefined }] : [];
  });
}

export function fetchPostLikers(postId: string): Promise<Liker[]> {
  return fetchLikers('likes', 'post_id', postId);
}

export function fetchCommentLikers(commentId: string): Promise<Liker[]> {
  return fetchLikers('comment_likes', 'comment_id', commentId);
}
