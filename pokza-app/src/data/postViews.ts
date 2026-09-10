import { supabase } from '../lib/supabase';

/**
 * Journal des lectures — le volet client de « lire une main la vieillit ».
 * ─────────────────────────────────────────────────────────────────────────
 * Ce qu'est une main LUE (tranché le 10/09/2026) : **déroulée OU 8 s à l'écran**, moitié de carte
 * visible, minuteur suspendu quand l'app passe en arrière-plan.
 *
 * Pourquoi 8 s et pas 1 ou 2 : une main réellement lue, on s'y est attardé. Si on s'est arrêté
 * deux secondes, c'est qu'on n'a pas déroulé la main. Le seuil peut être aussi long sans rien
 * perdre PARCE QUE le déroulé est le second chemin — et que `HandReplayer` est monté DANS la
 * carte du fil, donc dérouler est un évènement réel qui n'oblige pas à quitter le fil.
 *
 * ⚠️ NE JAMAIS MARQUER AU RENDU. Les dix mains de la première page basculeraient « vues » avant
 * le moindre défilement, et un tirer-pour-rafraîchir les effacerait toutes d'un coup.
 *
 * L'anti-rebond de 12 h vit en base (`mark_post_read`), pas ici : c'est lui la règle. La carte
 * locale ci-dessous ne fait qu'éviter d'appeler le serveur pour rien — même fenêtre, pour que les
 * deux ne puissent pas diverger.
 *
 * Le SEUIL de lecture, lui, est dans `utils/lectureVisibilite` : il s'y calcule sans React ni
 * réseau, donc il s'éprouve au banc.
 */

/** Jumelle de la fenêtre de `mark_post_read` en base. */
const ANTI_REBOND_MS = 12 * 60 * 60 * 1000;

const marquees = new Map<string, number>();

/**
 * Signale une lecture. Volontairement SANS `throw` et sans `assertWritten` : rater un marquage
 * n'a aucune conséquence visible (la main garde son rang), alors qu'une erreur remontée au fil
 * afficherait un message d'échec pour un défilement. Le seul effet d'un échec est de retenter.
 */
export async function markPostRead(postId: string): Promise<void> {
  const dernier = marquees.get(postId);
  if (dernier !== undefined && Date.now() - dernier < ANTI_REBOND_MS) return;
  marquees.set(postId, Date.now());

  const { error } = await supabase.rpc('mark_post_read', { p_post_id: postId });
  if (error) marquees.delete(postId);
}

/** Utilisé au changement de compte : le journal est propre à un lecteur. */
export function resetLecturesLocales(): void {
  marquees.clear();
}
