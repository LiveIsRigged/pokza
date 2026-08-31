/**
 * Repliement d'une chaîne pour une recherche tolérante : minuscules et accents retirés, pour que
 * « benin » trouve « Bénin » et « barcelone » trouve « Barcelone ».
 *
 * `normalize` n'est pas garanti sur tous les moteurs (vieux Hermes) : en son absence on se rabat
 * sur la seule casse, ce qui dégrade la recherche sans jamais la casser.
 */
export function fold(text: string): string {
  const lower = text.toLowerCase();
  return typeof lower.normalize === 'function'
    ? lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
    : lower;
}
