import { supabase } from '../lib/supabase';

/**
 * Lien de partage d'une main vers l'extérieur de Pokza.
 *
 * POURQUOI UN JETON ET PAS L'IDENTIFIANT DE LA MAIN
 * Laisser un visiteur anonyme lire une main par son UUID ferait de cet UUID le seul secret
 * protégeant TOUTES les mains privées et de groupe de l'app — et un UUID fuit (journaux, captures
 * d'écran, en-têtes de provenance). Ici, une main n'est atteignable de l'extérieur que si son
 * auteur a explicitement créé un jeton ; celles que personne ne partage restent inatteignables.
 *
 * LA RÈGLE « L'AUTEUR SEUL » N'EST PAS ICI
 * Elle est dans la policy d'insertion (`docs/dev/partage-lien.sql`). Un membre qui tenterait de
 * fabriquer le lien de la main d'un autre se ferait refuser par la base, pas par cet écran.
 */

/** Un seul lien par main, stable : repartager redonne le même. D'où la relecture avant l'écriture,
 *  et le rattrapage sur conflit — deux partages lancés coup sur coup visent la même ligne. */
export async function getOrCreateShareToken(postId: string, authorId: string): Promise<string> {
  const existing = await supabase.from('post_shares').select('token').eq('post_id', postId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.token) return existing.data.token as string;

  // `token` n'est pas envoyé : la colonne n'est accordée à personne en écriture, sa valeur vient
  // de la base. Personne ne choisit son propre jeton.
  const created = await supabase
    .from('post_shares')
    .insert({ post_id: postId, created_by: authorId })
    .select('token')
    .maybeSingle();
  if (!created.error && created.data?.token) return created.data.token as string;

  const again = await supabase.from('post_shares').select('token').eq('post_id', postId).maybeSingle();
  if (again.data?.token) return again.data.token as string;
  throw created.error ?? new Error("Le lien de partage n'a pas pu être créé.");
}

/** Le lien existe-t-il déjà ? Sert à n'avertir qu'à la PREMIÈRE création : une fois le lien créé,
 *  repartager n'expose rien de nouveau et n'a donc pas à être reconfirmé. */
export async function hasShareLink(postId: string): Promise<boolean> {
  const { data } = await supabase.from('post_shares').select('post_id').eq('post_id', postId).maybeSingle();
  return Boolean(data);
}
