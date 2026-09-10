import { langueCourante } from '../i18n/traduire';

/**
 * « Bob et Chloé », « Bob, Chloé et Ali » — le « et » final, sinon la phrase sonne comme une liste.
 *
 * `Intl.ListFormat` fait exactement ça, dans chaque langue et avec ses règles propres : l'anglais
 * met la virgule d'Oxford (« Bob, Chloé, and Ali ») là où le français ne la met pas. Vérifié avant
 * de basculer : sur les mêmes entrées, `Intl.ListFormat('fr')` rend AUJOURD'HUI exactement ce que
 * rendait le « et » écrit à la main.
 */
export function enumerer(elements: readonly string[]): string {
  if (elements.length === 0) return '';
  if (elements.length === 1) return elements[0];
  try {
    return new Intl.ListFormat(langueCourante(), { style: 'long', type: 'conjunction' }).format(
      elements as string[]
    );
  } catch {
    // Moteur sans ICU : la virgule seule reste lisible, mieux qu'une exception.
    return elements.join(', ');
  }
}
