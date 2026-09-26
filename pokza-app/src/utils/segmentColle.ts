/**
 * UN SEGMENT QUI SE COLLE À LA FIN D'UNE LIGNE DÉJÀ ÉCRITE.
 * ════════════════════════════════════════════════════════
 * `il y a 2 h · modifié · Winamax (importée)` est une seule ligne composée de trois morceaux
 * concaténés directement en JSX. Les deux derniers commencent donc par une espace — c'est elle qui
 * sépare le morceau du précédent, et elle est écrite dans le texte : « ␣· modifié ».
 *
 * ⚠️ CETTE ESPACE NE SURVIT PAS AU TUNNEL DE TRADUCTION. `i18n-import.js` fait un `.trim()` sur
 * chaque cellule du tableur, et il a raison : une cellule de tableur récolte des espaces parasites
 * qu'on ne veut nulle part. Résultat, le français et l'anglais — seuls à ne pas passer par là —
 * gardent leur espace, et les vingt-cinq autres langues affichent « il y a 3 semaines· изменено »,
 * collé. Mesuré le 26/09/2026 sur `ru`, `tr`, `ja` : aucune des trois n'a l'espace.
 *
 * Réparer catalogue par catalogue serait à refaire à chaque langue. On normalise donc ICI, au
 * point de collage : on retire l'espace de tête s'il y en a une, et on en remet exactement une.
 * Le français n'y perd rien, les autres y gagnent, et une langue de plus arrive déjà réparée.
 */
export function segmentColle(texte: string): string {
  const nu = texte.trimStart();
  return nu === '' ? '' : ` ${nu}`;
}
