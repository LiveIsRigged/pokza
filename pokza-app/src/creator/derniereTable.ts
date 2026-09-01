import type { Position } from '../types/poker';
import type { ContextData } from './types';
import { POSITION_SETS } from './positions';

/**
 * LA DERNIÈRE TABLE — reprendre les joueurs d'une main à l'autre.
 * ───────────────────────────────────────────────────────────────
 * Refaire une main jouée à la même table imposait de retaper tous les noms et tous les tapis. Le
 * formulaire les mémorise donc — mais JAMAIS automatiquement, contrairement aux blindes (cf.
 * `contextPrefs`). La règle vient de Victor le 01/09/2026, et sa raison mérite d'être gardée :
 *
 *   UN NOM FAUX EST PLAUSIBLE. Une blinde fausse, le lecteur la voit ; « Léa » à la place de
 *   « Tom », personne ne la corrigera jamais. Un rappel silencieux des joueurs publierait donc, tôt
 *   ou tard, une main peuplée de gens qui n'y étaient pas — et elle se lirait très bien.
 *
 * D'où la séparation en deux fichiers, qui n'est pas de la coquetterie : ce module-ci ne sait rien
 * du disque, et `derniereTableStockage` est le SEUL à y toucher. La garantie « jamais automatique »
 * vit dans la forme du rangement, pas dans la discipline de celui qui écrira le prochain écran :
 * `contextPrefs` est relu au montage, celui-ci n'a aucun appelant qui ne soit un geste explicite.
 */

/** Une table telle qu'on l'a quittée. `quand` est une date ISO, pour passer telle quelle à
 *  `formatRelativeDate` — le vocabulaire du temps de l'app, pas un second. */
export interface DerniereTable {
  quand: string;
  lieu?: string;
  numPlayers: number;
  heroPosition: Position;
  opponentNames: Partial<Record<Position, string>>;
  seatStacks: Partial<Record<Position, number>>;
}

function placesDe(numPlayers: number): Position[] {
  return POSITION_SETS[numPlayers] ?? POSITION_SETS[6];
}

/**
 * Les adversaires réellement NOMMÉS et VISIBLES, dans l'ordre des sièges. C'est le filtre qui décide
 * de tout le reste : un nom vide, un nom à une place qui n'existe pas sur cette table, ou un nom
 * caché sous le héros ne comptent pas — on ne mémorise pas ce qu'on n'affiche pas.
 */
export function joueursNommes(
  numPlayers: number,
  heroPosition: Position,
  opponentNames?: Partial<Record<Position, string>>
): { place: Position; nom: string }[] {
  return placesDe(numPlayers)
    .filter((p) => p !== heroPosition)
    .map((place) => ({ place, nom: (opponentNames?.[place] ?? '').trim() }))
    .filter((j) => j.nom.length > 0);
}

/**
 * Ce qu'on garde d'une main qu'on vient de publier. `null` quand il n'y a rien à reprendre : une
 * table sans un seul nom d'adversaire ne se « reprend » pas, et proposer une pastille vide serait
 * une promesse en l'air.
 */
export function tableDepuisContexte(ctx: ContextData, quand: string): DerniereTable | null {
  const nommes = joueursNommes(ctx.numPlayers, ctx.heroPosition, ctx.opponentNames);
  if (nommes.length === 0) return null;

  const opponentNames: Partial<Record<Position, string>> = {};
  for (const { place, nom } of nommes) opponentNames[place] = nom;

  // Les tapis des places réelles, celui du héros compris : `seatStacks` est indexé par position
  // pour tout le monde (cf. `buildSeats`), et son tapis fait partie de la table.
  const seatStacks: Partial<Record<Position, number>> = {};
  for (const place of placesDe(ctx.numPlayers)) {
    const tapis = ctx.seatStacks?.[place];
    if (typeof tapis === 'number' && Number.isFinite(tapis) && tapis > 0) seatStacks[place] = tapis;
  }

  return {
    quand,
    ...(ctx.location?.trim() ? { lieu: ctx.location.trim() } : {}),
    numPlayers: ctx.numPlayers,
    heroPosition: ctx.heroPosition,
    opponentNames,
    seatStacks,
  };
}

/** Ce que la pastille annonce : « Marc, Léa, Tom +3 ». Elle NOMME sa cargaison — le danger n'est pas
 *  la reprise, c'est la reprise muette. */
export function resumeDesJoueurs(table: DerniereTable, max = 3): string {
  const noms = joueursNommes(table.numPlayers, table.heroPosition, table.opponentNames).map((j) => j.nom);
  const tete = noms.slice(0, max).join(', ');
  const reste = noms.length - max;
  return reste > 0 ? `${tete} +${reste}` : tete;
}

/** L'écart d'un siège au héros, compté par le chemin le PLUS COURT : « deux crans après moi » ou
 *  « un cran avant moi ». Un simple modulo dirait « cinq crans après » là où le voisin est à droite,
 *  et le voisin de droite doit rester le voisin de droite quand la table change de taille. */
function ecartAuHero(delta: number, n: number): number {
  const d = ((delta % n) + n) % n;
  return d > n / 2 ? d - n : d;
}

/**
 * Reprend les joueurs dans le contexte COURANT.
 *
 * ON REPREND UN VOISINAGE, PAS DES ÉTIQUETTES (corrigé le 01/09/2026 sur un retour de Victor, et
 * c'est tout l'intérêt de la fonction). Ce qui se retient d'une main à l'autre, ce n'est pas
 * « Éric était au CO » — c'est « Éric était assis juste à ma droite ». Les positions, elles, ont
 * tourné entre-temps : le bouton a bougé.
 *
 * Chaque joueur est donc rangé à son ÉCART AU HÉROS, et reposé au même écart autour de la place que
 * le héros occupe MAINTENANT. Héros au bouton et Éric au CO, une main plus tard héros en BB : Éric
 * se retrouve en SB. La place du héros, contrairement à la première version, n'est jamais écrasée —
 * c'est elle qui commande tout le reste.
 *
 * Deux décisions qui ne se devinent pas :
 *
 *   • LE NOMBRE DE JOUEURS NE BOUGE PAS. C'est un choix structurel que l'auteur vient peut-être de
 *     faire exprès ; la reprise parle des gens, pas de la forme de la table.
 *   • CE QUI NE RENTRE PAS EST DIT. Sur une table plus courte, deux voisins d'autrefois peuvent
 *     viser la même chaise, ou tomber sur celle du héros. Ils ressortent dans `oublies` pour que
 *     l'écran puisse le dire, plutôt que de s'évaporer.
 */
export function reprendreTable(
  ctx: ContextData,
  table: DerniereTable
): { context: ContextData; oublies: string[] } {
  const nouvelles = placesDe(ctx.numPlayers);
  const anciennes = placesDe(table.numPlayers);
  const hAncien = anciennes.indexOf(table.heroPosition);
  const hNouveau = nouvelles.indexOf(ctx.heroPosition);

  /** La chaise d'arrivée d'une ancienne place, ou `null` si elle n'en a plus. */
  const arrivee = (place: Position): { place: Position; surLeHero: boolean } | null => {
    const i = anciennes.indexOf(place);
    if (i === -1 || hAncien === -1 || hNouveau === -1) return null;
    const d = ecartAuHero(i - hAncien, anciennes.length);
    const j = (((hNouveau + d) % nouvelles.length) + nouvelles.length) % nouvelles.length;
    return { place: nouvelles[j], surLeHero: j === hNouveau };
  };

  const opponentNames: Partial<Record<Position, string>> = {};
  const oublies: string[] = [];
  for (const { place, nom } of joueursNommes(table.numPlayers, table.heroPosition, table.opponentNames)) {
    const cible = arrivee(place);
    // Premier arrivé, premier assis : sur une table rétrécie, deux anciens voisins peuvent viser la
    // même chaise. On garde celui qui parlait le premier et on nomme l'autre.
    if (!cible || cible.surLeHero || opponentNames[cible.place] !== undefined) oublies.push(nom);
    else opponentNames[cible.place] = nom;
  }

  // Les tapis suivent leur propriétaire, celui du héros compris : son écart vaut zéro, donc il
  // atterrit sur sa nouvelle place. Un tapis dont le joueur n'a pas de siège s'en va avec lui.
  const seatStacks: Partial<Record<Position, number>> = {};
  for (const place of Object.keys(table.seatStacks) as Position[]) {
    const tapis = table.seatStacks[place];
    const cible = arrivee(place);
    if (typeof tapis !== 'number' || !cible) continue;
    const estLeHero = place === table.heroPosition;
    if (cible.surLeHero && !estLeHero) continue;
    if (seatStacks[cible.place] === undefined) seatStacks[cible.place] = tapis;
  }

  return { context: { ...ctx, opponentNames, seatStacks }, oublies };
}

/**
 * Relit un objet sorti du disque. Chaque champ est validé séparément, comme dans `contextPrefs` :
 * un stockage corrompu ou écrit par une version antérieure doit rendre `null`, jamais un formulaire
 * à moitié rempli de valeurs douteuses.
 */
export function validerTable(brut: unknown): DerniereTable | null {
  if (!brut || typeof brut !== 'object') return null;
  const t = brut as Partial<DerniereTable>;
  if (typeof t.quand !== 'string' || Number.isNaN(new Date(t.quand).getTime())) return null;
  if (typeof t.numPlayers !== 'number' || !POSITION_SETS[t.numPlayers]) return null;
  if (typeof t.heroPosition !== 'string' || !placesDe(t.numPlayers).includes(t.heroPosition)) return null;

  const opponentNames: Partial<Record<Position, string>> = {};
  for (const [place, nom] of Object.entries(t.opponentNames ?? {})) {
    if (typeof nom === 'string' && nom.trim()) opponentNames[place as Position] = nom.trim();
  }
  if (Object.keys(opponentNames).length === 0) return null;

  const seatStacks: Partial<Record<Position, number>> = {};
  for (const [place, tapis] of Object.entries(t.seatStacks ?? {})) {
    if (typeof tapis === 'number' && Number.isFinite(tapis) && tapis > 0) seatStacks[place as Position] = tapis;
  }

  return {
    quand: t.quand,
    ...(typeof t.lieu === 'string' && t.lieu.trim() ? { lieu: t.lieu.trim() } : {}),
    numPlayers: t.numPlayers,
    heroPosition: t.heroPosition,
    opponentNames,
    seatStacks,
  };
}
