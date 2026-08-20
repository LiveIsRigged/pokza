import { supabase } from '../lib/supabase';

/**
 * Une personne qui a voté, et ce qu'elle a choisi. Même forme que `Liker` (pseudo + avatar), avec
 * l'option en plus : c'est elle qui sert à regrouper la liste par réponse.
 */
export interface Voter {
  id: string;
  pseudo: string;
  avatarUrl?: string;
  option: string;
}

/**
 * Qui a voté quoi, du plus récent au plus ancien.
 *
 * Aucun filtrage ici : la RLS s'en charge côté base. Elle ne laisse lire les votes d'une main que
 * si la main est visible (`private.post_visible`, lot 2), et masque les comptes bloqués — dans les
 * deux sens — ou bannis (cf. `docs/dev/votes-qui-a-vote.sql`).
 *
 * Deux requêtes plutôt qu'une jointure, comme pour les likes : `votes.user_id` pointe sur
 * `auth.users` et non sur `profiles`, donc PostgREST ne sait pas imbriquer les deux. Un vote dont
 * le profil ne revient pas (compte supprimé) est simplement omis.
 */
export async function fetchVoters(postId: string): Promise<Voter[]> {
  const { data: rows, error } = await supabase
    .from('votes')
    .select('user_id, option, created_at')
    .eq('post_id', postId)
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
  // On repart des lignes de vote et non des profils : l'ordre d'affichage est celui des votes (le
  // plus récent en haut), pas celui, arbitraire, dans lequel la base rend les profils.
  return (rows ?? []).flatMap((row) => {
    const p = profileById.get(row.user_id as string);
    if (!p) return [];
    return [
      {
        id: row.user_id as string,
        pseudo: p.pseudo as string,
        avatarUrl: (p.avatar_url as string) ?? undefined,
        option: row.option as string,
      },
    ];
  });
}
