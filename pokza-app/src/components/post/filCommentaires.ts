/**
 * LE FIL DE COMMENTAIRES : UN ARBRE EN BASE, DEUX NIVEAUX À L'ÉCRAN
 * ────────────────────────────────────────────────────────────────
 * « Répondre » figure sur TOUTES les lignes depuis le 07/09/2026 — répondre à une réponse ne doit
 * pas obliger à toucher le bouton d'un autre commentaire. Une réponse s'attache donc au
 * commentaire réellement visé, et la chaîne des parents peut compter trois maillons ou davantage.
 *
 * L'ÉCRAN, LUI, N'A QUE DEUX NIVEAUX ET N'EN AURA JAMAIS PLUS : une racine, et sous elle des
 * réponses toutes au même décalage, dans l'ordre où elles ont été écrites. C'est ce fichier qui
 * fait cet aplatissement — décision de Victor, pour éviter les cascades d'indentation.
 *
 * L'INVARIANT À NE PAS CASSER : tout commentaire chargé est rendu EXACTEMENT une fois, soit comme
 * racine, soit sous la sienne. Ni deux fois, ni zéro. `scripts/test-fil-commentaires.js` le vérifie
 * sur 5 000 fils tirés au hasard, profondeurs et parents manquants compris.
 */

/** Le strict nécessaire : le reste d'un `Comment` ne joue aucun rôle dans la forme du fil. */
export interface NoeudFil {
  id: string;
  parentCommentId?: string;
}

export interface FilPlat<T extends NoeudFil> {
  /** Les commentaires de premier niveau, dans l'ordre reçu. */
  racines: T[];
  /** Les réponses d'une racine : toute sa descendance, à plat, dans l'ordre reçu. */
  reponsesDe: (racineId: string) => T[];
}

/**
 * ⚠️ UNE RÉPONSE DONT LE PARENT EST ABSENT DE LA LISTE REMONTE AU PREMIER NIVEAU.
 *
 * Ce n'est pas un détail : c'est un bug qui a été observé. Le parent peut manquer alors que la
 * réponse, elle, est bien là — un commentaire retiré par la modération n'est plus renvoyé aux
 * AUTRES lecteurs (seul son auteur continue de le voir), et bloquer quelqu'un masque ses
 * commentaires sans masquer les réponses des autres. Une règle naïve écartait ces réponses des
 * racines (elles ont un parent) sans jamais les retrouver sous personne (nul ne demande les
 * réponses d'un absent) : elles n'étaient affichées NULLE PART, pendant que le compteur de la main
 * continuait de les compter — « 5 commentaires » pour 3 affichés, sans explication.
 *
 * Une suppression par l'auteur, elle, emporte ses réponses en cascade : ce cas-là n'est pas
 * concerné (cf. `descendance`).
 */
export function aplatirFil<T extends NoeudFil>(commentaires: T[]): FilPlat<T> {
  const idsCharges = new Set(commentaires.map((c) => c.id));
  const parentParId = new Map(commentaires.map((c) => [c.id, c.parentCommentId]));

  const racineDe = (commentId: string): string => {
    let courant = commentId;
    const vus = new Set([courant]);
    for (;;) {
      const parent = parentParId.get(courant);
      if (!parent || !idsCharges.has(parent)) return courant; // chaîne terminée, ou parent absent
      // Cycle : impossible en principe (le parent est fixé à la création et n'est jamais modifié),
      // mais une boucle infinie ici figerait l'app. Renvoyer le commentaire LUI-MÊME plutôt que le
      // dernier maillon parcouru : sinon deux commentaires en cycle se désignent mutuellement comme
      // racine, aucun des deux n'est sa propre racine, et tous deux disparaissent de l'affichage —
      // soit exactement le bug qu'on cherche à empêcher.
      if (vus.has(parent)) return commentId;
      courant = parent;
      vus.add(courant);
    }
  };

  const racineParId = new Map(commentaires.map((c) => [c.id, racineDe(c.id)]));
  return {
    racines: commentaires.filter((c) => racineParId.get(c.id) === c.id),
    reponsesDe: (racineId) =>
      commentaires.filter((c) => c.id !== racineId && racineParId.get(c.id) === racineId),
  };
}

/**
 * Le commentaire et TOUTE sa descendance — ce que la base efface d'un coup
 * (`on delete cascade` sur `parent_comment_id`), donc ce que l'écran doit retirer d'un coup.
 *
 * Se contenter des réponses DIRECTES suffisait tant que le fil était plat en base. Depuis qu'il ne
 * l'est plus, un petit-enfant survivrait à l'affichage : orphelin, il serait promu au premier
 * niveau par `aplatirFil`, et le compteur de la main compterait un commentaire qui n'existe plus.
 */
export function descendance<T extends NoeudFil>(commentaires: T[], commentId: string): Set<string> {
  const aRetirer = new Set([commentId]);
  // Une passe par génération. On ne s'appuie pas sur l'ordre de la liste : `commentaires.length`
  // tours couvrent la chaîne la plus longue possible, et on sort dès qu'un tour n'ajoute rien.
  for (let tour = 0; tour < commentaires.length; tour++) {
    let ajout = false;
    for (const c of commentaires) {
      if (!aRetirer.has(c.id) && c.parentCommentId && aRetirer.has(c.parentCommentId)) {
        aRetirer.add(c.id);
        ajout = true;
      }
    }
    if (!ajout) break;
  }
  return aRetirer;
}
