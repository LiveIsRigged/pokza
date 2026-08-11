import { supabase } from '../lib/supabase';
import { removeAvatar } from './avatars';
import { resetAnalytics } from '../analytics';

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
  /** Variante préférée ('nlhe' | 'plo' | 'plo5') — fait remonter ces mains dans le feed. */
  varianteFavorite: string;
  frequenceJeu: string;
  /** Description libre façon Instagram, 150 caractères max (contrainte vérifiée côté base). */
  bio?: string;
  /** Pays du joueur, code ISO 3166-1 alpha-2 (ex. « FR »). Facultatif ; le drapeau/nom en sont
   * dérivés à l'affichage (cf. `data/countries.ts`). */
  country?: string;
  createdAt: string;
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
      .select('id, pseudo, avatar_url, display_preference, format_favori, variante_favorite, frequence_jeu, bio, country, created_at')
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
    varianteFavorite: row.variante_favorite ?? 'nlhe',
    frequenceJeu: row.frequence_jeu,
    bio: row.bio ?? undefined,
    country: row.country ?? undefined,
    createdAt: row.created_at,
  };
}

export interface ProfileEditInput {
  pseudo: string;
  displayPreference: 'pseudo' | 'nom';
  formatFavori: string;
  varianteFavorite: string;
  frequenceJeu: string;
  bio?: string;
  /** Code ISO 3166-1 alpha-2, ou null pour effacer le pays. */
  country?: string | null;
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
      variante_favorite: edits.varianteFavorite,
      frequence_jeu: edits.frequenceJeu,
      bio: edits.bio?.trim() || null,
      country: edits.country ?? null,
    })
    .eq('id', userId);
  if (error) throw error;
  return fetchProfile(userId);
}

/**
 * Supprime définitivement le compte : la fonction `delete_own_account` (SECURITY DEFINER, cf.
 * script SQL fourni) supprime la ligne `auth.users`, ce qui entraîne en cascade `profiles`,
 * `profiles_private` et tout ce qui les référence (posts, commentaires, amitiés, groupes…).
 * L'avatar est retiré avant l'appel — une fois le compte supprimé, plus rien ne permet de
 * retrouver son chemin de stockage pour le nettoyer après coup.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  try {
    await removeAvatar(userId);
  } catch {
    // Sans conséquence : un avatar orphelin dans le bucket ne doit jamais bloquer la suppression.
  }
  // §9.5 (volet serveur) : purge les données PostHog TANT QUE le JWT est encore valide, AVANT le
  // delete. Best-effort — une purge analytics qui échoue ne doit jamais bloquer la suppression.
  try {
    await supabase.functions.invoke('posthog-purge');
  } catch {
    // ignoré volontairement
  }
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
  // §9.5 (volet client) : oublie l'identité analytics locale.
  resetAnalytics();
}
