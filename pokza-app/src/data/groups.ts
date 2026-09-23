import { supabase } from '../lib/supabase';
import { assertWritten, refusedMessage } from './writeGuard';
import { fetchDisplayNames } from './profiles';
import { t } from '../i18n/traduire';

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  avatarUrl?: string;
  /** Libre, façon Instagram, 300 caractères max (contrainte vérifiée côté base). */
  description?: string;
  /** Date de la main la plus récente du groupe — absente s'il n'en a aucune. Renseignée par
   *  `fetchMyGroups` (RPC `my_groups`), qui s'en sert aussi pour trier. Absente ailleurs. */
  lastPostAt?: string;
  /** Membres acceptés, invitations en attente exclues. Même origine que `lastPostAt`. */
  memberCount?: number;
  /**
   * Mains publiées dans ce groupe depuis la dernière visite du joueur, les siennes exclues. Vient
   * de la RPC `my_groups` (cf. docs/dev/mains-non-vues.sql), qui part de la date d'adhésion tant
   * qu'on n'y est jamais entré. Se remet à zéro en ouvrant le groupe (`markGroupSeen`).
   *
   * Ce compte NE dérive PAS des notifications : le déclencheur `notify_group_posted` n'en écrit
   * qu'une par groupe et par tranche de deux heures, donc une soirée entière n'en produit qu'une.
   */
  unseenCount?: number;
}

export type GroupMemberStatus = 'pending' | 'accepted';

export interface GroupMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: GroupMemberStatus;
  invitedBy: string;
}

interface GroupRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  avatar_url: string | null;
  description: string | null;
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    avatarUrl: row.avatar_url ?? undefined,
    description: row.description ?? undefined,
  };
}

interface MyGroupRow extends GroupRow {
  last_post_at: string | null;
  member_count: number | null;
  unseen_count: number | null;
}

/**
 * Groupes où l'utilisateur a une appartenance acceptée (le créateur en fait partie dès la
 * création, cf. `create_group`) — pas les invitations en attente, celles-là vivent dans les
 * notifications et sur le profil, comme pour les demandes d'ami.
 *
 * Une seule requête (RPC `my_groups`, cf. docs/dev/my-groups.sql), là où il en fallait deux dont
 * un `.in('id', [...])` qui portait tous les identifiants dans l'URL. Le tri vient de la base :
 * dernière main du groupe en tête, date de création pour ceux qui n'en ont pas encore — l'ancien
 * ordre, la création du groupe par ordre croissant, mettait le plus ancien en tête et enterrait
 * les groupes vivants.
 *
 * Sans argument : la fonction lit `auth.uid()`, l'identifiant ne fait plus l'aller-retour.
 */
export async function fetchMyGroups(): Promise<Group[]> {
  const { data, error } = await supabase.rpc('my_groups');
  if (error) throw error;
  return (data as MyGroupRow[]).map((row) => ({
    ...rowToGroup(row),
    lastPostAt: row.last_post_at ?? undefined,
    memberCount: row.member_count ?? undefined,
    unseenCount: row.unseen_count ?? undefined,
  }));
}

/** Marque le groupe comme vu (RPC `mark_group_seen`) : remet son compteur de mains non vues à zéro.
 * Appelé à l'ouverture de la page du groupe. */
export async function markGroupSeen(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_group_seen', { p_group_id: groupId });
  if (error) throw error;
}

export async function fetchGroup(groupId: string): Promise<Group> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single();
  if (error) throw error;
  return rowToGroup(data as GroupRow);
}

export async function createGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', { p_name: name });
  if (error) throw error;
  return data as string;
}

/** Seule la description est modifiable ici — le nom pourrait l'être (la policy le permet déjà)
 * mais n'est pas demandé pour l'instant. */
export async function updateGroupDescription(groupId: string, description: string): Promise<void> {
  const { data, error } = await supabase
    .from('groups')
    .update({ description: description.trim() || null })
    .eq('id', groupId)
    .select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage(t('erreur.description_enregistree')));
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { data, error } = await supabase.from('groups').delete().eq('id', groupId).select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage(t('erreur.groupe_supprime')));
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data: rows, error } = await supabase
    .from('group_members')
    .select('user_id, status, invited_by')
    .eq('group_id', groupId)
    .order('created_at');
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: byId.get(row.user_id)?.display_name ?? '?',
    avatarUrl: byId.get(row.user_id)?.avatar_url ?? undefined,
    status: row.status as GroupMemberStatus,
    invitedBy: row.invited_by,
  }));
}

export async function inviteToGroup(groupId: string, userId: string, invitedBy: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, invited_by: invitedBy, status: 'pending' });
  if (error) throw error;
}

/**
 * Annuler une invitation envoyée, et rien d'autre : le filtre sur `pending` protège quelqu'un qui a
 * accepté entre-temps, que « Annuler l'invitation » exclurait sinon du groupe sans passer par la
 * confirmation d'exclusion. Renvoie `false` si aucune invitation en attente n'a été supprimée — la
 * personne a répondu depuis, ou la suppression a été refusée : à l'appelant de relire l'état réel.
 */
export async function cancelGroupInvite(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('group_id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function acceptGroupInvite(groupId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('group_members')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('group_id');
  if (error) throw error;
  assertWritten(data, refusedMessage(t('erreur.invitation_acceptee')));
}

/** Refuser une invitation, quitter un groupe, ou (côté créateur) retirer un membre / annuler une
 * invitation envoyée : dans les quatre cas il s'agit de supprimer la ligne d'appartenance. */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('group_id');
  if (error) throw error;
  assertWritten(data, refusedMessage(t('erreur.appartenance_groupe')));
}

export interface PendingGroupInvite {
  groupId: string;
  groupName: string;
  invitedBy: string;
  /** Le nom du fondateur : la feuille de refus le cite (« Seul Marc pourra t'y inviter à nouveau »),
   *  puisqu'après un refus lui seul peut réinviter. Chargé avec la liste pour que la feuille
   *  s'ouvre complète, sans texte qui change sous les yeux. */
  ownerName: string;
}

export async function fetchPendingGroupInvites(userId: string): Promise<PendingGroupInvite[]> {
  const { data: rows, error } = await supabase
    .from('group_members')
    .select('group_id, invited_by')
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const groupIds = rows.map((r) => r.group_id);
  const { data: groupRows, error: groupError } = await supabase
    .from('groups')
    .select('id, name, owner_id')
    .in('id', groupIds);
  if (groupError) throw groupError;

  const nameById = new Map((groupRows ?? []).map((g) => [g.id, g.name]));
  const ownerById = new Map((groupRows ?? []).map((g) => [g.id as string, g.owner_id as string]));
  const ownerNames = await fetchDisplayNames(Array.from(new Set(ownerById.values())));
  return rows.map((row) => ({
    groupId: row.group_id,
    groupName: nameById.get(row.group_id) ?? '?',
    invitedBy: row.invited_by,
    ownerName: ownerNames.get(ownerById.get(row.group_id) ?? '') ?? '?',
  }));
}

// ── INVITER DANS UN GROUPE — tout membre invite, le fondateur surveille ─────────────────────
// Décisions de Victor des 16 et 17/09/2026, mécanique et garde-fous dans
// `docs/dev/invitations-groupe.sql` :
//  · tout membre ACCEPTÉ invite ; le fondateur est prévenu à l'invitation et peut retirer ;
//  · un retrait par le fondateur, ou un refus de l'invité, ferme la porte : seul le fondateur peut
//    ensuite réinviter cette personne. Quitter le groupe ne ferme rien ;
//  · quelqu'un qui n'est pas sur Pokza reçoit un lien : plusieurs usages, 7 jours, et l'ouvrir fait
//    ENTRER. Un lien n'ouvre jamais une porte fermée.

/** Pourquoi une personne ne peut plus être invitée par un simple membre. */
export type RaisonPorteFermee = 'removed' | 'declined';

/**
 * Les portes fermées d'un groupe, par id de personne. L'écran « Inviter » s'en sert pour afficher
 * « Retiré par Marc » ou « A refusé » À LA PLACE du bouton — un bouton qui ne pourrait qu'échouer
 * est un piège (audit du 15/09). La RLS ne les montre qu'aux membres du groupe.
 */
export async function fetchClosedDoors(groupId: string): Promise<Map<string, RaisonPorteFermee>> {
  const { data, error } = await supabase
    .from('group_closed_doors')
    .select('user_id, reason')
    .eq('group_id', groupId);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.user_id as string, row.reason as RaisonPorteFermee]));
}

/**
 * Un lien NEUF à chaque partage, valable 7 jours à partir de maintenant et pour plusieurs
 * personnes. Réutiliser celui de la veille le ferait mourir plus tôt chez qui le reçoit.
 * Rejette si l'appelant n'est pas membre accepté du groupe.
 */
export async function createGroupInviteLink(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_invite_link', { p_group_id: groupId });
  if (error) throw error;
  if (!data) throw new Error(t('erreur.appartenance_groupe'));
  return data as string;
}

/** Ce qu'un visiteur — même sans compte — voit derrière un lien. */
export interface GroupLinkPreview {
  groupId: string;
  groupName: string;
  memberCount: number;
  /** Celui qui a ENVOYÉ le lien — pas forcément le fondateur. La page dit « Paul t'invite »,
   *  parce que c'est Paul que l'arrivant connaît. */
  hostId: string;
  hostName: string;
  hostAvatarUrl?: string;
  /** Une main PUBLIQUE de l'hôte, à rejouer sur la page d'accueil du lien. Absente s'il n'en a
   *  aucune : la page vaut toujours, elle montre juste le groupe et son hôte. */
  postId?: string;
}

/** `null` = lien inconnu, expiré, ou dont l'hôte n'est plus membre. Appelable sans compte. */
export async function fetchGroupLinkPreview(token: string): Promise<GroupLinkPreview | null> {
  const { data, error } = await supabase.rpc('group_link_preview', { p_token: token });
  if (error) throw error;
  const row = (data as
    | {
        group_id: string;
        group_name: string;
        member_count: number;
        host_id: string;
        host_name: string;
        host_avatar: string | null;
        post_id: string | null;
      }[]
    | null)?.[0];
  if (!row) return null;
  return {
    groupId: row.group_id,
    groupName: row.group_name,
    memberCount: row.member_count,
    hostId: row.host_id,
    hostName: row.host_name,
    hostAvatarUrl: row.host_avatar ?? undefined,
    postId: row.post_id ?? undefined,
  };
}

/** Les trois issues d'un lien ouvert, telles que la base les nomme. L'écran les traduit — on
 *  ne montre jamais ces mots-là. */
export type ResultatLienGroupe = 'rejoint' | 'deja_membre' | 'lien_invalide';

/**
 * Entrer dans le groupe par un lien. Un compte banni, bloqué avec l'hôte, retiré du groupe ou qui
 * a refusé d'y entrer reçoit `lien_invalide`, comme un lien expiré : on ne dit pas à quelqu'un,
 * par ce biais, qu'il a été retiré.
 */
export async function joinGroupByLink(token: string): Promise<ResultatLienGroupe> {
  const { data, error } = await supabase.rpc('join_group_by_link', { p_token: token });
  if (error) throw error;
  return (data as ResultatLienGroupe) ?? 'lien_invalide';
}
