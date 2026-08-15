import { supabase } from '../lib/supabase';
import { assertWritten, refusedMessage } from './writeGuard';

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  avatarUrl?: string;
  /** Libre, façon Instagram, 300 caractères max (contrainte vérifiée côté base). */
  description?: string;
}

export type GroupMemberStatus = 'pending' | 'accepted';

export interface GroupMember {
  userId: string;
  pseudo: string;
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

/** Groupes où l'utilisateur a une appartenance acceptée (le créateur en fait partie dès la
 * création, cf. `create_group`) — pas les invitations en attente, celles-là vivent dans les
 * notifications et sur le profil, comme pour les demandes d'ami. */
export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');
  if (memberError) throw memberError;
  const groupIds = (memberRows ?? []).map((r) => r.group_id);
  if (groupIds.length === 0) return [];

  const { data, error } = await supabase.from('groups').select('*').in('id', groupIds).order('created_at');
  if (error) throw error;
  return (data as GroupRow[]).map(rowToGroup);
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
  assertWritten(data, refusedMessage("La description n'a pas été enregistrée"));
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { data, error } = await supabase.from('groups').delete().eq('id', groupId).select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage("Le groupe n'a pas été supprimé"));
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
    .select('id, pseudo, avatar_url')
    .in('id', userIds);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    userId: row.user_id,
    pseudo: byId.get(row.user_id)?.pseudo ?? '?',
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

export async function acceptGroupInvite(groupId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('group_members')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('group_id');
  if (error) throw error;
  assertWritten(data, refusedMessage("L'invitation n'a pas été acceptée"));
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
  assertWritten(data, refusedMessage("L'appartenance au groupe n'a pas été modifiée"));
}

export interface PendingGroupInvite {
  groupId: string;
  groupName: string;
  invitedBy: string;
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
  const { data: groupRows, error: groupError } = await supabase.from('groups').select('id, name').in('id', groupIds);
  if (groupError) throw groupError;

  const nameById = new Map((groupRows ?? []).map((g) => [g.id, g.name]));
  return rows.map((row) => ({
    groupId: row.group_id,
    groupName: nameById.get(row.group_id) ?? '?',
    invitedBy: row.invited_by,
  }));
}
