import type { GameType } from '../types/poker';
import { roundMoney } from './chipFormat';

/**
 * Arrondi des raccourcis de taille de mise sur ce qu'un joueur peut RÉELLEMENT annoncer à la table.
 *
 * Le besoin vient du live : en 5-10, un « 1/3 pot » calculé à 28 € affiche un montant que personne
 * ne peut poser (il n'y a pas de jeton de 1 en circulation), donc le raccourci n'est cliquable que
 * quand il tombe juste par chance — mesuré à 54 % des cas. Arrondi à 30, il devient toujours
 * cliquable. L'objectif n'est donc PAS la légalité du montant (28 serait légal dans bien des
 * salles) mais de retomber sur le montant qui a vraiment été annoncé, puisque cet écran sert à
 * ressaisir une main déjà jouée.
 */

/**
 * Échelle des jetons qui circulent vraiment dans une salle. Elle sert de gabarit à TOUS les pas
 * calculés ici : un pas hors échelle produit des montants impossibles à poser.
 *
 * ⚠️ C'est précisément ce qui condamne la règle intuitive « le pas = la petite blinde » : en 6-12
 * elle donne un pas de 6, donc des mises à 24 / 30 / 36 €. En 200-400 elle donne 200 alors que le
 * jeton de travail est le 100. Passer par l'échelle corrige les deux.
 */
export const CHIP_LADDER = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];

/**
 * Rapport entre un montant et son pas d'arrondi : le pas est le plus gros jeton valant au plus
 * `montant / PRECISION_RATIO`. Un montant garde donc toujours le même nombre de chiffres utiles,
 * quel que soit son ordre de grandeur — c'est ce qui distingue cette règle d'un palier fixe.
 *
 * ⚠️ Un palier FIXE ne peut pas marcher, et c'est mesuré : un second pas figé à 25 en 5-10 sort
 * 525, 1075 puis 2675, que personne n'annonce. Il faut autant de paliers que d'ordres de grandeur.
 * ⚠️ 10 et pas 20 ni 30 : au-delà, la famille des montants « en quarts » (1075, 2675) réapparaît.
 * La contrepartie assumée est une dérive d'au plus 5 % par rapport à la fraction visée — c'est
 * exactement ce que fait un joueur qui annonce 550 dans un pot où le tiers vaut 533.
 */
const PRECISION_RATIO = 10;

/** Nombre de chiffres significatifs conservés en tournoi (16 777 → 16 800). */
const TOURNAMENT_SIGNIFICANT_DIGITS = 3;

export interface BetRoundingContext {
  gameType: GameType;
  /** Petite blinde de la table (0 en bomb pot : le plancher retombe alors sur la tranche de BB). */
  sb: number;
  /** Grosse blinde de la table — en bomb pot, le montant de la bombe (cf. `finalize`). */
  bb: number;
}

type Direction = 'nearest' | 'down' | 'up';

/** Le plus gros jeton de l'échelle valant au plus `v`, ou `null` en dessous du plus petit. */
function largestChipAtMost(v: number): number | null {
  let found: number | null = null;
  for (const chip of CHIP_LADDER) if (chip <= v) found = chip;
  return found;
}

/** `bb` est-il un multiple exact de `sb` ? Passe par une tolérance parce que les blindes peuvent
 * être décimales (2,5 / 5) et que `5 % 2.5` n'est fiable qu'en apparence. */
function divides(sb: number, bb: number): boolean {
  if (sb <= 0) return false;
  const ratio = bb / sb;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

/**
 * Pas PLANCHER d'une table : la granularité la plus fine qu'on s'autorise, quelle que soit la
 * taille de la mise. C'est lui qui fait qu'en 2-4-8 on peut encore proposer 24 € (jetons de 2 en
 * circulation) là où une 2-5 s'arrête à 25 €.
 *
 * Deux branches, dans cet ordre :
 * 1. la SB divise la BB → ses jetons circulent, on prend le jeton juste en dessous d'elle ;
 *    le passage par l'échelle est ce qui ramène le 6 d'une 6-12 à 5 et le 200 d'une 200-400 à 100.
 * 2. sinon (dont toute table où la SB vaut 1, qui divise tout et ne prouve donc rien) → convention
 *    de salle par tranche de BB. Ces bornes ne se déduisent d'aucune formule : ce sont des usages
 *    (en 1-3 on mise par 5 alors que le jeton de 1 existe), validés limite par limite.
 */
export function tableStep(sb: number, bb: number): number {
  // Micro-limites : aucun jeton de l'échelle n'a de sens sous la BB, on ne va pas plus gros qu'elle.
  if (bb < 2) return largestChipAtMost(bb) ?? bb;
  if (sb >= 2 && divides(sb, bb)) return largestChipAtMost(sb) ?? 1;
  if (bb <= 2) return 2;
  if (bb <= 10) return 5;
  if (bb <= 20) return 10;
  if (bb <= 50) return 25;
  if (bb <= 200) return 100;
  return largestChipAtMost(bb / 2) ?? 1;
}

/** Pas applicable à UN montant donné : jamais plus fin que le plancher de la table, et d'autant
 * plus gros que le montant est grand. En tournoi, l'échelle des jetons n'a pas de sens (ils sont
 * rebattus à chaque palier) : la granularité découle du seul ordre de grandeur. */
export function betStep(amount: number, ctx: BetRoundingContext): number {
  if (ctx.gameType === 'tournament') {
    if (amount < 10 ** (TOURNAMENT_SIGNIFICANT_DIGITS - 1)) return 1;
    return 10 ** (Math.floor(Math.log10(amount)) - TOURNAMENT_SIGNIFICANT_DIGITS + 1);
  }
  return Math.max(tableStep(ctx.sb, ctx.bb), largestChipAtMost(amount / PRECISION_RATIO) ?? 0);
}

function applyDirection(amount: number, step: number, direction: Direction): number {
  if (step <= 0) return amount;
  const quotient = amount / step;
  const rounded =
    direction === 'down' ? Math.floor(quotient) : direction === 'up' ? Math.ceil(quotient) : Math.round(quotient);
  return rounded * step;
}

/**
 * Arrondit un montant de mise. `direction` vaut 'down' pour le raccourci « Pot », qui ne doit
 * jamais dépasser le pot : le libellé serait faux en NLHE, et le montant carrément illégal en PLO,
 * où le pot est le maximum autorisé.
 */
export function roundBet(amount: number, ctx: BetRoundingContext, direction: Direction = 'nearest'): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const rounded = applyDirection(amount, betStep(amount, ctx), direction);
  return ctx.gameType === 'cash' ? roundMoney(rounded) : Math.round(rounded);
}

/** Le plus petit montant arrondi STRICTEMENT supérieur à `value`. Sert à remonter un raccourci
 * tombé sous la mise à suivre : un bouton qui propose une relance insuffisante est un bouton mort,
 * puisque la validation le refusera (cf. `confirmAmount`). */
export function nextBetAbove(value: number, ctx: BetRoundingContext): number {
  const step = betStep(Math.max(value, 0) || 1, ctx);
  let next = applyDirection(value, step, 'up');
  if (next <= value) next = value + step;
  return ctx.gameType === 'cash' ? roundMoney(next) : Math.round(next);
}
