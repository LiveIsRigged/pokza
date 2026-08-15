/**
 * Garde-fou contre les faux succès d'écriture (constat F-15 de l'audit du 14/08/2026).
 *
 * PostgREST répond `204 No Content` à une suppression ou une modification qui n'a touché AUCUNE
 * ligne — que ce soit parce que la ligne n'existe plus, ou parce que la RLS a refusé l'opération.
 * Dans les deux cas `error` vaut `null`. Sans ce garde-fou, l'app retire la main de l'écran et
 * l'utilisateur la croit supprimée, alors qu'elle est toujours en ligne pour tout le monde.
 *
 * Le remède : ajouter `.select(...)` à l'écriture. PostgREST renvoie alors les lignes réellement
 * touchées, et une liste vide devient un signal exploitable.
 *
 * ⚠️ PIÈGE À CONNAÎTRE AVANT D'ÉTENDRE CE GARDE-FOU À UNE AUTRE ÉCRITURE
 * `.select()` sur une écriture fait passer les lignes renvoyées par la policy de LECTURE de la
 * table. Le garde-fou n'est donc correct que là où « avoir le droit d'écrire la ligne » implique
 * « avoir le droit de la lire ». Vérifié policy par policy pour chaque appel posé ici :
 *
 *   posts, groups, group_members, friend_requests, blocks, profiles → l'implication tient : la
 *     condition de lecture contient littéralement celle d'écriture (`author_id = auth.uid()`,
 *     `owner_id = auth.uid()`, etc.).
 *   comments, likes, comment_likes, votes → l'implication NE TIENT PAS en toute rigueur : depuis
 *     le lot 2, leur lecture dépend de la visibilité de la main, pas de l'auteur de la ligne. On
 *     peut donc imaginer une ligne supprimable mais illisible (j'ai commenté une main de groupe,
 *     puis j'ai été retiré du groupe). Ces cas ne sont pas atteignables depuis l'interface — on ne
 *     peut pas cliquer « supprimer » sur un contenu qu'on ne voit pas — mais si un écran affiche un
 *     jour ses propres contributions hors du contexte de la main, ce garde-fou y produirait une
 *     fausse erreur. C'est un faux négatif (on annonce un échec alors que l'écriture a eu lieu),
 *     jamais un faux positif : il ne peut pas faire croire à un succès inexistant.
 *
 * Volontairement NON couvert : `markNotificationRead` / `markAllNotificationsRead`. Marquer comme
 * lues des notifications déjà lues touche légitimement zéro ligne — le garde-fou y crierait au
 * loup. Et un badge qui ne se vide pas se voit tout seul.
 */
export function assertWritten<T>(rows: T[] | null | undefined, message: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(message);
  }
}

/** Formule commune : les deux causes possibles sont indiscernables côté client, donc on les nomme
 * toutes les deux plutôt que d'en deviner une. */
export function refusedMessage(subject: string): string {
  return `${subject} — soit le contenu n'existe plus, soit tu n'as pas les droits nécessaires. Recharge la page.`;
}
