import { supabase } from '../lib/supabase';

export interface ProfileSummary {
  id: string;
  pseudo: string;
  avatarUrl?: string;
}

export interface ProfileDetails extends ProfileSummary {
  /** Pseudo ou "prénom nom" selon la préférence choisie (cf. `get_display_name`). */
  displayName: string;
  displayPreference: 'pseudo' | 'nom';
  formatFavori: string;
  frequenceJeu: string;
  /** Description libre façon Instagram, 150 caractères max (contrainte vérifiée côté base). */
  bio?: string;
}

/** Recherche par pseudo — seule colonne de `profiles` conçue pour être publique et cherchable
 * (prénom/nom/date de naissance restent dans `profiles_private`, jamais exposés ici). */
export async function searchProfiles(query: string): Promise<ProfileSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, pseudo, avatar_url')
    .ilike('pseudo', `%${trimmed}%`)
    .order('pseudo')
    .limit(20);
  if (error) throw error;
  return data.map((row) => ({ id: row.id, pseudo: row.pseudo, avatarUrl: row.avatar_url ?? undefined }));
}

export async function fetchProfile(id: string): Promise<ProfileDetails> {
  const [{ data: row, error: rowError }, { data: displayName, error: nameError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, pseudo, avatar_url, display_preference, format_favori, frequence_jeu, bio')
      .eq('id', id)
      .single(),
    supabase.rpc('get_display_name', { profile_id: id }),
  ]);
  if (rowError) throw rowError;
  if (nameError) throw nameError;
  return {
    id: row.id,
    pseudo: row.pseudo,
    avatarUrl: row.avatar_url ?? undefined,
    displayName: displayName ?? row.pseudo,
    displayPreference: row.display_preference,
    formatFavori: row.format_favori,
    frequenceJeu: row.frequence_jeu,
    bio: row.bio ?? undefined,
  };
}

export interface ProfileEditInput {
  pseudo: string;
  displayPreference: 'pseudo' | 'nom';
  formatFavori: string;
  frequenceJeu: string;
  bio?: string;
}

/** Modifie le profil et renvoie sa version à jour (pseudo/préférence peuvent changer le
 * `displayName` calculé, donc on relit plutôt que de le reconstruire ici). */
export async function updateProfile(userId: string, edits: ProfileEditInput): Promise<ProfileDetails> {
  const { error } = await supabase
    .from('profiles')
    .update({
      pseudo: edits.pseudo,
      display_preference: edits.displayPreference,
      format_favori: edits.formatFavori,
      frequence_jeu: edits.frequenceJeu,
      bio: edits.bio?.trim() || null,
    })
    .eq('id', userId);
  if (error) throw error;
  return fetchProfile(userId);
}
