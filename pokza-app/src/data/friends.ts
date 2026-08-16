import { supabase } from '../lib/supabase';
import { assertWritten, refusedMessage } from './writeGuard';

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

interface FriendRequestRow {
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted';
}

/** Relation entre deux comptes, quel que soit qui a envoyé la demande à l'origine — la table
 * `friend_requests` est dirigée (sender/receiver), mais la relation elle-même ne l'est pas une fois
 * regardée depuis "un utilisateur donné et un autre". */
export async function fetchFriendStatus(currentUserId: string, otherUserId: string): Promise<FriendStatus> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id, status')
    .or(
      `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
    )
    .limit(2);
  if (error) throw error;

  // ⚠️ DEUX lignes peuvent exister pour un même couple, et c'est le cœur du correctif.
  // La clé primaire est `(sender_id, receiver_id)` : elle interdit deux demandes dans le MÊME sens,
  // pas une demande dans chaque sens. Il suffit que deux personnes s'ajoutent en même temps — le
  // scénario exact d'un soir de lancement où cinq joueurs s'ajoutent tous mutuellement.
  // Cette requête utilisait `maybeSingle()`, qui ÉCHOUE au-delà d'une ligne : l'écran de profil
  // affichait alors une erreur PostgREST brute, et le bouton d'ami restait inutilisable. De façon
  // définitive, puisque la seule action capable de nettoyer la situation était sur cet écran-là.
  const rows = (data ?? []) as FriendRequestRow[];
  if (rows.length === 0) return 'none';
  // Une seule ligne acceptée suffit : la relation est symétrique, l'autre ligne éventuelle est un
  // doublon inoffensif (`fetchFriends` ne compte que les lignes acceptées, donc l'ami n'apparaît
  // qu'une fois).
  if (rows.some((r) => r.status === 'accepted')) return 'friends';
  // Demandes croisées : les deux se sont ajoutés, personne n'a encore accepté. Montrer « Accepter »
  // plutôt que « Demande envoyée » — un tap suffit alors à résoudre la situation, et le prochain
  // appel renverra `friends` grâce à la règle du dessus.
  if (rows.some((r) => r.receiver_id === currentUserId)) return 'pending_received';
  return 'pending_sent';
}

export async function sendFriendRequest(senderId: string, receiverId: string): Promise<void> {
  const { error } = await supabase.from('friend_requests').insert({ sender_id: senderId, receiver_id: receiverId });
  if (error) throw error;
}

export async function acceptFriendRequest(senderId: string, receiverId: string): Promise<void> {
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .select('sender_id');
  if (error) throw error;
  assertWritten(data, refusedMessage("La demande d'ami n'a pas été acceptée"));
}

/** Sert à la fois à refuser une demande reçue, annuler une demande envoyée, et retirer un ami —
 * dans les trois cas il s'agit de supprimer la ligne de relation entre les deux comptes. */
export async function deleteFriendRelation(userId: string, otherUserId: string): Promise<void> {
  const { data, error } = await supabase
    .from('friend_requests')
    .delete()
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`
    )
    .select('sender_id');
  if (error) throw error;
  assertWritten(data, refusedMessage("La relation n'a pas été modifiée"));
}

export interface Friend {
  id: string;
  pseudo: string;
  avatarUrl?: string;
}

/** Amis confirmés d'un utilisateur (les deux sens de la relation `friend_requests` acceptée). La
 * RLS ne renvoie que les lignes où l'appelant est impliqué (sender ou receiver) — donc en pratique
 * cet appel n'a de sens que pour SA propre liste d'amis, jamais celle d'un tiers. */
export async function fetchFriends(userId: string): Promise<Friend[]> {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const friendIds = rows.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id));
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, pseudo, avatar_url')
    .in('id', friendIds);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return friendIds.map((id) => ({
    id,
    pseudo: byId.get(id)?.pseudo ?? '?',
    avatarUrl: byId.get(id)?.avatar_url ?? undefined,
  }));
}

/** Nombre d'amis d'un profil quelconque — contrairement à `fetchFriends`, valide pour n'importe
 * quel profil visité (repose sur la fonction `friend_count`, SECURITY DEFINER côté base, qui
 * n'expose qu'un compte, jamais la liste elle-même). */
export async function fetchFriendCount(profileId: string): Promise<number> {
  const { data, error } = await supabase.rpc('friend_count', { p_profile: profileId });
  if (error) throw error;
  return data ?? 0;
}

export interface MutualFriendPreview {
  id: string;
  pseudo: string;
  avatarUrl?: string;
}

/**
 * Ne renvoie que des amis en commun qui sont DÉJÀ dans MES propres amis (`auth.uid()` forcé côté
 * fonction, jamais un tiers arbitraire) — contrairement à un "vous connaissez aussi X, Y" qui
 * exposerait la liste d'amis de `otherUserId`, ceci ne révèle rien de nouveau au visiteur : il
 * sait déjà que ces personnes sont ses amis.
 */
export async function fetchMutualFriendsPreview(otherUserId: string, limit = 10): Promise<MutualFriendPreview[]> {
  const { data, error } = await supabase.rpc('mutual_friends_preview', { p_other: otherUserId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row: { id: string; pseudo: string; avatar_url: string | null }) => ({
    id: row.id,
    pseudo: row.pseudo,
    avatarUrl: row.avatar_url ?? undefined,
  }));
}

/** Nombre exact d'amis en commun avec `otherUserId` — contrairement à `fetchMutualFriendsPreview`
 * (plafonnée à `limit`), ce compte n'est jamais tronqué. Même garantie de confidentialité : calculé
 * uniquement sur MES propres amis (`auth.uid()` forcé côté fonction). */
export async function fetchMutualFriendCount(otherUserId: string): Promise<number> {
  const { data, error } = await supabase.rpc('mutual_friend_count', { p_other: otherUserId });
  if (error) throw error;
  return data ?? 0;
}

export interface SuggestedFriend {
  id: string;
  pseudo: string;
  avatarUrl?: string;
  mutualCount: number;
}

/** Amis d'amis classés par nombre d'amis en commun — exclut soi-même et toute relation déjà
 * existante (ami confirmé ou demande en attente), calculé côté base pour ne jamais exposer les
 * listes d'amis de tiers au client. */
export async function fetchSuggestedFriends(limit = 10): Promise<SuggestedFriend[]> {
  const { data, error } = await supabase.rpc('suggested_friends', { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map(
    (row: { id: string; pseudo: string; avatar_url: string | null; mutual_count: number }) => ({
      id: row.id,
      pseudo: row.pseudo,
      avatarUrl: row.avatar_url ?? undefined,
      mutualCount: row.mutual_count,
    })
  );
}

export interface PendingRequest {
  senderId: string;
  senderPseudo: string;
  senderAvatarUrl?: string;
  createdAt: string;
}

export async function fetchPendingRequests(userId: string): Promise<PendingRequest[]> {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('sender_id, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const senderIds = rows.map((r) => r.sender_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, pseudo, avatar_url')
    .in('id', senderIds);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    senderId: row.sender_id,
    senderPseudo: byId.get(row.sender_id)?.pseudo ?? '?',
    senderAvatarUrl: byId.get(row.sender_id)?.avatar_url ?? undefined,
    createdAt: row.created_at,
  }));
}
