import { supabase } from '../lib/supabase';
import { fetchFriends } from './friends';
import { pickFriendEchoes, type ReactionRow } from '../utils/friendEchoSelection';
import type { Post } from '../types/poker';

/**
 * Ajoute la mention sociale aux mains d'une page de feed.
 *
 * PÉRIMÈTRE : seulement les mains dont l'auteur n'est ni le lecteur ni un de ses amis. Sur la main
 * d'un ami la question « pourquoi est-ce là ? » ne se pose pas, la ligne ne serait que du bruit ;
 * sur ma propre main, j'ai déjà reçu la notification.
 *
 * NE CLASSE RIEN. Le barème d'affinité de `posts_ranked` (ami +30, ami commun +3 plafonné à 24,
 * format favori +5, −1 par jour) est calibré autour d'une règle écrite : un ami passe TOUJOURS
 * devant un inconnu, parce que 24 + 5 = 29 < 30. Le moindre bonus « un ami a aimé » la casserait.
 * La mention explique donc, elle ne remonte pas — et reste par là même un simple complément de
 * page, jamais un calcul sur tout le fil.
 *
 * NE PEUT PAS FAIRE TOMBER LE FEED : toute erreur rend la page telle quelle. C'est la leçon du
 * 20/08, où une policy cassée sur `likes` avait emporté la page entière — une décoration n'a pas
 * le droit de coûter ça.
 *
 * Les blocages n'ont rien à filtrer ici : la RLS de `likes` et de `comments` masque déjà les
 * comptes bloqués dans les deux sens et les comptes bannis (cf. `docs/dev/likes-blocages.sql`).
 */
export async function attachFriendEchoes(posts: Post[], viewerId: string): Promise<Post[]> {
  try {
    const candidates = posts.filter((post) => post.authorId !== viewerId && !post.authorIsFriend);
    if (candidates.length === 0) return posts;

    const friends = await fetchFriends(viewerId);
    if (friends.length === 0) return posts;

    const nomById = new Map(friends.map((friend) => [friend.id, friend.displayName]));
    const friendIds = friends.map((friend) => friend.id);
    const candidateIds = candidates.map((post) => post.id);

    // Filtrage des amis côté base plutôt que côté client : une main populaire peut porter des
    // centaines de likes dont aucun d'un ami, inutile de tous les rapatrier. (Contrepartie : la
    // liste d'ids part dans l'URL — à surveiller le jour où un compte dépassera ~150 amis.)
    // `mod_status` sur les commentaires : un commentaire masqué reste lisible par SON auteur via
    // la RLS, il ne doit pas pour autant produire une mention.
    const [likes, comments] = await Promise.all([
      supabase
        .from('likes')
        .select('post_id, user_id, created_at')
        .in('post_id', candidateIds)
        .in('user_id', friendIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('comments')
        .select('post_id, author_id, created_at')
        .in('post_id', candidateIds)
        .in('author_id', friendIds)
        .eq('mod_status', 'visible')
        .order('created_at', { ascending: false }),
    ]);
    if (likes.error) throw likes.error;
    if (comments.error) throw comments.error;

    const likeRows: ReactionRow[] = (likes.data ?? []).map((row) => ({
      postId: row.post_id as string,
      userId: row.user_id as string,
      createdAt: row.created_at as string,
    }));
    const commentRows: ReactionRow[] = (comments.data ?? []).map((row) => ({
      postId: row.post_id as string,
      userId: row.author_id as string,
      createdAt: row.created_at as string,
    }));

    const kept = pickFriendEchoes(candidateIds, likeRows, commentRows, nomById);
    if (kept.size === 0) return posts;
    return posts.map((post) => {
      const echo = kept.get(post.id);
      return echo ? { ...post, friendEcho: echo } : post;
    });
  } catch {
    return posts;
  }
}
