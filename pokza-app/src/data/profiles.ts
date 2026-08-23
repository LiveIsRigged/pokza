import { supabase } from '../lib/supabase';
import { removeAvatar } from './avatars';
import { assertWritten, refusedMessage } from './writeGuard';
import { resetAnalytics } from '../analytics';

/**
 * Une personne, telle qu'elle s'affiche dans une liste.
 *
 * **Pas de `pseudo` ici, et c'est délibéré.** Quelqu'un qui a choisi d'afficher son nom s'appelle
 * Bob Durant sur Pokza : le montrer sous un pseudo que personne ne lui connaît ne renseigne
 * personne. Et à l'inverse, le pseudo de quelqu'un qui l'a choisi ne doit jamais être doublé de son
 * nom. `display_name` répond aux deux cas à la fois — c'est le seul nom qu'un écran a le droit
 * d'afficher. Ne pas rajouter `pseudo` ici : son absence est ce qui fait que le compilateur
 * signalerait un écran qui recommencerait (les rares endroits qui ont besoin du pseudo lui-même —
 * modifier le sien, le back-office — le tiennent de `ProfileDetails` ou de `data/admin.ts`).
 */
export interface ProfileSummary {
  id: string;
  /** « Prénom Nom » pour qui a choisi de montrer son nom, sinon le pseudo. Colonne
   * `profiles.display_name`, tenue à jour par déclencheur (cf. `docs/dev/recherche-par-nom.sql`) —
   * elle dit toujours la même chose que `get_display_name()`, qui alimente le feed. */
  displayName: string;
  avatarUrl?: string;
}

export interface ProfileDetails extends ProfileSummary {
  /** Le profil est le SEUL écran qui manipule le pseudo brut : on y modifie le sien. */
  pseudo: string;
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

/**
 * Recherche par pseudo OU par nom affiché.
 *
 * Chercher le nom de quelqu'un qui l'a gardé privé reste impossible, et ce n'est pas un effet de
 * bord : `display_name` ne contient le prénom et le nom que si la personne a choisi de les
 * afficher — sinon elle contient son pseudo (cf. `docs/dev/recherche-par-nom.sql`). Prénom et nom
 * eux-mêmes n'ont jamais quitté `profiles_private`, lisible par son seul propriétaire.
 *
 * Requête client ordinaire, donc soumise aux policies de `profiles` comme n'importe quelle autre
 * lecture — c'est précisément ce qu'on a cherché en stockant le nom plutôt qu'en écrivant une
 * fonction `security definer`, qui aurait dû réappliquer à la main bannissements et blocages.
 */
export async function searchProfiles(query: string): Promise<ProfileSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // La grammaire de filtre de PostgREST donne un sens à la virgule et aux parenthèses : « Jean,
  // Paul » couperait le `or` en deux conditions bancales. On passe donc chaque valeur entre
  // guillemets, en échappant l'antislash et le guillemet, seuls caractères spéciaux à l'intérieur.
  const motif = `%${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%`;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .or(`pseudo.ilike."${motif}",display_name.ilike."${motif}"`)
    .order('display_name')
    .limit(20);
  if (error) throw error;
  // On CHERCHE sur le pseudo sans le RAMENER : quelqu'un peut être trouvé par un pseudo qu'un ami
  // connaît encore, et s'afficher malgré tout sous le nom qu'il a choisi de porter.
  return data.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
  }));
}

/**
 * Nom d'affichage de plusieurs profils d'un coup, par id.
 *
 * Sert aux listes qui viennent d'une fonction `security definer` (amis en commun, suggestions
 * d'amis) : ces fonctions ne renvoient que le pseudo, et les réécrire pour ajouter une colonne
 * signifierait republier un corps SQL dont je n'ai pas la version réellement en base. Une requête
 * de plus sur dix lignes coûte moins cher qu'un `create or replace` à l'aveugle.
 */
export async function fetchDisplayNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id as string, row.display_name as string]));
}

export async function fetchProfile(id: string): Promise<ProfileDetails> {
  // Une seule requête depuis que `display_name` est une colonne : l'appel à `get_display_name()`
  // qui l'accompagnait n'a plus lieu d'être, la colonne dit exactement la même chose (le script de
  // migration le vérifie ligne à ligne) et arrive dans le même aller-retour.
  const { data: row, error: rowError } = await supabase
    .from('profiles')
    .select('id, pseudo, display_name, avatar_url, display_preference, format_favori, variante_favorite, frequence_jeu, bio, country, created_at')
    .eq('id', id)
    .single();
  if (rowError) throw rowError;
  return {
    id: row.id,
    pseudo: row.pseudo,
    avatarUrl: row.avatar_url ?? undefined,
    displayName: row.display_name,
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
  const { data, error } = await supabase
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
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage("Le profil n'a pas été enregistré"));
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
