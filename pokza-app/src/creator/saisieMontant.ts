/**
 * LA SAISIE D'UN MONTANT AU PAVÉ NUMÉRIQUE.
 * ─────────────────────────────────────────
 * Séparée de l'écran parce qu'un `TextInput` faisait ce travail tout seul jusqu'au 03/09/2026 : en
 * cessant d'appeler le clavier d'iOS (cf. `PaveNumerique.tsx`), on hérite des petites règles qu'il
 * appliquait sans qu'on y pense — pas deux virgules, pas de zéro qui traîne devant.
 *
 * CE QU'ON NE FAIT VOLONTAIREMENT PAS
 *   Ni plafond de longueur, ni limite au nombre de décimales. Le champ n'en avait aucun avant, et
 *   en ajouter un ici serait décider à la place de Victor une valeur qu'il n'a jamais tranchée.
 *   Un montant absurde est déjà attrapé à la validation par `confirmAmount` (plafonné au tapis,
 *   refusé s'il ne dépasse pas la mise à suivre).
 *
 * La VIRGULE et non le point : c'est le séparateur français, `confirmAmount` la normalise déjà, et
 * une correction du 01/09/2026 porte précisément sur elle.
 */

export const SEPARATEUR = ',';

/** Ajoute un chiffre ou la virgule à ce qui est déjà saisi. */
export function ajouterAuMontant(courant: string, caractere: string): string {
  if (caractere === SEPARATEUR) {
    // Une seule virgule, et jamais en tête : « ,5 » ne se lit pas, « 0,5 » si.
    if (courant.includes(SEPARATEUR)) return courant;
    return courant === '' ? `0${SEPARATEUR}` : courant + SEPARATEUR;
  }
  if (!/^[0-9]$/.test(caractere)) return courant;
  // « 0 » puis « 5 » donne 5, pas 05. Mais « 0, » puis « 5 » donne bien 0,5.
  if (courant === '0') return caractere;
  return courant + caractere;
}

/** Efface le dernier caractère saisi. */
export function effacerDernier(courant: string): string {
  return courant.slice(0, -1);
}
