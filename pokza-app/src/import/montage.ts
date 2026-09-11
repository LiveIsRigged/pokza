import type { Action, ActionType, Board, Card, Hand, Position, Seat, Street, Variant } from '../types/poker';
import { holeCardCount } from '../types/poker';
import { POSITION_SETS, buildSeats } from '../creator/positions';
import { roundMoney } from '../utils/chipFormat';
import { normaliserBuyIn } from '../utils/buyIn';
import {
  BUY_IN_MAX_LENGTH, LOCATION_MAX_LENGTH, TOURNAMENT_NAME_MAX_LENGTH,
} from '../constants/limits';
import { refuser, type MainLue } from './formeNeutre';
import { t } from '../i18n/traduire';

/**
 * LE MONTAGE — TOUTE LA LOGIQUE DURE, UNE SEULE FOIS.
 * ═════════════════════════════════════════════════
 * Un dialecte ne sait que lire son texte. C'est ici que la main devient une main de Pokza :
 * les positions se déduisent du bouton, les sièges reçoivent leurs identifiants déterministes,
 * les montants passent de la convention du fichier à celle du modèle, les cartes montrées
 * atterrissent sur les bons sièges.
 *
 * C'est la seule façon d'ajouter une salle pour ~60 lignes : rien de ce qui suit ne se réécrit.
 *
 * ═══ LES QUATRE PIÈGES, TOUS MESURÉS ═══
 * 1. `Action.amount` EST LE TOTAL MISÉ SUR LA STREET, pas l'incrément (cf. `handleCall`). Or les
 *    deux salles mesurées écrivent les suivis en incrément. La conversion est ici, et nulle part
 *    ailleurs.
 * 2. LES BLINDES NE SE LISENT JAMAIS DANS L'EN-TÊTE. `Holdem no limit (160/700/1400)` chez
 *    Winamax, c'est ante/SB/BB — quand Pokza écrit « 5/10/25 » pour un STRADDLE. Les mises
 *    forcées ne viennent que des lignes qui les NOMMENT.
 * 3. `POSITION_SETS` inclut toujours SB dès 3 joueurs : une main sans petite blinde postée
 *    (siège levé, blinde morte) donnerait « SB » à un joueur qui n'a rien posté → refus.
 * 4. LES JETONS DE TOURNOI NE SONT PAS DE L'ARGENT. `Hand.currency` reste absente en tournoi,
 *    même quand le fichier colle des `€` sur les tapis (Betclic le fait).
 */

/** Ce que `postToSeed` lit d'un post — la forme exacte que le montage doit produire. */
export interface MontageDeMain {
  hand: Hand;
  location?: string;
  tournamentName?: string;
  buyIn?: string;
  level?: string;
  /** Nom écrit dans le fichier → identifiant du siège Pokza. La vérification s'en sert pour
   *  confronter le résumé (qui parle en noms) à la main montée (qui parle en sièges). */
  siegeParNom: Map<string, string>;
  /** Nom écrit dans le fichier → position Pokza. Le contrôle nº 2 confronte ce placement aux
   *  témoins que chaque dialecte offre gratuitement (blindes nommées, ordre de parole). */
  positionParNom: Map<string, Position>;
  /** Ce que le montage a dû laisser tomber — jamais bloquant, mais à dire à l'auteur. */
  avertissements: string[];
}

/** Les variantes que Pokza sait jouer, telles que les fichiers les écrivent. Tout le reste est un
 *  refus : le stud et le draw n'ont pas de modèle, et le limit n'a pas de structure de mises. */
const VARIANTES: Record<string, Variant> = {
  holdemnolimit: 'nlhe',
  texasholdemnl: 'nlhe',
};

function lireVariante(ecrite: string): Variant {
  const clef = ecrite.toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = VARIANTES[clef];
  if (!v) refuser('variante-non-prise-en-charge', t('diag.variante_non_prise', { ecrite }));
  return v!;
}

/**
 * L'ANNEAU DES POSITIONS, DANS LE SENS DE LA TABLE, EN PARTANT DU BOUTON.
 *
 * `POSITION_SETS[n]` liste les positions dans l'ordre de parole PRÉFLOP (UTG d'abord). L'anneau
 * physique, lui, part du bouton : BTN, SB, BB, UTG, … Une rotation suffit à passer de l'un à
 * l'autre, et c'est exactement ce dont on a besoin — un fichier donne des NUMÉROS DE SIÈGE
 * croissants dans le sens de la table, plus lequel porte le bouton.
 *
 * Vérifié sur les 6 mains du corpus, y compris le heads-up implicite (`POSITION_SETS[2]` n'a pas
 * de siège SB : à deux, le bouton EST la petite blinde).
 */
function anneauDepuisLeBouton(nombreDeJoueurs: number): Position[] {
  const ordre = POSITION_SETS[nombreDeJoueurs];
  if (!ordre) refuser('trop-de-joueurs', t('diag.trop_de_joueurs', { n: nombreDeJoueurs }));
  const i = ordre!.indexOf('BTN');
  return [...ordre!.slice(i), ...ordre!.slice(0, i)];
}

export function monter(main: MainLue): MontageDeMain {
  // Ceux du DIALECTE d'abord (ce que sa notation ne dit pas), puis ceux du montage (ce qu'il a dû
  // laisser tomber) — dans cet ordre, parce qu'une propriété du format se lit avant un détail de
  // champ.
  const avertissements: string[] = [...(main.avertissements ?? [])];
  const variant = lireVariante(main.variante);
  const enTournoi = main.typePartie === 'tournoi';

  // ─── Les sièges ─────────────────────────────────────────────────────────────────────────────
  const nombre = main.sieges.length;
  if (nombre < 2) refuser('pas-assez-de-joueurs', t('diag.joueurs_a_table', { n: nombre }));
  const anneau = anneauDepuisLeBouton(nombre);

  const noms = main.sieges.map((s) => s.nom);
  if (new Set(noms).size !== noms.length) {
    refuser('noms-en-double', t('diag.noms_en_double'));
  }

  // Les numéros de siège croissent dans le sens de la table : trier puis faire tourner jusqu'au
  // bouton donne l'anneau réel, quels que soient les trous (Betclic distribue 1/3/5/7/9).
  const parNumero = [...main.sieges].sort((a, b) => a.numero - b.numero);
  const rangBouton = parNumero.findIndex((s) => s.numero === main.siegeBouton);
  if (rangBouton < 0) {
    refuser('bouton-introuvable', t('diag.siege_bouton_absent', { siege: main.siegeBouton }));
  }
  const depuisBouton = [...parNumero.slice(rangBouton), ...parNumero.slice(0, rangBouton)];

  const positionParNom = new Map<string, Position>();
  const tapisParPosition: Partial<Record<Position, number>> = {};
  depuisBouton.forEach((siege, i) => {
    positionParNom.set(siege.nom, anneau[i]);
    tapisParPosition[anneau[i]] = siege.tapis;
  });

  // ─── Le héros ───────────────────────────────────────────────────────────────────────────────
  // Le modèle de Pokza a TOUJOURS exactement un héros (`Seat.isHero`) : sans lui, la main n'a pas
  // de point de vue, et le replayer n'aurait personne à désigner.
  if (!main.hero) refuser('hero-introuvable', t('diag.aucune_carte_montree'));
  const heroPosition = positionParNom.get(main.hero!.nom);
  if (!heroPosition) {
    refuser('hero-introuvable', t('diag.hero_absent', { nom: main.hero!.nom }));
  }

  // ⚠️ AUCUN NOM NE SORT DU FICHIER, HÉROS COMPRIS — tranché par Victor le 04/09/2026 :
  // « garde "Hero" comme sur les mains de live ». Les pseudos des adversaires n'étaient déjà pas
  // importés (décision nº 1) et se tapent ensuite en remontant dans les étapes — c'est gratuit,
  // cf. `invalidation.ts` : un nom se corrige sans rien perdre. Le héros suit la même règle, ce
  // qui la fait tenir en une phrase et aligne une main collée sur une main live. Une table
  // incognito n'en donnait de toute façon qu'un masque (« Grande pile »), là où l'acronyme de
  // position en dit plus.
  //
  // LE PLUS PETIT TAPIS FAIT LE STACK EFFECTIF (décision nº 5 du 04/09, maintenue le 04/09 après
  // vérification). Un contre-exemple existe — sur la main Betclic à abattage, le plus petit tapis
  // est celui d'un joueur qui se couche au bouton (95,75 €) alors que le stack effectif réel est
  // 202,75 € — et il est SANS CONSÉQUENCE : tous les tapis sont lus individuellement,
  // `postToSeed` les remet un par un dans `seatStacks`, et `effectiveStack` n'est lu NULLE PART
  // hors du créateur (ni la ligne de contexte, ni le replayer, qui lit le `startingStack` de
  // chaque siège). Il ne reste que le nombre affiché dans le champ « Stack effectif » de l'étape 1
  // et le tapis proposé aux sièges vides. Ne pas rouvrir la question sans une raison nouvelle.
  const effectiveStack = Math.min(...main.sieges.map((s) => s.tapis));
  const seats = buildSeats(nombre, heroPosition!, effectiveStack, undefined, tapisParPosition);
  const siegeParNom = new Map<string, string>();
  for (const [nom, position] of positionParNom) {
    const siege = seats.find((s) => s.position === position);
    if (siege) siegeParNom.set(nom, siege.id);
  }
  const idDe = (nom: string): string => {
    const id = siegeParNom.get(nom);
    if (!id) refuser('joueur-inconnu', t('diag.joueur_absent', { nom }));
    return id!;
  };

  // ─── Les mises forcées ──────────────────────────────────────────────────────────────────────
  const antes = main.misesForcees.filter((m) => m.genre === 'ante');
  const petites = main.misesForcees.filter((m) => m.genre === 'sb');
  const grosses = main.misesForcees.filter((m) => m.genre === 'bb');
  /**
   * LE STRADDLE — LU DEPUIS UN FICHIER DEPUIS LE 05/09/2026, ET SEULEMENT DANS LA FORME QUE POKZA
   * SAIT DIRE.
   *
   * Le straddle de Pokza n'existe qu'en CHAÎNE CONTIGUË à partir du premier parleur, le bouton
   * pouvant en être le dernier maillon (cf. `straddle.ts` et la décision du 29/08). Un fichier peut
   * écrire n'importe quoi ; on vérifie donc la contiguïté ICI, et on refuse tout le reste — un
   * straddle placé ailleurs se relirait de travers en remontant dans le formulaire, qui n'a aucun
   * moyen de le représenter.
   *
   * Mesuré sur une vraie main (10 joueurs, blindes 2/4, `post TB 8` par le premier parleur) : un
   * straddle simple à deux fois la grosse blinde, exactement en tête de chaîne.
   */
  const straddles = main.misesForcees.filter((m) => m.genre === 'straddle');
  if (straddles.length > 0) {
    const ordreParole = POSITION_SETS[nombre] ?? [];
    const rangs = straddles.map((m) => ordreParole.indexOf(positionParNom.get(m.nom) as Position));
    const attendus = straddles.map((_, i) => i);
    const chaine = rangs.every((r, i) => r === attendus[i]);
    // Le dernier maillon peut être le BOUTON au lieu de la suite de la chaîne — c'est le seul écart
    // que le formulaire sait produire, et il ne vaut que si la chaîne qui précède est complète.
    const auBouton = rangs.length > 1
      && rangs.slice(0, -1).every((r, i) => r === i)
      && positionParNom.get(straddles[rangs.length - 1].nom) === 'BTN';
    if (!chaine && !auBouton) {
      refuser('mise-forcee-inconnue',
        t('diag.straddle_hors_chaine', { positions: straddles.map((m) => positionParNom.get(m.nom)).join(', ') }));
    }
    if (straddles.length > 3) {
      refuser('mise-forcee-inconnue', t('diag.trop_de_straddles', { n: straddles.length }));
    }
    if (enTournoi) {
      // `straddlePossible` l'interdit en tournoi : le formulaire ne pourrait pas relire la main.
      refuser('mise-forcee-inconnue', t('diag.straddle_en_tournoi'));
    }
  }
  if (petites.length > 1 || grosses.length > 1) {
    refuser('mise-forcee-inconnue', t('diag.blinde_en_double'));
  }
  if (grosses.length === 0) refuser('mise-forcee-inconnue', t('diag.aucune_grosse_blinde'));
  // ⚠️ PIÈGE Nº 3 : dès 3 joueurs, `POSITION_SETS` a toujours un siège SB. Sans petite blinde
  // postée, ce siège existerait sans que personne n'y ait rien mis.
  if (petites.length === 0 && nombre >= 3) {
    refuser('sans-petite-blinde', t('diag.aucune_petite_blinde'));
  }

  const actions: Action[] = [];
  let ordre = 0;
  const poser = (id: string, seatId: string, type: ActionType, amount?: number) => {
    actions.push({ id, street: 'preflop', seatId, type, amount, order: ++ordre });
  };

  // L'ORDRE DE POSTAGE EST CELUI DU FORMULAIRE (cf. `LiveHandCreator`) : les antes par joueur
  // d'abord, puis SB, puis BB, puis l'ante de BB. Une main importée s'ouvre ainsi exactement
  // comme une main saisie à la main — et se relit pareil (`postToSeed` distingue « ante de BB » et
  // « ante par joueur » au seul NOMBRE de `post-ante`).
  const anteDeBB = antes.length === 1 && antes[0].nom === grosses[0].nom;
  if (!anteDeBB) {
    // Rangés dans l'ordre de l'anneau plutôt que dans celui du fichier : Winamax les écrit dans
    // un ordre ni de sièges ni de parole, et ça n'a aucune importance — autant que la main
    // s'ouvre dans un ordre lisible.
    for (const siege of depuisBouton) {
      const ante = antes.find((a) => a.nom === siege.nom);
      if (ante) poser(`ante-${idDe(ante.nom)}`, idDe(ante.nom), 'post-ante', ante.montant);
    }
  }
  if (petites[0]) poser('blind-sb', idDe(petites[0].nom), 'post-sb', petites[0].montant);
  poser('blind-bb', idDe(grosses[0].nom), 'post-bb', grosses[0].montant);
  if (anteDeBB) poser('ante-bb', idDe(antes[0].nom), 'post-ante', antes[0].montant);
  // Les straddles se postent APRÈS les blindes, dans l'ordre du fichier — et cet ordre n'est pas
  // cosmétique : c'est le dernier straddleur qui fixe le point de reprise de la parole
  // (cf. `straddlesAPoster`).
  for (const s of straddles) poser(`straddle-${idDe(s.nom)}`, idDe(s.nom), 'post-straddle', s.montant);

  // ─── Les actions volontaires ────────────────────────────────────────────────────────────────
  // ⚠️ PIÈGE Nº 1, ET IL EST ICI : on tient la mise COURANTE de chaque siège sur la street, et
  // c'est elle qui transforme un incrément de fichier en total de street. Les antes n'y entrent
  // PAS — un ante est une mise forcée indépendante, il ne compte pas dans ce qu'il faut suivre
  // (cf. `committedBySeat`, qui les additionne à part pour cette raison exacte).
  const misesDeStreet: Record<string, number> = {};
  if (petites[0]) misesDeStreet[idDe(petites[0].nom)] = petites[0].montant;
  misesDeStreet[idDe(grosses[0].nom)] = grosses[0].montant;
  // Un straddle est une mise VIVE : c'est lui qui devient le montant à suivre.
  for (const s of straddles) misesDeStreet[idDe(s.nom)] = s.montant;

  const RUES: Street[] = ['preflop', 'flop', 'turn', 'river'];
  for (const rue of RUES) {
    if (rue !== 'preflop') for (const clef of Object.keys(misesDeStreet)) delete misesDeStreet[clef];
    for (const lue of main.actions.filter((a) => a.rue === rue)) {
      const seatId = idDe(lue.nom);
      const dejaMis = misesDeStreet[seatId] ?? 0;
      const maximum = Math.max(0, ...Object.values(misesDeStreet));

      if (lue.genre === 'fold' || lue.genre === 'check') {
        actions.push({ id: `${rue}-${ordre + 1}`, street: rue, seatId, type: lue.genre,
                       amount: undefined, order: ++ordre });
        continue;
      }
      if (lue.montant == null) refuser('ligne-incomprise', t('diag.action_sans_montant', { genre: lue.genre }));
      const total = roundMoney(lue.montantEst === 'increment' ? dejaMis + lue.montant! : lue.montant!);

      // Le texte a dit « à tapis » sans dire suivre ni relancer : c'est le total obtenu qui
      // tranche. Pokza n'a pas de type « tapis » — il se déduit de l'épuisement du tapis.
      const type: ActionType =
        lue.genre === 'tapis' ? (total > maximum ? 'raise' : 'call') : lue.genre;

      actions.push({ id: `${rue}-${ordre + 1}`, street: rue, seatId, type, amount: total,
                     order: ++ordre });
      misesDeStreet[seatId] = total;
    }
  }

  // ─── Le board ───────────────────────────────────────────────────────────────────────────────
  const b = main.board;
  if (![0, 3, 4, 5].includes(b.length)) {
    refuser('ligne-incomprise', t('diag.trop_de_cartes_board', { n: b.length }));
  }
  const board: Board = {
    ...(b.length >= 3 ? { flop: [b[0], b[1], b[2]] as [Card, Card, Card] } : {}),
    ...(b.length >= 4 ? { turn: b[3] } : {}),
    ...(b.length >= 5 ? { river: b[4] } : {}),
  };

  // ─── Les cartes ─────────────────────────────────────────────────────────────────────────────
  const combien = holeCardCount(variant);
  const cartesParSiege = new Map<string, Card[]>();
  if (main.hero!.cartes.length === combien) {
    cartesParSiege.set(idDe(main.hero!.nom), main.hero!.cartes);
  }
  for (const montre of main.abattage) {
    // Une main partielle n'est pas évaluable : on la traite comme mucké, exactement comme le
    // formulaire (cf. `construitMain`).
    if (montre.cartes.length === combien) cartesParSiege.set(idDe(montre.nom), montre.cartes);
  }
  const seatsAvecCartes: Seat[] = seats.map((s) => {
    const cartes = cartesParSiege.get(s.id);
    return cartes ? { ...s, holeCards: cartes } : s;
  });

  // ─── Le contexte du post ────────────────────────────────────────────────────────────────────
  let location = main.salle;
  if (location && location.length > LOCATION_MAX_LENGTH) location = undefined;

  let tournamentName: string | undefined;
  if (enTournoi && main.nomTournoi) {
    tournamentName = main.nomTournoi.slice(0, TOURNAMENT_NAME_MAX_LENGTH);
    if (tournamentName.length < main.nomTournoi.length) {
      avertissements.push(t('diag.nom_tournoi_raccourci', { n: TOURNAMENT_NAME_MAX_LENGTH }));
    }
  }

  let buyIn: string | undefined;
  if (enTournoi && main.buyIn) {
    // La même fonction que le champ du formulaire au blur : « 45€ + 5€ » → « 50€ ». Une main
    // collée et une main saisie s'écrivent donc pareil.
    const somme = normaliserBuyIn(main.buyIn);
    // Un PRIX ne se tronque pas : « 1000€ » coupé donnerait « 100€ », c'est-à-dire un faux. Trop
    // long, il est abandonné — l'auteur peut le retaper.
    if (somme.length <= BUY_IN_MAX_LENGTH) buyIn = somme;
    else avertissements.push(t('diag.buy_in_trop_long'));
  }

  const hand: Hand = {
    id: `hand-${Date.now()}`,
    variant,
    gameType: enTournoi ? 'tournament' : 'cash',
    blinds: {
      sb: petites[0]?.montant ?? 0,
      bb: grosses[0].montant,
      // `postToSeed` relit le TYPE d'ante au seul nombre de `post-ante` ; ici on ne garde que le
      // montant, comme le formulaire.
      ante: antes.length > 0 ? antes[0].montant : undefined,
    },
    effectiveStack,
    visibility: 'public',
    seats: seatsAvecCartes,
    board,
    actions,
    // ⚠️ PIÈGE Nº 4 : en tournoi les jetons ne sont pas de l'argent réel, et rien ne les habille —
    // même quand le fichier colle des `€` dessus.
    currency: enTournoi ? undefined : main.devise,
    // Le défaut du formulaire depuis le 01/09 : les mains adverses restent cachées jusqu'à
    // l'abattage. Une main importée s'aligne dessus plutôt que d'inventer un troisième défaut.
    revealShowdown: true,
    // LA MARQUE DE PROVENANCE (cf. `Hand.imported`). C'est la seule chose que l'import écrit dans
    // la main en plus de son contenu — et elle ne s'affiche pas ici : `lieuEtProvenance` la
    // compose avec le lieu au moment du rendu, ce qui laisse la salle corrigible et la provenance
    // non.
    imported: true,
  };

  return {
    hand,
    location,
    tournamentName,
    buyIn,
    // Ce qui est STOCKÉ est la chaîne complète, pas le seul nombre (cf. `LevelNumberInput`).
    level: enTournoi && main.niveau ? t('import.niveau', { n: main.niveau }) : undefined,
    siegeParNom,
    positionParNom,
    avertissements,
  };
}
