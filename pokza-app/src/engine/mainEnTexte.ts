import type { Card, Hand, Seat, Street } from '../types/poker';
import { formatChipAmount } from '../utils/chipFormat';
import { formatContextLine, type PartieDecrite } from '../utils/denomination';
import {
  computeHandState,
  describeAction,
  MECHANICAL_POSTS,
  straddleSeatLabel,
  totalReplaySteps,
} from './handEngine';

/**
 * LA MAIN EN TEXTE, à copier ailleurs.
 * ───────────────────────────────────
 * Une main de Pokza ne vit pas que dans Pokza : on la colle sur un forum, dans un Discord, dans un
 * message. C'est ce que produit ce module — le même coup, en phrases.
 *
 * Le déroulé n'est PAS réécrit ici : on rejoue la main pas à pas avec le moteur du replayer, et
 * chaque action est mise en mots par `describeAction`, celui-là même qui remplit la bulle d'action.
 * Le texte ne peut donc pas raconter autre chose que ce que le lecteur voit à l'écran — un second
 * narrateur aurait fini par diverger du premier, sur un straddle ou un all-in.
 *
 * Choix tranchés par Victor le 31/08/2026 :
 *   • cartes en LETTRES (`Ks 7d 2c`) et non en symboles — c'est la convention des hand histories
 *     online, elle passe partout, là où « ♠ » dépend du client qui l'affiche ;
 *   • les tapis de départ, les mains adverses connues et le résultat en font partie ;
 *   • chaque siège s'écrit `POSITION (Nom)` — « CO (Hero) », « HJ (Marc) » — et PARTOUT : dans les
 *     tapis comme dans les lignes d'action. À l'écran la table dit où chacun est assis ; un texte
 *     collé ailleurs n'a que ses lignes, et « Marc suit » n'y apprend pas où Marc était ;
 *   • les mises forcées ne s'écrivent pas. Poster la SB, la BB, un ante ou un straddle n'est pas
 *     une décision : la dénomination de l'en-tête les annonce déjà toutes (« 2/5€ », « 2/5/10€ »,
 *     « bomb pot 10€ »), et le pot de la street suivante les compte. C'est exactement
 *     `MECHANICAL_POSTS`, l'ensemble qui fait déjà démarrer le replayer après ces postages ;
 *   • le pot est rappelé à chaque street ;
 *   • VERBES EN ANGLAIS (`folds`, `checks`, `calls`, `bets`, `raises to`) : c'est la langue des
 *     hand histories, celle que lisent les endroits où l'on colle ce texte ;
 *   • en-tête = la dénomination de la partie (format, variante, blindes, devise) puis le lieu, le
 *     buy-in et le niveau. C'est exactement `formatContextLine`, la ligne déjà affichée sous le
 *     titre dans le feed : une seule source, et le texte dit la même chose que la carte ;
 *   • une SIGNATURE en dernière ligne (01/09/2026). Ce texte voyage là où Pokza n'est pas — c'est
 *     la seule ligne qui dise d'où il vient. En BAS : la première ligne est la dénomination, ce que
 *     le lecteur est venu chercher, et une accroche posée avant elle se lit comme un en-tête de
 *     spam sur un forum. Le bas est la place conventionnelle d'une signature, et il est lu juste
 *     après la chute.
 */

/**
 * La signature, en dernière ligne. Le NOM SEUL, sans adresse : choisi ainsi par Victor, une main
 * collée sur un forum n'a pas à ressembler à une réclame. Si une adresse devait s'y ajouter un
 * jour, l'écrire EN DUR et surtout pas via `webOrigin()` — cette fonction rend l'origine réelle,
 * donc `http://localhost:8081` pour tout texte copié depuis un serveur de développement.
 */
const SIGNATURE = 'Main partagée sur Pokza';

/**
 * Le texte scindé pour l'AFFICHAGE seulement : le déroulé d'un côté, la signature de l'autre, que
 * `MainEnTexteScreen` grise. Ce que l'on COPIE reste `mainEnTexte()` d'un seul tenant — une mise en
 * forme ne voyage pas dans un presse-papier, et le destinataire doit recevoir la ligne telle quelle.
 *
 * Découpe par recherche plutôt que par longueur : un décompte de caractères se serait décalé en
 * silence au premier changement de signature, et aurait tronché le déroulé sans rien casser de
 * visible ici.
 */
export function scinderSignature(texte: string): { corps: string; signature: string } {
  const i = texte.lastIndexOf(`\n${SIGNATURE}`);
  if (i === -1) return { corps: texte, signature: '' };
  // Le `\n` trouvé appartient au CORPS : c'est lui qui pose la ligne vide de séparation, et le
  // garder du côté gris ferait commencer la signature par un saut de ligne italique.
  return { corps: texte.slice(0, i + 1), signature: texte.slice(i + 1) };
}

const NOM_STREET: Record<Street, string> = {
  preflop: 'PRÉFLOP',
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
};

/** `{rank:'K', suit:'s'}` → `Ks`. Les deux champs portent déjà la bonne lettre. */
export function carteEnTexte(carte: Card): string {
  return `${carte.rank}${carte.suit}`;
}

export function cartesEnTexte(cartes: readonly Card[]): string {
  return cartes.map(carteEnTexte).join(' ');
}

/**
 * Le nom d'un siège dans le texte : sa POSITION, et entre parenthèses ce que la table écrirait sur
 * son badge — son nom de joueur, « Hero », ou « Straddle ». Volontairement différent de `seatLabel`,
 * qui REMPLACE la position par le nom : à l'écran on voit où chacun est assis, ici non.
 */
function etiquetteSiege(hand: Hand, seat: Seat): string {
  // La PLACE, et non `seat.position` : un straddle décale les positions de toute la table (cf.
  // `straddleAwarePositionLabel`), et le siège qui straddle s'appelle « Straddle ». Sans straddle,
  // cette fonction rend exactement la position.
  const place = straddleSeatLabel(hand.seats, hand.actions, seat.id) ?? seat.position;
  const nom = seat.playerName ?? (seat.isHero ? 'Hero' : undefined);
  return nom ? `${place} (${nom})` : place;
}

/** Une street et ce qui s'y est dit. Regroupées avant d'être écrites, pour pouvoir en sauter une. */
interface Section {
  street: Street;
  /** Le pot à l'ENTRÉE de la street, avant que quiconque y ait agi. */
  pot: number;
  lignes: string[];
}

export function mainEnTexte(partie: PartieDecrite): string {
  const { hand } = partie;
  const montant = (n: number) => formatChipAmount(n, hand.gameType, undefined, hand.currency);
  const etiquetteParId = (seatId: string) => {
    const seat = hand.seats.find((s) => s.id === seatId);
    return seat ? etiquetteSiege(hand, seat) : '';
  };
  const lignes: string[] = [formatContextLine(partie), ''];

  // Les tapis de départ, un par ligne, dans l'ordre des sièges. La main de Hero se pose au bout de
  // la sienne : c'est la seule connue d'emblée, et la chercher plus bas ferait relire le bloc.
  for (const seat of hand.seats) {
    const cartes = seat.isHero && seat.holeCards?.length ? ` — ${cartesEnTexte(seat.holeCards)}` : '';
    lignes.push(`${etiquetteSiege(hand, seat)} ${montant(seat.startingStack)}${cartes}`);
  }

  // Le déroulé, rejoué step par step avec le moteur du replayer (cf. l'en-tête de ce fichier).
  const total = totalReplaySteps(hand);
  const sections: Section[] = [];
  for (let step = 1; step <= total; step++) {
    const etat = computeHandState(hand, step);
    const event = etat.lastEvent;
    if (!event) continue;

    // Une street s'ouvre au premier événement qui l'occupe, `reveal` ou action : le préflop n'a pas
    // de révélation, et une main peut sauter une street sans y agir.
    let section = sections[sections.length - 1];
    if (!section || section.street !== etat.currentStreet) {
      section = { street: etat.currentStreet, pot: etat.potTotal, lignes: [] };
      sections.push(section);
    }

    if (event.kind === 'action' && !MECHANICAL_POSTS.has(event.action.type)) {
      // Même règle d'all-in que la bulle du replayer : un siège à tapis, sur une action qui a pu
      // l'y mettre (ni fold ni check).
      const isAllIn =
        etat.lastAction !== null &&
        etat.allInSeatIds.has(etat.lastAction.seatId) &&
        etat.lastAction.type !== 'fold' &&
        etat.lastAction.type !== 'check';
      section.lignes.push(
        describeAction(hand, event.action, { isAllIn, etiquette: etiquetteParId, langue: 'en' })
      );
    }
  }

  for (const section of sections) {
    // Un préflop vide se saute : sans les mises forcées, un bomb pot n'y a plus rien à dire. Les
    // autres streets s'écrivent toujours — même sans une action, elles portent les cartes qui
    // tombent, et les taire perdrait le board d'un run-out.
    if (section.street === 'preflop' && section.lignes.length === 0) continue;
    lignes.push('', enTeteDeStreet(hand, section.street, section.pot, montant), ...section.lignes);
  }

  // L'abattage : les mains adverses saisies par l'auteur. Hero n'y est pas, la sienne est en haut.
  const montrees = hand.seats.filter((s) => !s.isHero && s.holeCards?.length);
  if (montrees.length > 0) {
    lignes.push('', 'ABATTAGE');
    for (const seat of montrees) {
      lignes.push(`${etiquetteSiege(hand, seat)} : ${cartesEnTexte(seat.holeCards!)}`);
    }
  }

  lignes.push('', ...conclusion(hand, montant));
  // Le `trimEnd` avant la signature, et non après : une main arrêtée par son auteur peut n'avoir
  // aucune conclusion à écrire, et sans lui la signature se retrouverait à deux lignes vides du
  // déroulé. Elle en garde exactement une, quoi qu'il précède.
  return `${lignes.join('\n').trimEnd()}\n\n${SIGNATURE}\n`;
}

/** « FLOP  Ks 7d 2c  (pot 137€) » — les cartes qui VIENNENT de tomber, pas le board entier. */
function enTeteDeStreet(
  hand: Hand,
  street: Street,
  pot: number,
  montant: (n: number) => string
): string {
  // Le préflop n'a ni carte ni pot à annoncer : le pot y vaut zéro par construction, puisque les
  // mises forcées sont les seules à le remplir avant la première décision.
  if (street === 'preflop') return NOM_STREET.preflop;

  const tombees = (board: Hand['board'] | undefined): Card[] => {
    if (!board) return [];
    if (street === 'flop') return board.flop ? [...board.flop] : [];
    if (street === 'turn') return board.turn ? [board.turn] : [];
    return board.river ? [board.river] : [];
  };
  const un = tombees(hand.board);
  const deux = tombees(hand.board2);
  // Double board (bomb pot) : les deux boards sur la même ligne, séparés par une barre — ils
  // tombent dans le même souffle et se lisent ensemble.
  const cartes = [un, deux].filter((c) => c.length > 0).map(cartesEnTexte).join('  |  ');
  return `${NOM_STREET[street]}  ${cartes}  (pot ${montant(pot)})`;
}

/** Qui gagne, et combien — ou pourquoi personne ne gagne. */
function conclusion(hand: Hand, montant: (n: number) => string): string[] {
  const fin = computeHandState(hand, totalReplaySteps(hand));

  // Main arrêtée par son auteur : il n'y a pas de vainqueur à annoncer, seulement la question
  // posée. Même phrase que la bulle du replayer, pour que le texte finisse comme la lecture.
  if (hand.stoppedAtSeatId) {
    const seat = hand.seats.find((s) => s.id === hand.stoppedAtSeatId);
    return seat
      ? [`La main s'arrête ici — à ${etiquetteSiege(hand, seat)} de jouer.`]
      : ["La main s'arrête ici."];
  }

  if (fin.potAwards.length === 0) return [];
  return fin.potAwards.map((part) => {
    const seat = hand.seats.find((s) => s.id === part.seatId);
    const nom = seat ? etiquetteSiege(hand, seat) : '';
    return `${nom} gagne ${montant(fin.potTotal * part.fraction)}`;
  });
}
