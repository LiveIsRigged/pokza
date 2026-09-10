import React from 'react';
import { segmenter } from './traduire';

/**
 * Rend une phrase du catalogue dont un morceau n'est pas du texte — un mot mis en valeur, un lien
 * qui ouvre les CGU — en gardant la phrase entière dans le catalogue (cf. `segmenter`, qui porte
 * l'explication et les tests). Un repère sans nœud correspondant est laissé TEL QUEL : voir
 * l'accolade vaut mieux qu'un trou muet au milieu d'une phrase.
 */
export function decouper(
  gabarit: string,
  noeuds: Record<string, React.ReactNode>
): React.ReactNode[] {
  return segmenter(gabarit).map((segment, i) => {
    if ('texte' in segment) return segment.texte;
    const noeud = noeuds[segment.repere];
    if (noeud === undefined) return `{${segment.repere}}`;
    return <React.Fragment key={`${segment.repere}-${i}`}>{noeud}</React.Fragment>;
  });
}
