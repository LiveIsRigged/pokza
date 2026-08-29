import type { Position } from '../types/poker';
import { POSITION_SETS } from './positions';
import type { ContextData } from './types';

/**
 * OÙ TOMBENT LES STRADDLES, ET COMBIEN ILS VALENT.
 *
 * La règle tient en une phrase : **`straddleCount` compte les straddles de la main, et le straddle
 * du bouton PREND LA PLACE du dernier maillon de la chaîne.** « Double » avec bouton, ce sont donc
 * deux straddles (UTG puis le bouton), jamais trois. C'est ce qui fait que le mot de la chip ne
 * ment jamais : « Simple » veut toujours dire un straddle, « Double » toujours deux.
 *
 * Ce qu'un straddle au bouton change au déroulé se lit ailleurs, et gratuitement : il est posté en
 * dernier, donc `firstToActAfterSeatId` le désigne et `getActingOrderAfter` fait repartir la parole
 * juste après lui — la SB ouvre, le bouton parle en dernier.
 *
 * Vit dans son propre module parce que trois endroits en dépendent (le postage dans
 * `LiveHandCreator`, le formulaire dans `ContextStep`, la relecture d'une main publiée dans
 * `rehydrate`) et que re-dériver la règle dans chacun est exactement le genre de duplication qui
 * finit par diverger.
 */

/** Le sous-ensemble du contexte dont dépend le straddle — rien d'autre n'entre dans la décision. */
export type ReglageStraddle = Pick<
  ContextData,
  'gameType' | 'bombPot' | 'numPlayers' | 'straddleCount' | 'straddleAmount' | 'straddleBouton' | 'straddleBoutonMontant'
>;

export interface StraddleAPoster {
  position: Position;
  montant: number;
  /** Le straddle du bouton, celui qui déplace l'ouverture de la parole à la SB. */
  bouton: boolean;
}

function ordrePreflop(numPlayers: number): Position[] {
  return POSITION_SETS[numPlayers] ?? POSITION_SETS[6];
}

/** Un straddle n'existe qu'en cash game hors bomb pot (une bombe n'a pas de préflop). */
function straddlePossible(ctx: ReglageStraddle): boolean {
  return ctx.gameType === 'cash' && !ctx.bombPot && ctx.straddleCount > 0;
}

/**
 * Le straddle du bouton a-t-il sa place sur cette table, pour ce nombre de straddles ?
 *
 * DEUX CONDITIONS, ET LA SECONDE EST LA MOINS ÉVIDENTE.
 * 1. Le bouton ne doit pas être le premier parleur naturel (tables à 2 et 3 joueurs, où il EST la
 *    petite blinde) : y straddler, c'est exactement le straddle simple ordinaire, pas un straddle
 *    « au bouton ».
 * 2. La chaîne qui le précède doit s'arrêter AVANT le siège juste devant le bouton. Sinon les deux
 *    configurations donnent des mises rigoureusement identiques — à 4 joueurs, « Double » (CO puis
 *    BTN) et « Double + bouton » (CO puis le bouton) postent les mêmes montants sur les mêmes
 *    sièges — et plus rien, dans la main publiée, ne permet de distinguer le straddle du bouton du
 *    dernier maillon d'une chaîne (cf. `chainStraddleCount` dans handEngine). On refuse donc
 *    d'offrir deux chemins vers la même main plutôt que d'afficher un libellé qu'on ne saurait pas
 *    relire.
 *
 * Concrètement : jamais à 2-3 joueurs, « Simple » seul à 4, jusqu'à « Double » à 5, tout à partir
 * de 6.
 */
export function boutonPossible(numPlayers: number, straddleCount: number): boolean {
  if (straddleCount <= 0) return false;
  const rangBouton = ordrePreflop(numPlayers).indexOf('BTN');
  if (rangBouton <= 0) return false;
  return straddleCount - 1 < rangBouton;
}

/** Le straddle du bouton est-il réellement actif ? (coché ET possible sur cette table). */
export function straddleBoutonActif(ctx: ReglageStraddle): boolean {
  return straddlePossible(ctx) && ctx.straddleBouton && boutonPossible(ctx.numPlayers, ctx.straddleCount);
}

/**
 * Longueur de la chaîne de straddles consécutifs à partir du premier parleur — sans regarder les
 * montants, puisque le formulaire doit nommer les sièges avant qu'ils ne soient saisis.
 */
export function longueurChaine(ctx: ReglageStraddle): number {
  if (!straddlePossible(ctx)) return 0;
  return straddleBoutonActif(ctx) ? ctx.straddleCount - 1 : ctx.straddleCount;
}

/**
 * Les straddles à poster, DANS L'ORDRE DE POSTAGE : la chaîne d'abord, le bouton en dernier. Cet
 * ordre n'est pas cosmétique — c'est lui qui fait du bouton le dernier straddleur, donc celui
 * après qui la parole reprend.
 *
 * Les montants nuls sont écartés : un « poste 0 » n'apparaîtrait dans le replayer que comme une
 * ligne sans signification.
 */
export function straddlesAPoster(ctx: ReglageStraddle): StraddleAPoster[] {
  if (!straddlePossible(ctx)) return [];
  const ordre = ordrePreflop(ctx.numPlayers);
  const slots: StraddleAPoster[] = [];
  for (let i = 0; i < longueurChaine(ctx); i++) {
    const position = ordre[i];
    const montant = ctx.straddleAmount * 2 ** i;
    if (position && montant > 0) slots.push({ position, montant, bouton: false });
  }
  if (straddleBoutonActif(ctx) && ctx.straddleBoutonMontant > 0) {
    slots.push({ position: 'BTN', montant: ctx.straddleBoutonMontant, bouton: true });
  }
  return slots;
}

/**
 * Le montant proposé au bouton quand on allume l'interrupteur : 2x le dernier straddle de la
 * chaîne, ou 2x la BB quand la chaîne est vide (tranché avec Victor le 29/08). Une valeur
 * proposée, jamais imposée — le champ reste libre ensuite, comme celui de la chaîne.
 */
export function montantBoutonPropose(ctx: ReglageStraddle & { bb: number }): number {
  const chaine = ctx.straddleCount - 1;
  if (chaine > 0 && ctx.straddleAmount > 0) return ctx.straddleAmount * 2 ** chaine;
  return ctx.bb * 2;
}
