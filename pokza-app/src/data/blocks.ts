import { supabase } from '../lib/supabase';

/**
 * Bloquer quelqu'un. Relation orientée en base (`blocker_id`/`blocked_id`) mais le masquage est
 * mutuel en RLS (`is_blocked_pair`). Poser le blocage rompt aussi l'amitié et annule les demandes en
 * attente dans les deux sens (trigger `handle_block_created`). Idempotent : re-bloquer une personne
 * déjà bloquée n'est pas une erreur (23505 avalé).
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

/** Débloquer : supprime la ligne de blocage. Ne restaure pas l'amitié rompue au moment du blocage —
 * il faut refaire une demande d'ami, comme après un simple retrait d'ami. */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

/** Vrai si `blockerId` a bloqué `blockedId`. La RLS de `blocks` ne laisse lire QUE ses propres
 * lignes de blocage (discrétion), donc cet appel n'a de sens que pour savoir si MOI j'ai bloqué
 * quelqu'un — on ne peut pas savoir si l'autre nous a bloqués (voulu). */
export async function isBlockedByMe(blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export interface BlockedUser {
  id: string;
  pseudo: string;
  avatarUrl?: string;
  blockedAt: string;
}

/**
 * Liste des comptes que J'AI bloqués (pour l'écran « Comptes bloqués »). Le profil d'une personne
 * bloquée reste lisible — seuls ses posts/commentaires/demandes d'ami sont masqués par la RLS — donc
 * on peut afficher son pseudo et son avatar pour permettre de la débloquer.
 */
export async function fetchBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  const { data: rows, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const blockedIds = rows.map((r) => r.blocked_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, pseudo, avatar_url')
    .in('id', blockedIds);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    id: row.blocked_id,
    pseudo: byId.get(row.blocked_id)?.pseudo ?? '?',
    avatarUrl: byId.get(row.blocked_id)?.avatar_url ?? undefined,
    blockedAt: row.created_at,
  }));
}
