import type { Post } from '../types/poker';

/**
 * Délai de grâce après publication : corriger une coquille dans les premières minutes ne marque
 * pas la main comme modifiée. Décision produit du 21/08/2026 — le geste visé est la relecture
 * immédiate ("j'ai publié, je vois la faute"), pas la réécriture d'une main déjà lue et commentée.
 *
 * La base, elle, enregistre TOUTES les modifications de contenu dans `posts.edited_at` : ce délai
 * est une règle d'affichage, pas une amnésie. Le changer ne demande donc aucune migration.
 */
export const EDIT_GRACE_MS = 5 * 60 * 1000;

/**
 * Faut-il afficher « modifié » sous le pseudo ?
 *
 * Compare la modification à la PUBLICATION, et non à maintenant : une main corrigée à +3 minutes
 * ne portera jamais la mention, même relue des mois plus tard. L'inverse (une fenêtre glissante)
 * ferait apparaître la mention toute seule cinq minutes après une correction, sous les yeux d'un
 * lecteur qui n'a rien vu changer.
 */
export function wasEdited(post: Pick<Post, 'createdAt' | 'editedAt'>): boolean {
  if (!post.editedAt) return false;
  const edited = Date.parse(post.editedAt);
  const created = Date.parse(post.createdAt);
  // Dates illisibles : on préfère ne rien afficher plutôt qu'un « modifié » sorti d'un NaN.
  if (Number.isNaN(edited) || Number.isNaN(created)) return false;
  return edited - created > EDIT_GRACE_MS;
}
