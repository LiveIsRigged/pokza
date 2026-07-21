import type { GameType } from '../types/poker';

// En tournoi, les montants dépassent vite 4-5 chiffres : au-delà de 1000 jetons, on affiche en
// "k" (jusqu'à 2 décimales, virgule) pour ne pas surcharger l'écran. Le cash game garde la valeur
// brute. Les zéros superflus après la virgule sont supprimés (200000 → "200k", 225500 → "225,5k").
export function formatChipAmount(n: number, gameType: GameType): string {
  if (gameType !== 'tournament' || n < 1000) return String(n);
  const k = parseFloat((n / 1000).toFixed(2));
  return `${String(k).replace('.', ',')}k`;
}
