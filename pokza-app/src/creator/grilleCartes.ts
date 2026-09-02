import type { Rank } from '../types/poker';

/** Les 13 rangs, de l'as au deux — l'ordre dans lequel le sélecteur les pose. */
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * LES 13 RANGS TIENNENT TOUJOURS — constat 4 de l'audit du 01/09/2026.
 * ───────────────────────────────────────────────────────────────────
 * Avant : carte de 44 px, 644 px de contenu pour 354 px visibles sur un iPhone 14. Sept rangs
 * visibles (A K Q J T 9 8), six derrière un défilement horizontal (7 6 5 4 3 2), et le 2♦ posé à
 * x = 618 sur un écran de 390. Une main comme 7♦2♣ coûtait deux défilements en plus des deux
 * touchers — sur le geste le PLUS répété du créateur (sept cartes au minimum par main racontée
 * jusqu'au bout, et les quatre couleurs défilaient indépendamment).
 *
 * Maintenant : la carte se calcule pour que les 13 rangs entrent, quelle que soit la largeur.
 * 24 px sur un iPhone 14, 23 sur un SE, et 44 (la taille d'avant) dès qu'un écran est assez large
 * pour les tenir. La hauteur descend de 58 à 44 : la cible tactile reste à la recommandation en
 * HAUTEUR et passe dessous en LARGEUR. C'est le compromis accepté, parce qu'ici l'erreur est
 * IMMÉDIATEMENT VISIBLE — la mauvaise carte apparaît sur le feutre, un second toucher la retire.
 * Ce n'est pas le cas d'un siège mal touché, qui est silencieux (cf. constat 9).
 *
 * Ce module est SÉPARÉ de `MultiCardPicker.tsx` pour une seule raison : le calcul est pur, donc
 * testable sans react-native (cf. `scripts/test-selecteur-cartes.js`).
 */
export const CARD_MAX_WIDTH = 44;
export const CARD_HEIGHT = 44;
const GAP_MIN = 3;
const GAP_MAX = 6;
/** Sous quoi une carte ne descend pas, même sur un écran minuscule : en dessous, le rang n'est plus
 *  lisible et le sélecteur n'est plus tapable. Un écran assez étroit pour l'atteindre reprendrait
 *  son défilement — le fondu de bord est là pour ça (cf. `SuitRow`). */
const CARD_MIN_WIDTH = 18;
/** Rembourrage de `WizardScreen` (18 px de chaque côté). Les quatre écrans qui posent ce sélecteur
 *  sont tous dedans, sans marge propre — vérifié un par un le 01/09. Le `+ 2` est un coussin : le
 *  contenu ne doit pas finir EXACTEMENT au pixel de la fenêtre, sous peine de fondu clignotant. */
const INSET = 36 + 2;
/** Talon vertical sous chaque rangée : c'est le rythme entre les quatre couleurs, il ne suit pas la
 *  largeur des cartes. */
export const ROW_GAP = 6;

export interface GrilleCartes {
  largeur: number;
  gap: number;
  contenu: number;
  tailleRang: number;
  tailleCouleur: number;
  rayon: number;
}

/**
 * Carte, écart et largeur de contenu pour une fenêtre donnée. Déterministe, donc jamais mesuré :
 * `onLayout` et `onContentSizeChange` ne se déclenchent JAMAIS sous react-native-web (cf. `SuitRow`,
 * `InstallPrompt.tsx`, `Turnstile.tsx`). La seule entrée est `useWindowDimensions`.
 */
export function grilleCartes(largeurFenetre: number): GrilleCartes {
  const dispo = Math.max(0, largeurFenetre - INSET);
  const largeur = Math.max(
    CARD_MIN_WIDTH,
    Math.min(CARD_MAX_WIDTH, Math.floor((dispo - (RANKS.length - 1) * GAP_MIN) / RANKS.length))
  );
  // L'écart absorbe le reste : sans lui, une carte tronquée à l'entier laisserait jusqu'à 12 px
  // morts au bout de la rangée, et les 13 rangs sembleraient collés d'un côté de l'écran.
  const gap = Math.max(
    GAP_MIN,
    Math.min(GAP_MAX, (dispo - RANKS.length * largeur) / (RANKS.length - 1))
  );
  return {
    largeur,
    gap,
    contenu: RANKS.length * largeur + (RANKS.length - 1) * gap,
    // Les deux textes suivent la carte : à 44 px on retrouve exactement les tailles d'avant (17/16),
    // à 24 px ils descendent à 15/14 — ce qui laisse encore 5 px de jeu dans les 41 px utiles.
    tailleRang: Math.max(13, Math.min(17, Math.round(largeur * 0.62))),
    tailleCouleur: Math.max(12, Math.min(16, Math.round(largeur * 0.58))),
    rayon: Math.min(8, Math.round(largeur / 4)),
  };
}
