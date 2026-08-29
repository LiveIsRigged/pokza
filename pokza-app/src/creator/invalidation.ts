import type { Action, Seat } from '../types/poker';
import type { ContextData } from './types';
import { committedBySeat } from '../engine/handEngine';

/**
 * CE QUI INVALIDE UN DÉROULÉ DÉJÀ SAISI, ET CE QUI NE L'INVALIDE PAS.
 *
 * La règle tient en une phrase : **une carte, un nom ou un texte se corrigent sans rien perdre ;
 * l'argent et la structure, non.** Elle se justifie sur la forme d'une action — un siège, un type,
 * un montant, une street. Aucune action ne référence une carte ni un nom : les identifiants de
 * sièges sont dérivés des positions (`s-co`), pas des noms. Changer une carte ou un nom ne peut
 * donc rendre aucune mise illégale ; seuls le vainqueur et les équités se recalculent, ce qui est
 * un calcul et non une contradiction.
 *
 * Ce module ne décide QUE du critère. Ce qu'on en fait — effacer la suite, ou publier directement —
 * appartient à `LiveHandCreator`.
 */

/** Libellés des champs qui, modifiés, rendent le déroulé incohérent. L'ordre est celui du formulaire. */
const CHAMPS_STRUCTURELS: { cle: keyof ContextData; label: string }[] = [
  { cle: 'gameType', label: 'le type de partie' },
  { cle: 'variant', label: 'la variante' },
  { cle: 'bombPot', label: 'le bomb pot' },
  { cle: 'bombAnte', label: "l'ante de la bombe" },
  { cle: 'sb', label: 'les blindes' },
  { cle: 'bb', label: 'les blindes' },
  { cle: 'anteType', label: "l'ante" },
  { cle: 'ante', label: "l'ante" },
  { cle: 'straddleCount', label: 'le straddle' },
  { cle: 'straddleAmount', label: 'le straddle' },
  { cle: 'numPlayers', label: 'le nombre de joueurs' },
  { cle: 'heroPosition', label: 'ta position' },
];

/**
 * Ce que chaque siège peut encore se voir attribuer comme tapis, sachant ce qu'il a déjà mis.
 *
 * UN TAPIS NE CONTRAINT QUE SON PROPRE SIÈGE : au poker on peut miser plus qu'un adversaire court,
 * l'excédent lui est rendu, et le moteur gère déjà les pots secondaires. Le tapis d'un vilain n'a
 * donc aucun effet sur la légalité des actions des autres.
 *
 * - `plancher` : ce que le siège a engagé. En dessous, sa propre mise deviendrait illégale.
 * - `verrouilles` : les sièges partis à tapis. Leur cas n'est PAS symétrique — baisser rendrait la
 *   mise illégale, mais augmenter casse tout autant : le siège ne serait plus à tapis, il aurait
 *   donc dû parler aux streets suivantes, et le déroulé enregistré est muet pour lui. On obtiendrait
 *   une main où quelqu'un cesse d'agir sans s'être couché.
 */
export interface ContraintesTapis {
  plancher: Record<string, number>;
  verrouilles: Set<string>;
}

export function contraintesTapis(seats: Seat[], actions: Action[]): ContraintesTapis {
  const engage = committedBySeat(actions);
  const plancher: Record<string, number> = {};
  const verrouilles = new Set<string>();
  for (const seat of seats) {
    const mis = engage[seat.id] ?? 0;
    plancher[seat.id] = mis;
    // Même test que `computeHandState` pour `allInSeatIds` : le siège a mis tout ce qu'il avait.
    if (mis > 0 && mis >= seat.startingStack) verrouilles.add(seat.id);
  }
  return { plancher, verrouilles };
}

/** Le tapis effectif s'applique aux sièges SANS tapis propre : ce sont eux, et eux seuls, qu'il contraint. */
function siegesAuTapisEffectif(seats: Seat[], ctx: ContextData): Seat[] {
  return seats.filter((s) => !(ctx.seatStacks?.[s.position] && ctx.seatStacks[s.position]! > 0));
}

/**
 * Les libellés des changements qui obligent à ressaisir la suite. Vide = rien n'est perdu.
 *
 * `doubleBoard` est volontairement absent des champs structurels : en bomb pot les enchères se
 * déroulent UNE seule fois, le second board ne fait que dédoubler le run-out et le pot se partage
 * à l'abattage. Aucune mise ne bouge. (L'activer demande en revanche de saisir ses cartes — c'est
 * une complétude, pas une ressaisie, et ça se traite dans l'étape.)
 *
 * Les tapis ne sont pas structurels non plus : ils ne deviennent invalidants que s'ils sortent de
 * leurs bornes (cf. `contraintesTapis`), ce que le formulaire empêche de saisir. La vérification
 * reste ici en dernier rempart, pour qu'une valeur venue d'ailleurs ne passe jamais en silence.
 */
export function champsInvalidants(
  avant: ContextData,
  apres: ContextData,
  seats: Seat[],
  actions: Action[]
): string[] {
  const labels: string[] = [];
  for (const { cle, label } of CHAMPS_STRUCTURELS) {
    if (avant[cle] !== apres[cle] && !labels.includes(label)) labels.push(label);
  }

  const { plancher, verrouilles } = contraintesTapis(seats, actions);
  const tapisDe = (s: Seat, ctx: ContextData) => ctx.seatStacks?.[s.position] || ctx.effectiveStack;
  const tapisCasse = seats.some((s) => {
    const av = tapisDe(s, avant);
    const ap = tapisDe(s, apres);
    if (av === ap) return false;
    if (verrouilles.has(s.id)) return true;
    return ap < (plancher[s.id] ?? 0);
  });
  if (tapisCasse) labels.push('les tapis');

  return labels;
}

/** Le tapis effectif est-il verrouillé, et à quel minimum ? `null` = libre. */
export function contrainteTapisEffectif(
  seats: Seat[],
  actions: Action[],
  ctx: ContextData
): { min: number; verrouille: boolean } {
  const concernes = siegesAuTapisEffectif(seats, ctx);
  const { plancher, verrouilles } = contraintesTapis(seats, actions);
  return {
    min: concernes.reduce((m, s) => Math.max(m, plancher[s.id] ?? 0), 0),
    verrouille: concernes.some((s) => verrouilles.has(s.id)),
  };
}
