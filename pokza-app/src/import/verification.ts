import type { Action, Card, Hand, Position, Seat, Street } from '../types/poker';
import { committedBySeat, determinePotAwards } from '../engine/handEngine';
import { POSITION_SETS } from '../creator/positions';
import { roundMoney } from '../utils/chipFormat';
import type { MainLue } from './formeNeutre';
import type { MontageDeMain } from './montage';

/**
 * LA VÉRIFICATION PAR REJEU — LE CŒUR DU CHANTIER.
 * ═══════════════════════════════════════════════
 * Une hand history ANNONCE SON PROPRE RÉSULTAT : le pot, le rake, les gagnants. On rejoue donc la
 * main reconstruite dans le moteur de Pokza et on compare. Deux conséquences décisives :
 *
 *   • on peut TENTER une lecture sur un format jamais vu, puisqu'une lecture fausse est détectée
 *     et jamais publiée → la couverture devient une propriété par MAIN, pas par site ;
 *   • chaque vraie main est un test SANS ATTENDU À RÉDIGER → 500 mains brutes = 500 tests.
 *
 * ⚠️⚠️ CE QUE LES CONTRÔLES NE FONT PAS, ET IL FAUT LE SAVOIR : ils vérifient la COHÉRENCE INTERNE
 * d'une lecture, pas son SENS. Mesuré le 04/09 sur un tournoi Betclic, qui écrit des `€` sur des
 * jetons : lu comme un cash game à 10/20 €, tout est cohérent et LES SIX CONTRÔLES PASSENT. C'est
 * pour ça que le type de partie se lit dans l'en-tête, AVANT les montants, et jamais ici.
 *
 * Le contrôle nº 5 (clôture des tours) est le plus précieux : il ne demande AUCUN résumé, donc il
 * marche sur tous les formats, y compris ceux qui n'annoncent rien. Et il attrape ce que le pot ne
 * peut pas attraper — sur la 1re main Betclic, deux lectures des montants donnent le MÊME pot (le
 * non suivi absorbe l'écart) ; seule la clôture les sépare.
 */

export interface Controle {
  numero: number;
  nom: string;
  ok: boolean;
  /** Ce qui cloche, ou « sans témoin » quand le fichier n'annonce pas de quoi juger. */
  detail?: string;
  /** Faux quand le fichier ne fournit pas le témoin nécessaire : le contrôle n'a rien pu prouver.
   *  Un contrôle sans témoin ne fait pas échouer l'import, mais il ne le garantit pas non plus. */
  temoin: boolean;
}

/** Un demi-centime : les montants d'argent sont écrits à deux décimales, les jetons sont entiers. */
const EPSILON = 0.005;
const proche = (a: number, b: number) => Math.abs(a - b) < EPSILON;

const RUES: Street[] = ['preflop', 'flop', 'turn', 'river'];

/** La mise NON SUIVIE, DÉRIVÉE — aucun des deux dialectes mesurés n'écrit de ligne « uncalled bet
 *  returned » (PokerStars si). C'est la tranche du dessus : ce que le plus gros engagement dépasse
 *  le deuxième, rendu à son seul alimentateur. Deux joueurs à égalité au sommet = rien de rendu. */
export function miseNonSuivie(engage: Record<string, number>): number {
  const montants = Object.values(engage).sort((a, b) => b - a);
  if (montants.length < 2) return montants[0] ?? 0;
  return montants[0] > montants[1] ? roundMoney(montants[0] - montants[1]) : 0;
}

/** L'état de chaque siège à un instant du rejeu. */
interface Etat {
  couche: Set<string>;
  aTapis: Set<string>;
  cumul: Record<string, number>;
}

function tapisDe(seats: Seat[]): Record<string, number> {
  return Object.fromEntries(seats.map((s) => [s.id, s.startingStack]));
}

/**
 * NOMMER UN SIÈGE PAR SA POSITION, jamais par son identifiant interne.
 *
 * Ces messages sont lus deux fois : par un test en ligne de commande, et par l'AUTEUR quand une
 * main est refusée à l'écran. « s-bb suit 15 pour une mise de 20 » ne parle à personne dans le
 * second cas, alors que « BB » est le vocabulaire que le produit affiche partout ailleurs. Le
 * repli sur l'identifiant ne devrait jamais servir — il est là pour ne pas rendre un message vide
 * si un jour une action désignait un siège absent.
 */
function etiquettes(hand: Hand): (seatId: string) => string {
  const parId = new Map(hand.seats.map((s) => [s.id, s.position as string]));
  return (seatId) => parId.get(seatId) ?? seatId;
}

export function verifier(main: MainLue, montage: MontageDeMain): Controle[] {
  const { hand } = montage;
  return [
    controleStructure(main, hand),
    controlePositions(main, montage),
    ...controleRejeu(hand),
    controlePot(main, montage),
  ];
}

// ─── 1. Structure ──────────────────────────────────────────────────────────────────────────────

/** Aucune carte ne peut être distribuée deux fois, et le board du résumé — quand le dialecte en a
 *  un — doit tomber d'accord avec l'assemblage street par street. */
function controleStructure(main: MainLue, hand: Hand): Controle {
  const nom = 'structure et cartes';
  const toutes: Card[] = [
    ...(hand.board.flop ?? []), ...(hand.board.turn ? [hand.board.turn] : []),
    ...(hand.board.river ? [hand.board.river] : []),
    ...hand.seats.flatMap((s) => s.holeCards ?? []),
  ];
  const vues = new Set(toutes.map((c) => `${c.rank}${c.suit}`));
  if (vues.size !== toutes.length) {
    return { numero: 1, nom, ok: false, temoin: true, detail: 'une carte est distribuée deux fois' };
  }

  // Une street qui a des actions doit avoir ses cartes : sans ça on rejouerait un turn à l'aveugle.
  const manque = RUES.filter((rue) => rue !== 'preflop')
    .filter((rue) => hand.actions.some((a) => a.street === rue))
    .find((rue) => (rue === 'flop' && !hand.board.flop)
                || (rue === 'turn' && !hand.board.turn)
                || (rue === 'river' && !hand.board.river));
  if (manque) {
    return { numero: 1, nom, ok: false, temoin: true, detail: `des actions au ${manque} sans carte` };
  }

  /**
   * ⚠️ ET LA RÉCIPROQUE — une street dont la CARTE EST DISTRIBUÉE doit avoir eu de l'action.
   *
   * Trouvé le 05/09/2026 sur une main d'outil de suivi : `*** RIVER ***` annoncé, la cinquième
   * carte dans le board, et RIEN dessous — l'auteur avait cessé d'enregistrer. Lue telle quelle,
   * la main publiait une river que personne n'a jouée, puis le pot attribué : une séquence qui NE
   * PEUT PAS avoir eu lieu, et qu'aucun autre contrôle ne voyait (le pot, lui, tombait juste).
   *
   * L'EXEMPTION EST LA SEULE LÉGITIME, et elle est fréquente : quand tous ceux qui restent sont à
   * TAPIS, les cartes suivantes tombent sans que personne n'ait à parler. Un seul joueur encore
   * capable d'agir suffit aussi (il n'a rien à suivre). Au-delà, le silence est une troncature.
   *
   * Vérifié : la main GGPoker à tapis et la main PMU à pots secondaires distribuent toutes deux
   * turn ET river sans une action, et restent vertes.
   */
  const engage = committedBySeat(hand.actions);
  const couches = new Set(hand.actions.filter((a) => a.type === 'fold').map((a) => a.seatId));
  const capables = hand.seats.filter(
    (s) => !couches.has(s.id) && (engage[s.id] ?? 0) < s.startingStack - EPSILON
  );
  const carteDe: Record<string, boolean> = {
    flop: Boolean(hand.board.flop), turn: Boolean(hand.board.turn), river: Boolean(hand.board.river),
  };
  const muette = RUES.filter((rue) => rue !== 'preflop')
    .find((rue) => carteDe[rue]
      && !hand.actions.some((a) => a.street === rue && !a.type.startsWith('post-'))
      && capables.length > 1);
  if (muette) {
    return {
      numero: 1, nom, ok: false, temoin: true,
      detail: `${muette} distribué sans aucune action, et ${capables.length} joueurs pouvaient encore agir`
        + ' — le texte est tronqué',
    };
  }

  if (!main.boardResume) {
    return { numero: 1, nom, ok: true, temoin: false, detail: 'aucun board de résumé' };
  }
  const assemble = [...(hand.board.flop ?? []), ...(hand.board.turn ? [hand.board.turn] : []),
                    ...(hand.board.river ? [hand.board.river] : [])];
  const ecrire = (cs: Card[]) => cs.map((c) => `${c.rank}${c.suit}`).join(' ');
  const ok = ecrire(assemble) === ecrire(main.boardResume);
  return {
    numero: 1, nom, ok, temoin: true,
    detail: ok ? undefined : `board assemblé « ${ecrire(assemble)} » ≠ résumé « ${ecrire(main.boardResume)} »`,
  };
}

// ─── 2. Positions ──────────────────────────────────────────────────────────────────────────────

/**
 * TOUT LE PLACEMENT DÉPEND D'UNE SEULE DONNÉE — QUEL SIÈGE PORTE LE BOUTON — ET RIEN D'AUTRE NE LA
 * DIT. D'où trois contre-épreuves, dont deux gratuites :
 *   • universelle : celui qui poste la petite blinde DOIT être en SB (au bouton à deux joueurs),
 *     celui qui poste la grosse en BB. Ça vaut pour tous les dialectes, mesurés ou non ;
 *   • `blindes-nommees` (Winamax) : le résumé annote les blindes ;
 *   • `ordre-de-parole` (Betclic) : le bloc des sièges est écrit dans l'ordre de parole préflop.
 */
function controlePositions(main: MainLue, montage: MontageDeMain): Controle {
  const nom = 'placement des positions';
  const { positionParNom } = montage;
  const aDeux = montage.hand.seats.length === 2;
  const ko = (detail: string): Controle => ({ numero: 2, nom, ok: false, temoin: true, detail });

  const attendue = (genre: 'sb' | 'bb'): Position => (genre === 'sb' && aDeux ? 'BTN' : genre === 'sb' ? 'SB' : 'BB');
  for (const genre of ['sb', 'bb'] as const) {
    const poste = main.misesForcees.find((m) => m.genre === genre);
    if (!poste) continue;
    const reelle = positionParNom.get(poste.nom);
    if (reelle !== attendue(genre)) {
      return ko(`« ${poste.nom} » poste la ${genre === 'sb' ? 'petite' : 'grosse'} blinde en ${reelle} et non en ${attendue(genre)}`);
    }
  }

  const t = main.temoinPositions;
  if (!t) return { numero: 2, nom, ok: true, temoin: true };

  if (t.genre === 'blindes-nommees') {
    if (t.sb && positionParNom.get(t.sb) !== attendue('sb')) {
      return ko(`le résumé nomme « ${t.sb} » petite blinde, le montage le place en ${positionParNom.get(t.sb)}`);
    }
    if (t.bb && positionParNom.get(t.bb) !== 'BB') {
      return ko(`le résumé nomme « ${t.bb} » grosse blinde, le montage le place en ${positionParNom.get(t.bb)}`);
    }
    return { numero: 2, nom, ok: true, temoin: Boolean(t.sb || t.bb) };
  }

  // Le fichier écrit ses sièges dans l'ordre de parole préflop : la liste des positions qu'on en
  // déduit doit donc être exactement `POSITION_SETS[n]`.
  const ordre = main.sieges.map((s) => positionParNom.get(s.nom));
  const attendu = POSITION_SETS[main.sieges.length] ?? [];
  const ok = ordre.length === attendu.length && ordre.every((p, i) => p === attendu[i]);
  return {
    numero: 2, nom, ok, temoin: true,
    detail: ok ? undefined : `ordre des sièges ${ordre.join('-')}, ordre de parole attendu ${attendu.join('-')}`,
  };
}

// ─── 3, 4, 5. Le rejeu ─────────────────────────────────────────────────────────────────────────

/**
 * Un seul parcours des actions, trois contrôles :
 *   nº 3 la LÉGALITÉ  — on ne relance pas sous la mise, on ne checke pas devant une mise, on
 *                       n'agit ni après s'être couché ni après être à tapis ;
 *   nº 4 les TAPIS    — personne n'engage plus qu'il n'a, et le « à tapis » annoncé par le texte
 *                       (quand il l'est) tombe d'accord avec l'épuisement calculé ;
 *   nº 5 la CLÔTURE   — à la fin d'une street, les joueurs encore en jeu et non à tapis ont TOUS
 *                       misé pareil. C'est le contrôle qui ne demande aucun résumé.
 */
function controleRejeu(hand: Hand): Controle[] {
  const tapis = tapisDe(hand.seats);
  const nomme = etiquettes(hand);
  const etat: Etat = { couche: new Set(), aTapis: new Set(), cumul: {} };
  const fautes: { legalite: string[]; tapis: string[]; cloture: string[] } =
    { legalite: [], tapis: [], cloture: [] };

  // Les mises forcées engagent avant toute action volontaire.
  const posts = hand.actions.filter((a) => a.type.startsWith('post-'));
  const misesDeStreet: Record<string, number> = {};
  for (const p of posts) {
    etat.cumul[p.seatId] = roundMoney((etat.cumul[p.seatId] ?? 0) + (p.amount ?? 0));
    // Un ante n'entre pas dans ce qu'il faut suivre (cf. `committedBySeat`).
    if (p.type !== 'post-ante') {
      misesDeStreet[p.seatId] = roundMoney((misesDeStreet[p.seatId] ?? 0) + (p.amount ?? 0));
    }
  }
  const majTapis = (seatId: string) => {
    if (etat.cumul[seatId] > roundMoney(tapis[seatId]) + EPSILON) {
      fautes.tapis.push(`${nomme(seatId)} engage ${etat.cumul[seatId]} pour un tapis de ${tapis[seatId]}`);
    }
    if (proche(etat.cumul[seatId], tapis[seatId])) etat.aTapis.add(seatId);
  };
  for (const seatId of Object.keys(etat.cumul)) majTapis(seatId);

  for (const rue of RUES) {
    if (rue !== 'preflop') for (const k of Object.keys(misesDeStreet)) delete misesDeStreet[k];
    const dansLaRue = hand.actions.filter((a) => a.street === rue && !a.type.startsWith('post-'));
    const couchesAvant = new Set(etat.couche);

    for (const a of dansLaRue) {
      const maximum = Math.max(0, ...Object.values(misesDeStreet));
      const dejaMis = misesDeStreet[a.seatId] ?? 0;

      if (etat.couche.has(a.seatId)) fautes.legalite.push(`${nomme(a.seatId)} agit après s'être couché`);
      if (etat.aTapis.has(a.seatId)) fautes.legalite.push(`${nomme(a.seatId)} agit après être à tapis`);

      if (a.type === 'fold') { etat.couche.add(a.seatId); continue; }
      if (a.type === 'check') {
        if (!proche(dejaMis, maximum)) {
          fautes.legalite.push(`${nomme(a.seatId)} checke devant une mise de ${maximum} (il a ${dejaMis})`);
        }
        continue;
      }

      const total = a.amount ?? 0;
      const ajout = roundMoney(total - dejaMis);
      etat.cumul[a.seatId] = roundMoney((etat.cumul[a.seatId] ?? 0) + ajout);
      const auTapis = proche(etat.cumul[a.seatId], tapis[a.seatId]);

      if (a.type === 'call' && total > maximum + EPSILON) {
        fautes.legalite.push(`${nomme(a.seatId)} « suit » ${total} au-dessus de la mise ${maximum}`);
      }
      // Suivre pour MOINS que la mise n'est légal à une seule condition : y avoir mis son tapis.
      if (a.type === 'call' && total < maximum - EPSILON && !auTapis) {
        fautes.legalite.push(`${nomme(a.seatId)} suit ${total} pour une mise de ${maximum} sans être à tapis`);
      }
      if (a.type === 'bet' && maximum > EPSILON) {
        fautes.legalite.push(`${nomme(a.seatId)} « mise » ${total} alors que ${maximum} est déjà misé`);
      }
      if (a.type === 'raise' && total <= maximum + EPSILON) {
        fautes.legalite.push(`${nomme(a.seatId)} « relance » à ${total} sous la mise ${maximum}`);
      }

      misesDeStreet[a.seatId] = total;
      majTapis(a.seatId);
    }

    // ─── nº 5 : la clôture du tour ────────────────────────────────────────────────────────────
    // Sont exclus : ceux qui étaient déjà couchés en entrant, ceux qui se sont couchés PENDANT
    // (leur mise est légitimement inférieure), et ceux qui sont à tapis (ils ne pouvaient pas
    // suivre). Tous les autres doivent avoir posé le même montant sur la street.
    if (dansLaRue.length === 0 && rue !== 'preflop') continue;
    const enJeu = hand.seats
      .map((s) => s.id)
      .filter((id) => !etat.couche.has(id) && !couchesAvant.has(id) && !etat.aTapis.has(id));
    const mises = enJeu.map((id) => misesDeStreet[id] ?? 0);
    if (mises.length > 1 && !mises.every((m) => proche(m, mises[0]))) {
      fautes.cloture.push(
        `${rue} : ${enJeu.map((id, i) => `${nomme(id)}=${mises[i]}`).join(', ')} — le tour ne ferme pas`
      );
    }
  }

  const rendre = (numero: number, nom: string, liste: string[]): Controle => ({
    numero, nom, ok: liste.length === 0, temoin: true,
    detail: liste.length === 0 ? undefined : liste.join(' · '),
  });
  return [
    rendre(3, 'légalité des actions', fautes.legalite),
    rendre(4, 'tapis', fautes.tapis),
    rendre(5, 'clôture des tours', fautes.cloture),
  ];
}

// ─── 6. Le pot et les gagnants ─────────────────────────────────────────────────────────────────

/**
 * ⚠️ « TOTAL POT » N'A PAS LE MÊME SENS D'UN SITE À L'AUTRE — un contrôle partagé aurait été
 * silencieusement FAUX sur l'un des deux. L'équation est donc déclarée par le dialecte, et le rake
 * se LIT (il ne se calcule pas).
 *
 * Les gagnants, eux, se comparent sans équation : on confronte l'ensemble des sièges que le moteur
 * désigne à ceux que le fichier annonce, et leurs PROPORTIONS. C'est la contre-épreuve la plus
 * forte de tout le pipeline — une action mal lue change le vainqueur ou le partage.
 */
function controlePot(main: MainLue, montage: MontageDeMain): Controle {
  const nom = 'pot et gagnants';
  const { hand } = montage;
  const nomme = etiquettes(hand);
  const engage = committedBySeat(hand.actions);
  const somme = roundMoney(Object.values(engage).reduce((s, v) => s + v, 0));
  const resume = main.resume;

  const morceaux: string[] = [];
  let temoin = false;

  const nonSuiviDerive = miseNonSuivie(engage);

  // LA MISE NON SUIVIE, CONFRONTÉE À CE QUE LE FICHIER EN DIT. Ni Winamax ni Betclic ne l'écrivent
  // — elle se dérive. La famille PokerStars, si (`Uncalled bet ($149) returned to X`), et c'est
  // alors le seul témoin qui existe sur la seule quantité que le pipeline calcule sans rien avoir
  // à comparer.
  if (resume?.nonSuiviAnnonce != null) {
    temoin = true;
    if (!proche(resume.nonSuiviAnnonce, nonSuiviDerive)) {
      morceaux.push(`mise non suivie dérivée ${nonSuiviDerive} ≠ annoncée ${resume.nonSuiviAnnonce}`);
    }
  }

  if (resume?.potTotal != null && resume.rake != null) {
    temoin = true;
    // ⚠️ « TOTAL POT » N'A PAS LE MÊME SENS D'UN SITE À L'AUTRE (mesuré) : Winamax laisse la mise
    // non suivie DEDANS, Betclic la sort. Un contrôle partagé aurait été silencieusement faux sur
    // l'un des deux — d'où l'équation déclarée par le dialecte.
    //
    // `inconnue` est le cas de la grammaire générique, sur une salle jamais mesurée : on accepte
    // l'une OU l'autre. Affaiblissement assumé et petit — sur les vraies mains, deux lectures
    // différentes des montants donnaient DÉJÀ le même pot, et c'est la CLÔTURE (nº 5) qui les
    // séparait. Refuser une lecture juste parce qu'on a deviné la mauvaise convention coûterait
    // plus cher que cette tolérance.
    // ⚠️ TROIS CONVENTIONS MESURÉES, PAS DEUX. Winamax : Σ − rake. Betclic : Σ − non suivi − rake.
    // Et GGPoker, trouvé le 04/09 sur une vraie main : **Σ − non suivi, RAKE NON DÉDUIT**
    // (70,49 − 28,62 = 41,87 exactement, le rake et le jackpot venant s'enlever ENSUITE du montant
    // encaissé). Aucune documentation ne donne ça — il faut l'arithmétique d'une vraie main.
    // `inconnue` essaie donc les quatre combinaisons plausibles.
    const attendus = (main.equationDuPot === 'somme-moins-rake' ? [somme - resume.rake]
      : main.equationDuPot === 'somme-moins-non-suivi-moins-rake' ? [somme - nonSuiviDerive - resume.rake]
      : [somme, somme - resume.rake, somme - nonSuiviDerive, somme - nonSuiviDerive - resume.rake]
    ).map(roundMoney);
    if (!attendus.some((a) => proche(a, resume.potTotal!))) {
      morceaux.push(`pot calculé ${[...new Set(attendus)].join(' ou ')} (Σ ${somme}, non suivi`
        + ` ${nonSuiviDerive}, rake ${resume.rake}) ≠ pot annoncé ${resume.potTotal}`);
    }
  }

  const annonces = resume?.gains ?? [];
  if (annonces.length > 0) {
    temoin = true;

    // ⚠️ LA BORNE DU POT, QUAND IL N'Y A PAS DE « TOTAL POT » À COMPARER.
    //
    // La famille partypoker/888 n'écrit NI pot total NI rake : sans elle, le contrôle nº 6 n'aurait
    // plus que les gagnants sur ces deux salles. Or une chose reste vraie sans aucun seuil et sans
    // rien connaître du barème : ON NE PEUT PAS ENCAISSER PLUS QUE CE QUI A ÉTÉ MIS. Le rake est
    // positif ou nul, donc l'écart l'est aussi — et le plafond dépend de l'équation déclarée par le
    // dialecte, puisque certaines salles rendent la mise non suivie DANS le gain annoncé
    // (partypoker) et d'autres HORS de lui (888).
    //
    // C'est délibérément une INÉGALITÉ et non une fourchette : « un rake plausible » serait un
    // seuil, donc une valeur choisie, et une lecture trop généreuse est déjà attrapée par la
    // clôture des tours (nº 5). Ici on ne veut que ce qui est impossible.
    const plafond = roundMoney(
      main.equationDuPot === 'somme-moins-non-suivi-moins-rake' ? somme - nonSuiviDerive : somme
    );
    const encaisse = roundMoney(annonces.reduce((s, g) => s + g.montant, 0));
    if (encaisse > plafond + EPSILON) {
      morceaux.push(`${encaisse} encaissé(s) pour ${plafond} au pot au maximum`
        + ` (Σ ${somme}, non suivi ${nonSuiviDerive})`);
    }

    const parts = determinePotAwards(hand);
    const attendus = new Map(parts.map((p) => [p.seatId, p.fraction]));
    const totalAnnonce = annonces.reduce((s, g) => s + g.montant, 0);
    const obtenus = new Map<string, number>();
    for (const g of annonces) {
      const seatId = montage.siegeParNom.get(g.nom);
      if (!seatId) { morceaux.push(`gagnant inconnu « ${g.nom} »`); continue; }
      obtenus.set(seatId, (obtenus.get(seatId) ?? 0) + g.montant / totalAnnonce);
    }
    for (const [seatId, part] of obtenus) {
      const attendu = attendus.get(seatId);
      if (attendu == null) { morceaux.push(`${nomme(seatId)} gagne dans le fichier, pas dans le moteur`); continue; }
      if (Math.abs(attendu - part) > 1e-6) {
        morceaux.push(`${nomme(seatId)} : ${(part * 100).toFixed(1)} % annoncés, ${(attendu * 100).toFixed(1)} % calculés`);
      }
    }
    for (const seatId of attendus.keys()) {
      if (!obtenus.has(seatId)) morceaux.push(`${nomme(seatId)} gagne dans le moteur, pas dans le fichier`);
    }
  }

  return {
    numero: 6, nom, ok: morceaux.length === 0, temoin,
    detail: morceaux.length > 0 ? morceaux.join(' · ') : (temoin ? undefined : 'aucun résumé'),
  };
}
