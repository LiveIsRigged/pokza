/**
 * Ce qu'on fait des espaces qu'un auteur laisse autour de ce qu'il écrit.
 *
 * POURQUOI UNE FONCTION PARTAGÉE POUR SI PEU : parce que la règle existait déjà, appliquée à un
 * seul des deux chemins. `EditPostScreen` rognait ses sept champs libres depuis toujours ;
 * `LiveHandCreator`, qui PUBLIE, n'en rognait que deux (description et options de vote). Une main
 * créée gardait donc les espaces de son auteur, et la même main corrigée les perdait — deux
 * comportements pour un seul geste, selon le chemin emprunté.
 *
 * Mesuré sur la PROD le 24/09/2026 : cinq des six lieux de mains publiques portaient une espace
 * finale (« Wiesbaden », « Commerce Casino, Los Angeles »). Le seul propre était celui d'une main
 * passée par la correction.
 *
 * ⚠️ CE N'EST PAS COSMÉTIQUE. Une espace invisible rend deux fois le même lieu étranger à lui-même :
 * aucun rapprochement par le texte ne peut marcher dessus, et c'est précisément ce sur quoi
 * reposerait tout ce qu'on voudrait faire du lieu (cf. la banque de `data/lieux.ts`, dont le premier
 * service annoncé est d'UNIFORMISER l'écriture). Elle ampute aussi le compteur du titre, qui compte
 * la chaîne brute contre son plafond de 40.
 *
 * La règle vit ici et non recopiée des deux côtés : c'est la duplication qui avait laissé les deux
 * chemins diverger.
 */

/**
 * Le texte sans ses espaces de bord — et `undefined` s'il ne reste rien.
 *
 * `undefined` et non la chaîne vide : c'est ce que `NewPostInput` et `PostEditInput` attendent pour
 * un champ absent, et ce que la base enregistre en `null`. Un champ qui ne contient que des espaces
 * n'a rien à dire ; le garder ferait s'afficher une ligne de contexte vide.
 */
export function rogne(texte: string | null | undefined): string | undefined {
  return texte?.trim() || undefined;
}
