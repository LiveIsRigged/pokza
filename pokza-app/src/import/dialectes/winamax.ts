import type { Card, Street } from '../../types/poker';
import {
  cartesNeuves, crochets, lireCartes, lireMontant, premierMontantDeLaParenthese, refuser,
  type ActionLue, type CartesMontrees, type Dialecte, type MainLue, type MiseForceeLue, type SiegeLu,
} from '../formeNeutre';
import { deviseEcrite } from '../devise';
import { clefs, decouperEnBlocs } from '../blocs';

/**
 * WINAMAX — ET SES DEUX NOTATIONS, D'UN SEUL LECTEUR.
 * ═════════════════════════════════════════════════
 * Winamax écrit la même main de deux façons selon l'endroit d'où on la copie :
 *
 *   export « partager la main »          |  export de fichier
 *   ───────────────────────────────────  |  ─────────────────────────────────
 *   [b]ANTE/BLINDS[/b]                   |  *** ANTE/BLINDS ***
 *   Dealt to X                           |  Dealt to X [Ah As]
 *   [AS] [3H]              ← ligne suivante
 *   [b]FLOP[/b]                          |  *** FLOP *** [6c 2d Qh]
 *   [3D] [6D] [9C]         ← ligne suivante
 *   couleur en MAJUSCULE, un crochet par carte  |  minuscule, un crochet pour le groupe
 *
 * On ne fait PAS deux dialectes de ça. Les trois écarts sont de la même nature — « la valeur est
 * sur la ligne du marqueur » contre « sur la ligne suivante » — et le balisage BBCode se traduit
 * ligne pour ligne dans l'autre. Une préface de normalisation ramène donc la première notation sur
 * la seconde, et tout le reste du lecteur est commun. La casse des couleurs, elle, est déjà réglée
 * en amont : `lireCarte` normalise (les deux alphabets étant disjoints).
 *
 * ⚠️ LES NOMS SE LISENT DANS LES LIGNES `Seat N:`, PUIS LES LIGNES D'ACTION SE RECONNAISSENT
 * CONTRE CET ENSEMBLE. Jamais de découpe sur les blancs : « Roi  faucon » porte DEUX espaces,
 * « Grande pile » en porte un, et un `split(' ')` en ferait des joueurs fantômes.
 */

const MARQUEURS = clefs('ANTE/BLINDS', 'PRE-FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOW DOWN', 'SUMMARY');
const DEBUT = 'Winamax Poker - ';

/** Ramène la notation BBCode sur l'autre : balises traduites, puis valeurs remontées d'une ligne. */
function normaliserNotation(texte: string): string[] {
  const lignes = texte
    .replace(/\[b\]([^[]*)\[\/b\]/g, '*** $1 ***')
    .split('\n')
    .map((l) => l.trimEnd());

  const sortie: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const suivante = lignes[i + 1] ?? '';
    // Une ligne qui ANNONCE des cartes sans en porter, suivie d'une ligne qui n'est QUE des
    // crochets : les deux notations ne diffèrent que par ce saut de ligne.
    const annonce = /^\*\*\* /.test(ligne) || /^Board:/.test(ligne) || /^Dealt to /.test(ligne);
    if (annonce && !ligne.includes('[') && /^(\[[^\]]*\]\s*)+$/.test(suivante.trim())) {
      sortie.push(`${ligne} ${suivante.trim()}`);
      i++;
      continue;
    }
    sortie.push(ligne);
  }
  return sortie;
}

const RUES: { marqueur: string; rue: Street; cartes: number }[] = [
  { marqueur: 'PRE-FLOP', rue: 'preflop', cartes: 0 },
  { marqueur: 'FLOP', rue: 'flop', cartes: 3 },
  { marqueur: 'TURN', rue: 'turn', cartes: 1 },
  { marqueur: 'RIVER', rue: 'river', cartes: 1 },
];

function lireEntete(entete: string[]): {
  typePartie: 'cash' | 'tournoi'; variante: string; devise?: string;
  nomTournoi?: string; buyIn?: string; niveau?: string; siegeBouton: number; sieges: SiegeLu[];
} {
  const premiere = entete.find((l) => l.startsWith(DEBUT)) ?? '';
  // ⚠️ LE TYPE DE PARTIE D'ABORD : c'est lui qui dit si les montants sont de l'argent ou des jetons.
  const tournoi = /^Winamax Poker - Tournament\b/.test(premiere);

  // Les enjeux entre parenthèses juste avant la date : `(0.50€/1€)` en cash,
  // `(160/700/1400)` en tournoi. ⚠️ NE JAMAIS EN LIRE LES BLINDES — en tournoi c'est
  // ante/SB/BB, alors que Pokza écrit « 5/10/25 » pour un STRADDLE. Les mises forcées se
  // lisent dans les lignes `posts`, où elles sont nommées. Ici on n'en prend que la DEVISE.
  const enjeux = premiere.match(/-\s*([A-Za-z0-9' ]+?)\s*\(([^)]*)\)\s*-\s*\d{4}\//);
  const variante = enjeux?.[1]?.trim() ?? '';
  const devise = tournoi ? undefined : deviseEcrite(enjeux?.[2] ?? '');

  const nomTournoi = premiere.match(/Tournament\s+"([^"]*)"/)?.[1];
  const buyIn = premiere.match(/buyIn:\s*(.+?)\s+(?:level:|-\s*HandId:)/)?.[1]?.trim();
  const niveau = premiere.match(/level:\s*(\d+)/)?.[1];

  const bouton = entete.map((l) => l.match(/Seat #(\d+) is the button/)).find(Boolean);
  if (!bouton) refuser('bouton-introuvable', "aucune ligne « Seat #N is the button »");

  const sieges: SiegeLu[] = [];
  for (const ligne of entete) {
    const m = ligne.match(/^Seat (\d+):\s+(.+?)\s+\(([^)]*)\)\s*$/);
    if (!m) continue;
    // La prime d'un tournoi à élimination est un SECOND montant dans la même parenthèse
    // (`80213, 61.87€ bounty`) : le tapis est le premier, la prime ne nous concerne pas.
    const tapis = lireMontant(premierMontantDeLaParenthese(m[3]));
    if (tapis == null) refuser('ligne-incomprise', `tapis illisible : « ${ligne} »`);
    sieges.push({ numero: parseInt(m[1], 10), nom: m[2], tapis });
  }

  return {
    typePartie: tournoi ? 'tournoi' : 'cash', variante, devise,
    nomTournoi, buyIn, niveau, siegeBouton: parseInt(bouton![1], 10), sieges,
  };
}

export const winamax: Dialecte = {
  id: 'winamax',

  // Signature de NOTATION : l'en-tête de Winamax est le même dans ses deux exports, et c'est la
  // seule ligne qui ne bouge pas d'une notation à l'autre.
  reconnait: (texte) => new RegExp(`^${DEBUT}`, 'm').test(texte),

  decoupe: (texte) =>
    texte
      .split(new RegExp(`(?=^${DEBUT})`, 'm'))
      .map((t) => t.trim())
      .filter((t) => t.startsWith(DEBUT.trim())),

  lit(texte): MainLue {
    const { entete, parMarqueur, apresMarqueur } = decouperEnBlocs(normaliserNotation(texte), MARQUEURS);
    const h = lireEntete(entete);
    if (h.sieges.length === 0) refuser('pas-assez-de-joueurs', "aucune ligne « Seat N: »");

    // Les noms, du plus long au plus court : « Incognito 1 » doit gagner sur « Incognito »
    // s'il existait, et un préfixe commun ne doit jamais happer la ligne d'un autre.
    const noms = h.sieges.map((s) => s.nom).sort((a, b) => b.length - a.length);
    const quelNom = (ligne: string) => noms.find((n) => ligne.startsWith(`${n} `));

    const misesForcees: MiseForceeLue[] = [];
    const actions: ActionLue[] = [];
    const abattage: CartesMontrees[] = [];
    const gains: { nom: string; montant: number }[] = [];
    let hero: MainLue['hero'];

    /** Les lignes de mises forcées, de cartes du héros et d'abattage vivent hors des streets. */
    const lireLigneHorsRue = (ligne: string): boolean => {
      const dealt = ligne.match(/^Dealt to (.+?)\s*(\[.*\])\s*$/);
      if (dealt) {
        hero = { nom: dealt[1], cartes: crochets(dealt[2]).flatMap((c) => lireCartes(c)) };
        return true;
      }
      const nom = quelNom(ligne);
      if (!nom) return false;
      const reste = ligne.slice(nom.length).trim();

      const poste = reste.match(/^posts (small blind|big blind|ante)\s+(\S+)/);
      if (poste) {
        const montant = lireMontant(poste[2]);
        if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
        const genre = poste[1] === 'small blind' ? 'sb' : poste[1] === 'big blind' ? 'bb' : 'ante';
        misesForcees.push({ nom, genre, montant });
        return true;
      }
      // ⚠️ On n'INVENTE pas la tournure d'un straddle qu'on n'a jamais mesurée : toute autre mise
      // forcée est un refus. Une lecture fausse coûte plus cher qu'un import manqué.
      if (/^posts /.test(reste)) {
        refuser('mise-forcee-inconnue', `mise forcée inconnue : « ${ligne} »`);
      }

      const montre = reste.match(/^shows\s+(\[[^\]]*\])/);
      if (montre) {
        abattage.push({ nom, cartes: crochets(montre[1]).flatMap((c) => lireCartes(c)) });
        return true;
      }
      const collecte = reste.match(/^collected\s+(\S+)\s+from pot/);
      if (collecte) {
        const montant = lireMontant(collecte[1]);
        if (montant != null) gains.push({ nom, montant });
        return true;
      }
      return false;
    };

    for (const ligne of [...entete, ...(parMarqueur.get('ANTE/BLINDS') ?? []),
                         ...(parMarqueur.get('SHOW DOWN') ?? [])]) {
      // ⚠️ `Player Info: Seat1: P1-e6afa3e352d825e1853c218ca75707dd` — LA LIGNE DES TABLES
      // INCOGNITO, trouvée le 06/09/2026 sur une vraie main (2025/12) en essayant l'écran. Winamax
      // y donne l'IDENTIFIANT STABLE du joueur masqué, seat par seat, et seulement pour ceux qui
      // sont masqués. Elle ne dit rien du déroulé : elle est écartée, comme le reste de l'en-tête.
      //
      // ⚠️ ET ELLE NE DOIT SURTOUT PAS ÊTRE IMPORTÉE : c'est un identifiant qui SUIT le joueur de
      // main en main, donc exactement ce que l'architecture évite en gardant la lecture sur
      // l'appareil. Le nom affiché (`Incognito 1`) est déjà un masque, et aucun pseudo n'entre dans
      // Pokza de toute façon.
      if (!ligne.trim() || ligne.startsWith('Seat ') || ligne.startsWith(DEBUT)
          || ligne.startsWith('Table:') || ligne.startsWith('Player Info:')) continue;
      if (!lireLigneHorsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
    }

    // ─── Les streets ──────────────────────────────────────────────────────────────────────────
    const board: Card[] = [];
    for (const { marqueur, rue, cartes } of RUES) {
      const bloc = parMarqueur.get(marqueur);
      if (!bloc) continue;
      // Les cartes de la street sont sur la LIGNE DU MARQUEUR, jamais ailleurs dans le bloc.
      if (cartes > 0) board.push(...cartesNeuves(apresMarqueur.get(marqueur) ?? '', cartes, marqueur));
      for (const ligne of bloc) {
        if (!ligne.trim() || /^(\[[^\]]*\]\s*)+$/.test(ligne.trim())) continue;
        if (lireLigneHorsRue(ligne)) continue;
        const nom = quelNom(ligne);
        if (!nom) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
        actions.push(lireAction(nom!, ligne.slice(nom!.length).trim(), rue, ligne));
      }
    }

    // ─── Le résumé, témoin de la vérification ─────────────────────────────────────────────────
    const resumeLignes = parMarqueur.get('SUMMARY') ?? [];
    const potLigne = resumeLignes.find((l) => l.startsWith('Total pot'));
    const potTotal = potLigne ? lireMontant(potLigne.split('|')[0].replace('Total pot', '')) : null;
    // Le rake se LIT. « No rake » en toutes lettres est une valeur, pas une absence de valeur.
    const rake = potLigne
      ? (/\|\s*No rake/.test(potLigne) ? 0 : lireMontant(potLigne.split('|')[1] ?? ''))
      : null;
    const boardResumeLigne = resumeLignes.find((l) => l.startsWith('Board:'));
    const boardResume = boardResumeLigne
      ? crochets(boardResumeLigne).flatMap((c) => lireCartes(c))
      : undefined;

    // ⚠️ DANS LE RÉSUMÉ, UNE LIGNE DE SIÈGE PORTE DEUX PARENTHÈSES DE NATURES DIFFÉRENTES :
    // `(small blind)` (le témoin qu'on cherche) et `(One pair : 4)` (la force de la main). On ne
    // prend donc que la PREMIÈRE, et seulement si elle nomme une blinde.
    let sb: string | undefined;
    let bb: string | undefined;
    for (const ligne of resumeLignes) {
      const m = ligne.match(/^Seat \d+:\s+(.+?)\s+\((small blind|big blind|button)\)/);
      if (!m) continue;
      if (m[2] === 'small blind') sb = m[1];
      if (m[2] === 'big blind') bb = m[1];
    }
    // `won X` du résumé : filet quand la main n'a pas de ligne `collected` (split pot notamment,
    // où Winamax écrit les deux).
    if (gains.length === 0) {
      for (const ligne of resumeLignes) {
        const m = ligne.match(/^Seat \d+:\s+(.+?)\s+.*\bwon\s+(\S+)/);
        const montant = m ? lireMontant(m[2]) : null;
        if (m && montant != null) gains.push({ nom: m[1], montant });
      }
    }

    return {
      dialecte: 'winamax',
      // Winamax NOMME sa salle, et c'est bien une salle : elle donne son nom au lieu.
      salle: 'Winamax',
      typePartie: h.typePartie,
      variante: h.variante,
      devise: h.devise as MainLue['devise'],
      nomTournoi: h.nomTournoi,
      buyIn: h.buyIn,
      niveau: h.niveau,
      sieges: h.sieges,
      siegeBouton: h.siegeBouton,
      hero,
      misesForcees,
      actions,
      board,
      boardResume,
      abattage,
      resume: { potTotal: potTotal ?? undefined, rake: rake ?? undefined, gains },
      // Mesuré : 115,66 − 1,43 = 114,23. La mise NON SUIVIE reste dans le total (elle est rendue
      // à l'intérieur du « collected »), contrairement à Betclic.
      equationDuPot: 'somme-moins-rake',
      temoinPositions: { genre: 'blindes-nommees', sb, bb },
    };
  },
};

/**
 * Un verbe Winamax, et SA CONVENTION DE MONTANT.
 *   `calls 1.50€`            → INCRÉMENT (la BB avait 1€, son total devient 2,50€)
 *   `bets 3.58€`             → total de street (rien n'était misé avant)
 *   `raises 149€ to 159€`    → TOTAL, écrit après le « to »
 * Le suffixe « and is all-in » est une annonce, pas un verbe : Pokza n'a pas de type « tapis »,
 * il le déduit de l'épuisement du tapis. On le garde comme contre-épreuve.
 */
function lireAction(nom: string, reste: string, rue: Street, ligne: string): ActionLue {
  const tapisAnnonce = /and is all-in/.test(reste) || undefined;
  const nu = reste.replace(/\s*and is all-in\s*$/, '');

  if (/^folds\b/.test(nu)) return { nom, rue, genre: 'fold' };
  if (/^checks\b/.test(nu)) return { nom, rue, genre: 'check' };

  const relance = nu.match(/^raises\s+\S+\s+to\s+(\S+)/);
  if (relance) {
    const montant = lireMontant(relance[1]);
    if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
    return { nom, rue, genre: 'raise', montant, montantEst: 'total', tapisAnnonce };
  }
  const simple = nu.match(/^(calls|bets)\s+(\S+)/);
  if (simple) {
    const montant = lireMontant(simple[2]);
    if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
    return {
      nom, rue,
      genre: simple[1] === 'calls' ? 'call' : 'bet',
      montant,
      montantEst: simple[1] === 'calls' ? 'increment' : 'total',
      tapisAnnonce,
    };
  }
  return refuser('ligne-incomprise', `verbe inconnu : « ${ligne} »`);
}
