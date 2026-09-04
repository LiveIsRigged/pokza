import type { GameType } from '../types/poker';
import { devise, habillerMontant } from './currency';

/** Grosse blinde de la main, pour convertir un montant en BB quand `useBB` est activé. */
export interface BBDisplayOptions {
  bb: number;
  useBB: boolean;
}

/** Habille une dénomination de blindes déjà composée ("2/5" → "2/5€", "$2/5", "25/50 Kč") : la
 * devise en cash, rien en tournoi (les jetons ne sont pas de l'argent réel). Le sigle se pose une
 * seule fois autour de la dénomination entière, pas sur chacun de ses nombres. */
export function habillerDenomination(stakes: string, gameType: GameType, codeDevise?: string): string {
  return gameType === 'cash' ? habillerMontant(stakes, devise(codeDevise)) : stakes;
}

/**
 * Arrondit un montant d'argent réel au centime (2 décimales) — élimine les imprécisions flottantes
 * classiques d'une addition (0.2 + 0.4 → 0.6000000000000001 en JS). Toute somme d'argent réel
 * (cash game) devrait passer par ici avant d'être affichée ou accumulée plus loin ; les jetons de
 * tournoi (toujours des entiers) n'en ont pas besoin.
 */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Abrège un nombre de jetons : "k" à partir de 1000, "M" à partir d'un million (jusqu'à 2
 * décimales, virgule, zéros superflus supprimés : 200000 → "200k", 225500 → "225,5k",
 * 5000000 → "5M"). Sans le palier "M", un tournoi profond affichait "5000k" — atteignable dès le
 * preset de blindes 50000/100000, dont le stack par défaut vaut 5 millions de jetons.
 * Source unique du format abrégé : `formatChipAmount` comme la saisie du wizard passent par ici.
 */
export function abbreviateChips(n: number): string {
  if (n < 1000) return String(n);
  // Le palier se choisit APRÈS arrondi, pas avant : 999999 vaut 999,999k, que l'arrondi au
  // centième ramène à "1000k" — précisément la forme qu'on cherche à éliminer. On repasse donc
  // en millions dès que l'arrondi atteint le millier.
  const useMillions = n >= 1_000_000 || parseFloat((n / 1000).toFixed(2)) >= 1000;
  const [value, suffix] = useMillions ? [n / 1_000_000, 'M'] : [n / 1000, 'k'];
  return `${String(parseFloat(value.toFixed(2))).replace('.', ',')}${suffix}`;
}

// En cash game, un montant est de l'argent réel : on lui accole la devise ("10" → "10€", "$10"),
// sauf en BB (déjà une unité explicite, pas besoin de devise en plus). En tournoi, les jetons ne
// sont pas de l'argent réel — pas de devise — mais dépassent vite 4-5 chiffres : au-delà de 1000,
// on abrège (cf. `abbreviateChips`).
// L'argent réel ne s'abrège PAS, à une exception près : les devises dont les montants ordinaires
// sont à six chiffres ou plus (cf. `Devise.abrege`). Un tapis de 100BB vaut 4 000 000 en dong ; le
// laisser en entier remplirait chaque siège de sept chiffres pour rien.
// `bbOptions` bascule TOUT montant (stack, mise, pot) en nombre de grosses blindes à la place —
// préférence globale au feed (cf. `useDisplayUnit`), indépendante des formats ci-dessus.
export function formatChipAmount(
  n: number,
  gameType: GameType,
  bbOptions?: BBDisplayOptions,
  codeDevise?: string
): string {
  const amount = gameType === 'cash' ? roundMoney(n) : n;
  if (bbOptions?.useBB && bbOptions.bb > 0) {
    const bbValue = parseFloat((amount / bbOptions.bb).toFixed(1));
    return `${bbValue} bb`;
  }
  if (gameType === 'cash') {
    const d = devise(codeDevise);
    return habillerMontant(d.abrege ? abbreviateChips(amount) : String(amount), d);
  }
  return abbreviateChips(amount);
}

/**
 * En dessous de ce montant, un nombre reste plus lisible écrit en entier : "1500" parle mieux que
 * "1,5k".
 *
 * Servait d'abord la seule réécriture du champ de saisie ; depuis le 04/09/2026 il tranche aussi la
 * DÉNOMINATION DES BLINDES de la ligne de contexte (cf. `formatContextLine`), où "500-1000" se lit
 * mieux que "500-1k" pour exactement la même raison. Les jetons du feed et du replayer, eux,
 * abrègent toujours dès 1000 (`abbreviateChips`) : un tapis n'est pas une dénomination, et
 * l'afficher en entier déborde du siège.
 */
export const SEUIL_ABREGEMENT = 10000;

/**
 * Texte à afficher dans un champ de saisie de jetons, une fois que le joueur en est sorti :
 * 30000 → "30k" en tournoi. Reste tel quel en cash game (de l'argent réel ne s'abrège pas, cf.
 * `formatChipAmount`) et sous le seuil de lisibilité.
 */
export function formatChipInput(n: number, gameType: GameType): string {
  if (gameType !== 'tournament' || n < SEUIL_ABREGEMENT) return String(n);
  return abbreviateChips(n);
}

/**
 * Lit un montant de jetons tapé à la main, avec suffixe d'abréviation facultatif :
 * "30k" → 30000, "1,5M" → 1500000, "2500" → 2500. Rend `undefined` si ce n'est pas un montant.
 *
 * Le suffixe compte surtout pour la RÉ-ÉDITION : le clavier `decimal-pad` d'iOS n'a pas de lettres,
 * donc un joueur sur iPhone ne peut pas taper le "k" lui-même — mais il peut corriger le nombre
 * devant un "k" déjà présent (mis là par `formatChipInput`), et il faut alors le relire sans perdre
 * le facteur 1000. Au clavier physique, taper "30k" directement fonctionne aussi.
 */
export function parseChipAmount(text: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  const match = /^(\d*\.?\d+)([km])$/i.exec(cleaned);
  if (!match) {
    const plain = parseFloat(cleaned);
    return Number.isNaN(plain) ? undefined : plain;
  }
  const base = parseFloat(match[1]);
  if (Number.isNaN(base)) return undefined;
  return match[2].toLowerCase() === 'k' ? base * 1000 : base * 1_000_000;
}
