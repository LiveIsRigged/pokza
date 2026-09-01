import type { Position } from '../types/poker';
import type { ContextData } from './types';
import { POSITION_SETS } from './positions';

/**
 * DÉPLACER LES JOUEURS À TABLE — décalage, échange, effacement.
 * ─────────────────────────────────────────────────────────────
 * Trois opérations pures sur le contexte, écrites ici plutôt que dans l'écran parce qu'elles ont
 * toutes le même piège et qu'il ne se voit pas à la lecture d'un composant.
 *
 * LE PIÈGE : LE HÉROS N'EST PAS RANGÉ COMME LES AUTRES. Son nom vit dans `heroName`, à part, parce
 * qu'il SUIT le joueur ; ceux des adversaires vivent dans `opponentNames`, indexé par position,
 * donc attachés à la CHAISE. Les tapis, eux, sont indexés par position POUR TOUT LE MONDE, héros
 * compris (cf. `buildSeats`, qui lit `seatStacks[position]` sans regarder `isHero`).
 *
 * D'où l'asymétrie qu'on retrouve dans les trois fonctions : un tapis se déplace toujours, un nom
 * d'adversaire ne se déplace que s'il est VISIBLE. Car il existe un cas où il ne l'est pas — un nom
 * écrit à une position que le héros occupe ensuite reste stocké mais n'est plus affiché
 * (`buildSeats` sert `heroName` à cette place). Le déplacer reviendrait à faire APPARAÎTRE sur un
 * autre siège un joueur que l'auteur croyait effacé. On le laisse donc tomber, et `nomVisible` est
 * le seul endroit qui décide de ça.
 *
 * Ce qui NE bouge JAMAIS : le straddle, l'ante, les blindes, le nombre de joueurs. Une place garde
 * ses mises forcées quand son occupant change — c'est la chaise qui straddle, pas la personne.
 */

/** +1 : une main plus tard (le bouton avance d'un siège). -1 : la main d'avant. */
export type SensDeDecalage = 1 | -1;

function placesDe(ctx: ContextData): Position[] {
  return POSITION_SETS[ctx.numPlayers] ?? POSITION_SETS[6];
}

/** Le nom d'adversaire réellement AFFICHÉ à cette place — donc rien à celle du héros. */
function nomVisible(ctx: ContextData, place: Position): string | undefined {
  if (place === ctx.heroPosition) return undefined;
  return ctx.opponentNames?.[place];
}

/**
 * LE BOUTON A TOURNÉ : tout le monde recule d'un cran dans l'ordre de parole.
 *
 * `POSITION_SETS` est l'ordre de parole préflop, qui est aussi l'ordre PHYSIQUE des chaises (l'action
 * tourne dans le sens des aiguilles). Une main plus tard, le bouton est passé au siège suivant :
 * celui qui était SB devient BTN, celui qui était UTG devient BB. En indices, c'est `i - 1`.
 *
 * Le héros voyage avec les autres — il est un joueur de la table, pas un repère fixe.
 */
export function decalerJoueurs(ctx: ContextData, sens: SensDeDecalage): ContextData {
  const places = placesDe(ctx);
  const n = places.length;

  /** Où va l'occupant de cette place. Une place absente de la table (reste d'une table plus grande)
   *  ne bouge pas : elle n'a pas de siège, donc pas de voisin. */
  const arrivee = (place: Position): Position => {
    const i = places.indexOf(place);
    if (i === -1) return place;
    return places[(i - sens + n) % n];
  };

  const opponentNames: Partial<Record<Position, string>> = {};
  for (const place of Object.keys(ctx.opponentNames ?? {}) as Position[]) {
    const nom = nomVisible(ctx, place);
    if (nom !== undefined) opponentNames[arrivee(place)] = nom;
  }

  // Les tapis se déplacent tous, celui du héros compris : `seatStacks` est indexé par position pour
  // tout le monde. L'oublier laisserait le tapis du héros sur la chaise qu'il vient de quitter.
  const seatStacks: Partial<Record<Position, number>> = {};
  for (const place of Object.keys(ctx.seatStacks ?? {}) as Position[]) {
    const tapis = ctx.seatStacks?.[place];
    if (tapis !== undefined) seatStacks[arrivee(place)] = tapis;
  }

  return { ...ctx, heroPosition: arrivee(ctx.heroPosition), opponentNames, seatStacks };
}

/**
 * DEUX JOUEURS ÉCHANGENT DE PLACE. Un échange, jamais une insertion : mettre Marc en BB ne pousse
 * personne d'un cran, ça renvoie l'occupant de la BB là où Marc était. Sinon un doigt qui glisse
 * rebat toute la table.
 *
 * Le héros peut être l'un des deux : il change alors de position, et l'adversaire échangé récupère
 * la chaise qu'il libère.
 */
export function echangerJoueurs(ctx: ContextData, a: Position, b: Position): ContextData {
  if (a === b) return ctx;

  const opponentNames = { ...(ctx.opponentNames ?? {}) };
  const nomA = nomVisible(ctx, a);
  const nomB = nomVisible(ctx, b);
  delete opponentNames[a];
  delete opponentNames[b];
  if (nomB !== undefined) opponentNames[a] = nomB;
  if (nomA !== undefined) opponentNames[b] = nomA;

  const seatStacks = { ...(ctx.seatStacks ?? {}) };
  const tapisA = ctx.seatStacks?.[a];
  const tapisB = ctx.seatStacks?.[b];
  delete seatStacks[a];
  delete seatStacks[b];
  if (tapisB !== undefined) seatStacks[a] = tapisB;
  if (tapisA !== undefined) seatStacks[b] = tapisA;

  const heroPosition =
    ctx.heroPosition === a ? b : ctx.heroPosition === b ? a : ctx.heroPosition;

  return { ...ctx, heroPosition, opponentNames, seatStacks };
}

/**
 * VIDER UN SIÈGE : le nom ET le tapis (Victor, 01/09/2026). La fiche parle d'une personne — si elle
 * s'en va, son tapis part avec, et la place retombe sur le stack effectif comme un siège jamais
 * touché. Un tapis orphelin resterait affiché sans qu'on sache à qui il appartient.
 *
 * Le héros ne quitte pas la table : vider SA place efface son nom (il redevient « Hero ») et son
 * tapis, mais il reste assis.
 */
export function viderSiege(ctx: ContextData, place: Position): ContextData {
  const opponentNames = { ...(ctx.opponentNames ?? {}) };
  delete opponentNames[place];
  const seatStacks = { ...(ctx.seatStacks ?? {}) };
  delete seatStacks[place];
  const heroName = place === ctx.heroPosition ? undefined : ctx.heroName;
  return { ...ctx, heroName, opponentNames, seatStacks };
}
