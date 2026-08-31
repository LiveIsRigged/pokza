import type { Card } from '../types/poker';
import type { SiegeAffiche } from '../components/table/TableVue';
import type { ContextData } from './types';
import { buildSeats } from './positions';
import { committedBySeat } from '../engine/handEngine';
import type { Action, Seat } from '../types/poker';
import { straddlesAPoster } from './straddle';

/**
 * LA TABLE PENDANT LE RÉGLAGE — étapes « contexte » et « tes cartes ».
 * ───────────────────────────────────────────────────────────────────
 * La main n'a pas commencé : personne n'a agi, il n'y a rien à relire. Ce que la table montre ici
 * n'est donc pas un déroulé, c'est une VÉRIFICATION du réglage — combien de joueurs, où est Hero,
 * où est le bouton, qui porte quel nom, quel tapis, et surtout où tombent les mises forcées.
 *
 * C'est ce dernier point qui justifie de la calculer plutôt que de dessiner une table vide : un
 * BTN straddle se comprend aujourd'hui en lisant une phrase, alors qu'il se VOIT en un coup d'œil
 * dès que le jeton est posé devant le bouton. Même chose pour l'ante par joueur, qui met un petit
 * tas devant tout le monde.
 *
 * Les montants viennent des mêmes fonctions que la vraie main (`buildSeats`, `straddlesAPoster`),
 * jamais d'un calcul refait ici : une table de réglage qui ne dirait pas la même chose que la main
 * qu'elle annonce serait pire qu'une table absente.
 */

/** Ce que chaque siège a déjà devant lui avant la première décision, par position. */
function misesForcees(ctx: ContextData, positions: string[]): Partial<Record<string, number>> {
  const mises: Partial<Record<string, number>> = {};
  const ajoute = (position: string, montant: number) => {
    if (montant > 0) mises[position] = (mises[position] ?? 0) + montant;
  };

  // Une bombe : pas de blindes, chacun pousse le même tas et on va directement au flop. C'est
  // bien une mise devant chaque siège, pas de l'argent mort — c'est tout le pot de départ.
  if (ctx.bombPot) {
    for (const p of positions) ajoute(p, ctx.bombAnte);
    return mises;
  }

  ajoute('SB', ctx.sb);
  ajoute('BB', ctx.bb);
  for (const s of straddlesAPoster(ctx)) ajoute(s.position, s.montant);
  return mises;
}

/**
 * Les sièges à dessiner à partir du seul contexte. `cartesHero` n'est fourni qu'à l'étape « tes
 * cartes » — à l'étape 1 elles ne sont pas encore choisies, et Hero montre donc un dos comme les
 * autres.
 */
export function siegesDeReglage(ctx: ContextData, cartesHero: Card[] = []): SiegeAffiche[] {
  const seats = buildSeats(
    ctx.numPlayers,
    ctx.heroPosition,
    ctx.effectiveStack,
    ctx.opponentNames,
    ctx.seatStacks,
    ctx.heroName
  );
  const mises = misesForcees(ctx, seats.map((s) => s.position));
  // L'ante par joueur est de l'argent mort : il quitte le tapis de tout le monde, mais il n'a rien
  // à faire dans le jeton posé « devant » un siège, qui dit le niveau de mise à suivre.
  const antePar = !ctx.bombPot && ctx.anteType === 'per-player' ? ctx.ante : 0;
  const anteBB = !ctx.bombPot && ctx.anteType === 'bb' ? ctx.bb : 0;

  return seats.map((seat) => {
    const engage = (mises[seat.position] ?? 0) + antePar + (seat.position === 'BB' ? anteBB : 0);
    return {
      seat: seat.isHero && cartesHero.length > 0 ? { ...seat, holeCards: cartesHero } : seat,
      stackRemaining: Math.max(seat.startingStack - engage, 0),
      currentBet: mises[seat.position],
      // Personne n'a la parole : la main n'a pas commencé. Le halo reste éteint, sinon il
      // désignerait un joueur qui n'a rien à décider.
      isActive: false,
    };
  });
}

/** Le pot de départ : tout ce qui est déjà sur le tapis avant la première décision. */
export function potDeReglage(ctx: ContextData): number {
  if (ctx.bombPot) return ctx.bombAnte * ctx.numPlayers;
  const positions = buildSeats(ctx.numPlayers, ctx.heroPosition, ctx.effectiveStack).map((s) => s.position);
  const forcees = Object.values(misesForcees(ctx, positions)).reduce<number>((a, b) => a + (b ?? 0), 0);
  const antes =
    ctx.anteType === 'per-player' ? ctx.ante * ctx.numPlayers : ctx.anteType === 'bb' ? ctx.bb : 0;
  return forcees + antes;
}

/**
 * LA TABLE D'UNE MAIN FINIE — étapes « abattage » et « publication ».
 * ──────────────────────────────────────────────────────────────────
 * Plus rien n'est en cours : tout ce qui a été misé est au pot, et chaque tapis en porte la trace.
 * Aucun jeton ne reste devant personne — c'est ce que montre une vraie table une fois le dernier
 * tour de mises ramassé.
 *
 * Deux écrans s'en servent et n'en font pas la même chose : l'abattage rend les cartes des
 * adversaires touchables (on les y saisit), la publication ne fait que montrer. La différence vit
 * chez eux ; ce qui est commun — qui est encore debout, avec quel tapis, sur quel board — vit ici.
 */
export function siegesDeFinDeMain(params: {
  seats: Seat[];
  actions: Action[];
  activeSeatIds: string[];
  heroCards: Card[];
  /** Mains adverses saisies à l'abattage, éventuellement partielles. */
  revealed: Record<string, (Card | undefined)[]>;
  /** Nombre de cartes fermées par joueur (2, 4 ou 5 selon la variante). */
  nbCartes: number;
}): SiegeAffiche[] {
  const { seats, actions, activeSeatIds, heroCards, revealed, nbCartes } = params;
  const engage = committedBySeat(actions);
  return seats.map((seat) => {
    const enJeu = activeSeatIds.includes(seat.id);
    const cartes: (Card | undefined)[] = seat.isHero
      ? heroCards
      : Array.from({ length: nbCartes }, (_, i) => (revealed[seat.id] ?? [])[i]);
    return {
      seat: { ...seat, holeCards: cartes as Card[] },
      folded: !enJeu,
      stackRemaining: Math.max(seat.startingStack - (engage[seat.id] ?? 0), 0),
    };
  });
}

/** Le pot d'une main finie : tout ce qui a été engagé par tout le monde. */
export function potDeFinDeMain(actions: Action[]): number {
  return Object.values(committedBySeat(actions)).reduce<number>((a, b) => a + b, 0);
}
