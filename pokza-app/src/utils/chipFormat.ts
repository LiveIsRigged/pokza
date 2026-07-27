import type { GameType } from '../types/poker';

/** Grosse blinde de la main, pour convertir un montant en BB quand `useBB` est activé. */
export interface BBDisplayOptions {
  bb: number;
  useBB: boolean;
}

// Devise unique pour l'instant (pas encore de sélecteur) : centralisée ici pour qu'un futur choix
// de devise n'ait qu'un seul endroit à toucher.
const CASH_CURRENCY_SYMBOL = '€';

/**
 * Arrondit un montant d'argent réel au centime (2 décimales) — élimine les imprécisions flottantes
 * classiques d'une addition (0.2 + 0.4 → 0.6000000000000001 en JS). Toute somme d'argent réel
 * (cash game) devrait passer par ici avant d'être affichée ou accumulée plus loin ; les jetons de
 * tournoi (toujours des entiers) n'en ont pas besoin.
 */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// En cash game, un montant est de l'argent réel : on lui accole la devise ("10" → "10€"), sauf en
// BB (déjà une unité explicite, pas besoin de devise en plus). En tournoi, les jetons ne sont pas
// de l'argent réel — pas de devise — mais dépassent vite 4-5 chiffres : au-delà de 1000, on affiche
// en "k" (jusqu'à 2 décimales, virgule, zéros superflus supprimés : 200000 → "200k", 225500 → "225,5k").
// `bbOptions` bascule TOUT montant (stack, mise, pot) en nombre de grosses blindes à la place —
// préférence globale au feed (cf. `useDisplayUnit`), indépendante des formats ci-dessus.
export function formatChipAmount(n: number, gameType: GameType, bbOptions?: BBDisplayOptions): string {
  const amount = gameType === 'cash' ? roundMoney(n) : n;
  if (bbOptions?.useBB && bbOptions.bb > 0) {
    const bbValue = parseFloat((amount / bbOptions.bb).toFixed(1));
    return `${bbValue} bb`;
  }
  if (gameType === 'cash') return `${amount}${CASH_CURRENCY_SYMBOL}`;
  if (amount < 1000) return String(amount);
  const k = parseFloat((amount / 1000).toFixed(2));
  return `${String(k).replace('.', ',')}k`;
}
