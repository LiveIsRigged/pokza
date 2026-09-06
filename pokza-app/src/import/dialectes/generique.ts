import type { Card, Street } from '../../types/poker';
import {
  cartesNeuves, crochets, lireCartes, lireMontant, premierMontantDeLaParenthese, refuser,
  type ActionLue, type CartesMontrees, type Dialecte, type MainLue, type MiseForceeLue, type SiegeLu,
} from '../formeNeutre';
import { deviseDeclaree, deviseEcrite } from '../devise';
import { clefDeMarqueur, clefs, decouperEnBlocs } from '../blocs';

/**
 * LA GRAMMAIRE GÉNÉRIQUE — POUR LES SALLES QU'ON N'A JAMAIS VUES.
 * ═════════════════════════════════════════════════════════════
 * Presque tous les formats texte du poker descendent de celui de PokerStars : un en-tête, un bloc
 * de sièges, des marqueurs `*** … ***`, des lignes `<nom>: <verbe> <montant>`. Ce dialecte lit
 * cette FAMILLE plutôt qu'un site, et il est essayé EN DERNIER — seulement quand aucun dialecte
 * dédié n'a reconnu le texte.
 *
 * ⚠️⚠️ CE QUI REND LA TENTATIVE HONNÊTE : LA VÉRIFICATION PAR REJEU. Une lecture fausse est
 * détectée et REFUSÉE, jamais publiée (cf. `verification.ts`). Le pire cas de ce fichier est donc
 * un refus injustifié, pas une main erronée. C'est ce qui autorise à viser large ici, là où un
 * dialecte dédié doit viser juste.
 *
 * ⚠️ ET CE QUI RESTE UNE HYPOTHÈSE : au 04/09/2026, AUCUNE main d'une troisième salle n'a été
 * mesurée. Les tournures ci-dessous viennent de ce que l'on SAIT du format PokerStars, pas de ce
 * qu'on a lu dans un vrai fichier — précisément le genre de mémo que ce projet a appris à ne pas
 * croire (cf. « source de vérité = la base, pas le dump »). La seule validation sur données
 * RÉELLES est Betclic, membre mesuré de la famille, que ce dialecte doit savoir lire quand on
 * éteint son dialecte dédié. Une vraie main d'ailleurs vaut plus que dix de plus ici.
 *
 * ⚠️ LA DIRECTION DE L'ÉCHEC EST CHOISIE : tout ce qui n'est pas reconnu REFUSE. Une tournure de
 * politesse manquante dans `SANS_EFFET` coûte donc un refus injustifié — jamais une main fausse.
 * C'est le bon sens de l'erreur, et c'est aussi ce qui fait que ce fichier grandira par ajouts
 * successifs de tournures constatées, pas par relâchement.
 */

const MARQUEURS = clefs(
  // Les trois façons d'annoncer le préflop, selon les notations. Les tirets et les blancs ne
  // comptent pas (cf. `clefDeMarqueur`) : `PRE-FLOP` ≡ `PREFLOP`.
  'HOLE CARDS', 'PRE-FLOP', 'ANTE/BLINDS',
  'FLOP', 'TURN', 'RIVER', 'SHOW DOWN', 'SUMMARY'
);

/**
 * LA SIGNATURE DE LA FAMILLE — structurelle et non nominale : un bloc de sièges numérotés, et au
 * moins un marqueur dont le NOM fait partie du vocabulaire de la famille. Aucun nom de site n'entre
 * là, c'est tout l'intérêt.
 *
 * ⚠️ LE MARQUEUR EST RECONNU PAR SON NOM, pas par ses trois astérisques. Se contenter des
 * astérisques faisait passer partypoker, dont l'en-tête est
 * `***** Hand History for Game 12001505842 *****` : la famille l'aurait accepté puis refusé ligne
 * par ligne, alors que le bon message est « format non reconnu, envoie-nous un exemple ».
 * partypoker n'est PAS de cette famille (`** Dealing Flop **` à deux astérisques, montants entre
 * crochets, `Seat 5 is the button` sans dièse) et aura son propre dialecte.
 *
 * ⚠️ ET `Dealt to` N'EN FAIT PLUS PARTIE. Une main OBSERVÉE n'en a aucun — elle est parfaitement
 * lisible, simplement sans point de vue. L'exiger ici la faisait refuser en « format inconnu »,
 * message qui invite à nous écrire pour rien : reconnue puis refusée en `hero-introuvable`, elle
 * dit la vérité (« ce texte ne montre les cartes de personne »).
 */
function reconnaitLaFamille(texte: string): boolean {
  if (!/^Seat \d+:\s/m.test(texte)) return false;
  if (!JEU_NOMME.test(premiereLigne(texte))) return false;
  for (const m of texte.matchAll(/^\*\*\*\s*(.+?)\s*\*\*\*/gm)) {
    if (MARQUEURS.has(clefDeMarqueur(m[1]))) return true;
  }
  return false;
}

/** La première ligne non vide — celle qui, dans cette famille, porte l'en-tête. */
function premiereLigne(texte: string): string {
  return texte.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/**
 * ⚠️ L'EN-TÊTE DOIT NOMMER UN JEU, ET C'EST UNE CONDITION DE RECONNAISSANCE — pas un refus qui
 * viendrait après.
 *
 * Sans ça, une main d'une salle d'une AUTRE famille passait la signature (elle a bien des `Seat N:`
 * et un `*** FLOP ***`) puis se faisait refuser en « variante non prise en charge » sur sa première
 * ligne, qui n'est pas un en-tête. Mesuré sur une vraie main WinningPoker, dont la première ligne
 * est `Game started at: 2014/10/29 15:33:25` : l'auteur lisait **« Pokza ne lit que le Hold'em pour
 * l'instant »** DEVANT UNE MAIN DE HOLD'EM. Un message faux, et pire qu'inutile — il fait croire au
 * joueur que son jeu n'est pas géré, donc il ne nous écrit pas.
 *
 * Avec ce test, le même texte tombe en « format non reconnu », dont le message demande justement
 * l'exemple qui permettrait d'écrire son dialecte.
 *
 * ⚠️ ET ON NOMME LES JEUX QU'ON REFUSE AUTANT QUE CEUX QU'ON ACCEPTE : un Omaha de la famille
 * PokerStars doit rester RECONNU, pour être refusé en « Pokza ne lit que le Hold'em » — ce qui, là,
 * est vrai.
 */
const JEU_NOMME = /\b(hold\s*'?\s*em|omaha|stud|razz|badugi|draw|courchevel|h\.?o\.?r\.?s\.?e)\b/i;

/**
 * Les VARIANTES acceptées, cherchées dans l'en-tête nettoyé de sa ponctuation. Une liste
 * d'ORDRES possibles plutôt qu'un test « contient holdem et contient nolimit » : celui-ci
 * accepterait « Omaha Hi/Lo No Limit » dès qu'un jour un en-tête nommerait deux jeux.
 */
const VARIANTES_ACCEPTEES = ['holdemnolimit', 'nolimitholdem', 'holdemnl', 'nlholdem'];

/**
 * Tournures qui ne changent RIEN à la main — chat, allées et venues, mains non montrées.
 *
 * ⚠️ Liste ouverte, et volontairement pauvre : ce qui n'y est pas fait REFUSER la main (cf.
 * l'en-tête). Mieux vaut un refus qu'une ligne d'action avalée en silence, qui changerait le
 * déroulé sans que rien ne le dise. On l'allonge quand une vraie main le demande, pas avant.
 */
const SANS_EFFET = [
  /^said,/i, /^doesn't show hand/i, /^does not show hand/i, /^mucks hand/i, /^shows hand/i,
  /^mucks\b/i, /^is sitting out/i, /^sits out/i, /^has timed out/i, /^leaves the table/i,
  /^joins the table/i, /^is disconnected/i, /^is connected/i, /^has returned/i,
  /^will be allowed to play after the button/i, /^was removed from the table/i, /^re-buys/i,
  /^finished the tournament/i, /^wins the tournament/i, /^adds \S+ to the pot/i,
  // Le décompte de la pendule (Full Tilt) : « Opponent3 has 15 seconds left to act ».
  /^has \d+ seconds? left to act/i, /^has requested TIME/i,
  // ⚠️ `adds $14` : une RECAVE entre deux mains (Full Tilt). Elle ne change pas le tapis DE CETTE
  // MAIN — celui-ci est écrit sur la ligne de siège, et c'est lui qui fait foi. Si elle changeait
  // quelque chose, le contrôle des tapis le verrait.
  /^adds \S+$/i,
];

/**
 * ⚠️ LE CASHOUT DE GGPOKER — REFUSÉ, décidé par Victor le 04/09/2026.
 *
 * `Chooses to EV Cashout` puis `Pays Cashout Risk ($10.09)` : le joueur paie une prime pour
 * encaisser son équité avant la fin. Le DÉROULÉ du coup reste exact — qui mise quoi, qui prend le
 * pot — mais le RÉSULTAT en argent ne l'est plus : sur la main mesurée, il a réellement touché un
 * QUART de moins que le pot affiché (10,09 sur 41,87). C'est la même nature d'écart que le rake,
 * que Pokza ignore, mais d'un tout autre ordre de grandeur — et Pokza n'a aucun endroit où le dire.
 *
 * Ces lignes n'entrent PAS dans le pot (vérifié : 41,87 − 0,75 de rake − 0,37 de jackpot = 40,75
 * encaissés), donc aucun contrôle ne les verrait : c'est ici, et seulement ici, que ça se refuse.
 */
const CASHOUT = [/^chooses to .*cashout/i, /^pays cashout/i, /^receives cashout/i];

/**
 * LE VA-ET-VIENT À TABLE — et il est fait par des gens QUI NE SONT PAS DANS LA MAIN.
 *
 * Mesuré sur une vraie main PokerStars : « xadina joins the table at seat #3 », alors que xadina
 * n'est assis nulle part dans le bloc des sièges. Ces lignes ne se rattachent donc à aucun joueur
 * connu, et la règle habituelle (« un nom connu, puis un verbe ») ne peut pas les voir passer.
 *
 * ⚠️ CE QUI LES REND SÛRES MALGRÉ TOUT : c'est le PRÉDICAT qui décide, pas le sujet. Aucune ligne
 * d'action ne contient « joins the table » ni « leaves the table ». On accepte donc n'importe quel
 * sujet, mais seulement devant ces tournures-là — jamais devant un verbe de poker.
 */
const TRAFIC = [
  /\b(joins|leaves) the table\b/i,
  /\bwas removed from the table\b/i,
  /\b(is|has been) disconnected\b/i,
  /\bhas returned\b/i,
  /\bsaid,/i,
  /\bis sitting out\b/i,
];

const RUES: { marqueur: string; rue: Street; cartes: number }[] = [
  { marqueur: 'ANTE/BLINDS', rue: 'preflop', cartes: 0 },
  { marqueur: 'HOLE CARDS', rue: 'preflop', cartes: 0 },
  { marqueur: 'PRE-FLOP', rue: 'preflop', cartes: 0 },
  { marqueur: 'FLOP', rue: 'flop', cartes: 3 },
  { marqueur: 'TURN', rue: 'turn', cartes: 1 },
  { marqueur: 'RIVER', rue: 'river', cartes: 1 },
];

/** `Level V` — PokerStars numérote ses niveaux en chiffres ROMAINS, là où Pokza stocke
 *  « Niveau 12 » (cf. `LEVEL_DIGITS_MAX`). Illisible, le niveau est simplement abandonné : il ne
 *  coûte rien, contrairement à un montant. */
function lireNiveau(brut: string): string | undefined {
  if (/^\d+$/.test(brut)) return brut;
  const VALEURS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  if (!/^[IVXLCDM]+$/i.test(brut)) return undefined;
  const chiffres = [...brut.toUpperCase()].map((c) => VALEURS[c]);
  let total = 0;
  for (let i = 0; i < chiffres.length; i++) {
    total += chiffres[i] < (chiffres[i + 1] ?? 0) ? -chiffres[i] : chiffres[i];
  }
  return total > 0 ? String(total) : undefined;
}

export const generique: Dialecte = {
  id: 'generique',

  reconnait: reconnaitLaFamille,

  // Une main commence à la première ligne d'en-tête, c'est-à-dire à celle qui précède le premier
  // bloc de sièges. On découpe donc SUR les lignes de sièges : la ligne juste avant la première
  // `Seat 1:` d'un groupe ouvre une nouvelle main. Plus simple et plus sûr : le résumé d'une main
  // est toujours suivi d'une ligne vide puis d'un en-tête.
  decoupe: (texte) => {
    const mains: string[] = [];
    let courant: string[] = [];
    let vuUnResume = false;
    for (const ligne of texte.split('\n')) {
      const debutDeMain = /^\*\*\*\s*SUMMARY\s*\*\*\*/i.test(ligne);
      if (vuUnResume && ligne.trim() && !/^\*\*\*/.test(ligne) && !/^Seat \d+:/.test(ligne)
          && !/^Board\b/.test(ligne) && !/^Total pot\b/.test(ligne)) {
        mains.push(courant.join('\n'));
        courant = [];
        vuUnResume = false;
      }
      if (debutDeMain) vuUnResume = true;
      courant.push(ligne);
    }
    if (courant.join('').trim()) mains.push(courant.join('\n'));
    return mains.map((m) => m.trim()).filter(reconnaitLaFamille);
  },

  lit(texte): MainLue {
    const { entete, parMarqueur, apresMarqueur } = decouperEnBlocs(texte.split('\n'), MARQUEURS);
    const premiere = entete.find((l) => l.trim()) ?? '';

    // ⚠️ LE TYPE DE PARTIE D'ABORD, avant le moindre montant : c'est lui qui dit si les nombres
    // sont de l'argent ou des jetons (leçon du tournoi Betclic, qui met des € sur des jetons).
    const tournoi = /\bTournament\b/i.test(premiere);

    const nu = premiere.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!VARIANTES_ACCEPTEES.some((v) => nu.includes(v))) {
      refuser('variante-non-prise-en-charge', `variante non reconnue dans « ${premiere.slice(0, 80)} »`);
    }

    // Les enjeux : la première parenthèse qui porte un nombre ET une barre. ⚠️ EN CASH SEULEMENT —
    // en tournoi, la parenthèse qui ressemble à des enjeux est celle du NIVEAU (`Level V (100/200)`),
    // et les blindes ne se lisent JAMAIS dans un en-tête.
    const enjeux = tournoi ? '' : (premiere.match(/\(([^)]*\d[^)]*\/[^)]*)\)/)?.[1] ?? '');
    const devise = tournoi ? undefined : (deviseDeclaree(enjeux) ?? deviseEcrite(enjeux));

    // Le buy-in : deux montants séparés par un « + ». Un freeroll n'en a pas, et n'en aura pas.
    // Le code ISO qui suit parfois est retiré — `normaliserBuyIn` refuse de sommer ce qu'il ne
    // comprend pas entièrement, et « USD » suffirait à tout rendre inchangé.
    const buyIn = tournoi
      ? premiere.match(/([^\s,]*\d[^\s,]*\s*\+\s*[^\s,]*\d[^\s,]*)/)?.[1]
      : undefined;
    const niveau = tournoi
      ? lireNiveau(premiere.match(/\bLevel\s+([IVXLCDM]+|\d+)\b/i)?.[1] ?? '')
      : undefined;

    // DEUX FAÇONS DE DÉSIGNER LE BOUTON, toutes deux MESURÉES sur de vraies mains : une ligne à
    // part (`Seat #2 is the button`, famille PokerStars et Winamax) ou un suffixe sur la ligne du
    // siège (`  DEALER`, Betclic). Les deux sont lues ; aucune n'est devinée.
    // TROIS façons de désigner le bouton, toutes RELEVÉES sur de vrais fichiers : une ligne à part
    // (`Seat #2 is the button`, famille PokerStars et Winamax), une phrase (`The button is in
    // seat #5`, Full Tilt), ou un suffixe sur la ligne du siège (`  DEALER`, Betclic).
    let siegeBouton = parseInt(entete.map((l) => l.match(/Seat #(\d+) is the button/)
      ?? l.match(/The button is in seat #(\d+)/i)).find(Boolean)?.[1] ?? '', 10);

    const sieges: SiegeLu[] = [];
    /** Noms marqués `is sitting out` sur leur ligne de siège — un indice, pas un verdict. */
    const assis = new Set<string>();
    for (const ligne of entete) {
      const m = ligne.match(/^Seat (\d+):\s+(.+?)\s+\(([^)]*)\)(.*)$/);
      if (!m) continue;
      if (/\bDEALER\b/.test(m[4])) siegeBouton = parseInt(m[1], 10);
      const tapis = lireMontant(premierMontantDeLaParenthese(m[3]));
      if (tapis == null) refuser('ligne-incomprise', `tapis illisible : « ${ligne} »`);
      sieges.push({ numero: parseInt(m[1], 10), nom: m[2], tapis });
      // ⚠️ `is sitting out` NE VEUT PAS DIRE « non servi » — mesuré sur une vraie main PokerStars
      // de tournoi, où un joueur marqué ainsi POSTE SON ANTE puis se couche : il est bel et bien
      // dans le coup, le drapeau ne concerne que la main suivante. On le note sans l'exclure, et
      // c'est le CROISEMENT avec l'absence de toute autre ligne qui tranchera (cf. `absents`).
      if (/\bis sitting out\b/i.test(m[4])) assis.add(m[2]);
    }
    if (sieges.length === 0) refuser('pas-assez-de-joueurs', "aucune ligne « Seat N: »");
    if (!Number.isFinite(siegeBouton)) {
      refuser('bouton-introuvable', "ni « Seat #N is the button », ni siège marqué « DEALER »");
    }

    const noms = sieges.map((s) => s.nom).sort((a, b) => b.length - a.length);
    // Deux ponctuations possibles derrière le nom : `X: folds` (Stars, Betclic) et `X folds`
    // (Winamax). On accepte les deux, du nom le plus long au plus court.
    const quelNom = (ligne: string) => noms.find((n) => ligne.startsWith(`${n}:`) || ligne.startsWith(`${n} `));
    const reste = (ligne: string, nom: string) => ligne.slice(nom.length).replace(/^:\s*/, '').trim();

    const misesForcees: MiseForceeLue[] = [];
    const actions: ActionLue[] = [];
    const abattage: CartesMontrees[] = [];
    const gains: { nom: string; montant: number }[] = [];
    let hero: MainLue['hero'];
    let nonSuiviAnnonce: number | undefined;

    /** Les lignes qui n'appartiennent à aucune street. Rend `false` si la ligne n'est pas pour elle. */
    const horsRue = (ligne: string): boolean => {
      const dealt = ligne.match(/^Dealt to (.+?)\s*(\[[^\]]*\])\s*$/);
      if (dealt) {
        hero = { nom: dealt[1], cartes: crochets(dealt[2]).flatMap((c) => lireCartes(c)) };
        return true;
      }
      // ⚠️ `Dealt to <nom>` SANS CARTES — mesuré sur une vraie main GGPoker (2022) : la salle
      // annonce la distribution à CHAQUE joueur et ne montre les cartes que pour le héros. Une
      // ligne sans crochets ne porte donc aucune information, et c'est bien celle QUI EN A qui
      // désigne le héros. L'ignorer est sans risque ; la refuser rendait toute main GG illisible.
      if (/^Dealt to /.test(ligne)) return true;
      // La mise non suivie ANNONCÉE — témoin gratuit sur la seule quantité que le pipeline dérive.
      // Deux écritures relevées : « Uncalled bet ($12) returned to X » (PokerStars, GGPoker) et
      // « Uncalled bet of $28.80 returned to X » (Full Tilt).
      const rendue = ligne.match(/^Uncalled bet\s*(?:\(([^)]*)\)|of\s+(\S+))\s*returned to\s+/i);
      if (rendue) {
        nonSuiviAnnonce = lireMontant(rendue[1] ?? rendue[2] ?? '') ?? undefined;
        return true;
      }
      const nom = quelNom(ligne);
      if (!nom) return TRAFIC.some((r) => r.test(ligne));
      const suite = reste(ligne, nom);

      // Une blinde morte (« posts small & big blinds ») n'a pas de modèle dans Pokza : la lire
      // comme une petite blinde décalerait tout le pot de départ.
      if (/^posts?\s+small\s*&\s*big\s+blinds?/i.test(suite)) {
        refuser('mise-forcee-inconnue', `blinde morte : « ${ligne} »`);
      }
      // `of` entre la blinde et son montant : Full Tilt écrit « posts the small blind of $2 ».
      const poste = suite.match(/^posts?\s+(?:the\s+)?(small blind|big blind|ante)\s+(?:of\s+)?(\S+)/i)
                 ?? suite.match(/^post\s+(SB|BB|Ante)\s+(\S+)/i);
      if (poste) {
        const montant = lireMontant(poste[2]);
        if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
        const clef = poste[1].toLowerCase();
        const genre = clef.startsWith('s') ? 'sb' : clef.startsWith('b') ? 'bb' : 'ante';
        misesForcees.push({ nom, genre, montant });
        return true;
      }
      if (/^posts?\b/i.test(suite)) refuser('mise-forcee-inconnue', `mise forcée inconnue : « ${ligne} »`);

      // ⚠️ `shows [..]` AVANT la liste sans effet, qui contient `shows hand` : seul le crochet
      // alimente les cartes révélées. Un `mucks` ne montre rien à personne.
      const montre = suite.match(/^shows?\s+(\[[^\]]*\])/i);
      if (montre) {
        abattage.push({ nom, cartes: crochets(montre[1]).flatMap((c) => lireCartes(c)) });
        return true;
      }
      // ⚠️ LA PRIME D'ÉLIMINATION N'EST PAS UN GAIN DE POT — mesuré sur une vraie main PokerStars :
      // « nossoff wins $1 for eliminating Hero and their own bounty increases by $1 to $6 ». Lue
      // comme un gain, elle ajoutait une part fantôme de 1 à côté des 18 010 du pot. Sur cette
      // main-là un seul gagnant l'absorbait ; sur un pot PARTAGÉ, les proportions seraient fausses
      // et le contrôle nº 6 refuserait une main juste.
      if (/^wins\s+\S+\s+for eliminating/i.test(suite)) return true;
      if (CASHOUT.some((r) => r.test(suite))) {
        refuser('main-avec-cashout', `cashout : « ${ligne} »`);
      }
      const collecte = suite.match(/^collected\s+(\S+)\s+from/i) ?? suite.match(/^wins\s+(\S+)/i);
      if (collecte) {
        const montant = lireMontant(collecte[1]);
        if (montant != null) gains.push({ nom, montant });
        return true;
      }
      return SANS_EFFET.some((r) => r.test(suite));
    };

    for (const ligne of entete) {
      // Les lignes d'EN-TÊTE déjà exploitées ailleurs (ou sans contenu de jeu) : le titre, le
      // bloc des sièges, la description de table, et la phrase du bouton à la façon Full Tilt —
      // celle-là a été lue plus haut pour son numéro, il ne faut pas la refuser ensuite.
      if (!ligne.trim() || /^Seat \d+:/.test(ligne) || ligne === premiere
          || /^Table\b/.test(ligne) || /^The button is in seat #\d+/i.test(ligne)) continue;
      if (!horsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
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
        if (horsRue(ligne)) continue;
        const nom = quelNom(ligne);
        if (!nom) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
        actions.push(lireAction(nom!, reste(ligne, nom!), rue, ligne));
      }
    }

    // ─── L'abattage et le résumé ──────────────────────────────────────────────────────────────
    for (const ligne of parMarqueur.get('SHOW DOWN') ?? []) {
      if (!ligne.trim()) continue;
      if (!horsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
    }

    // Le résumé est un TÉMOIN, pas une source : on y cherche des motifs et on ignore le reste.
    // C'est le bloc au vocabulaire le plus riche (« showed », « lost with », « folded before Flop »),
    // et y refuser l'inconnu ferait rater des mains pour rien — tout ce qu'il dit est déjà lu
    // ailleurs.
    const resumeLignes = parMarqueur.get('SUMMARY') ?? [];
    const potLigne = resumeLignes.find((l) => /^Total pot\b/i.test(l));
    const potTotal = potLigne ? lireMontant(potLigne.match(/^Total pot\s+(\S+)/i)?.[1] ?? '') : null;
    const rake = potLigne
      ? (/No rake/i.test(potLigne) ? 0 : lireMontant(potLigne.match(/Rake\s+(\S+)/i)?.[1] ?? ''))
      : null;
    const boardResumeLigne = resumeLignes.find((l) => /^Board\b/i.test(l));
    const boardResume = boardResumeLigne
      ? crochets(boardResumeLigne).flatMap((c) => lireCartes(c))
      : undefined;

    let sb: string | undefined;
    let bb: string | undefined;
    for (const ligne of resumeLignes) {
      // ⚠️ TOUTES les parenthèses, pas seulement la première : mesuré sur une vraie main
      // PokerStars, un siège peut en porter DEUX — « Seat 3: Hero (button) (small blind) » en
      // heads-up, où le bouton EST la petite blinde. Ne lire que la première perdait le témoin.
      const m = ligne.match(/^Seat \d+:\s+(.+?)\s+\(/);
      if (!m) continue;
      const mentions = [...ligne.matchAll(/\(([^)]*)\)/g)].map((x) => x[1].toLowerCase());
      if (mentions.includes('small blind')) sb = m[1];
      if (mentions.includes('big blind')) bb = m[1];
    }
    if (gains.length === 0) {
      // Deux écritures du gain dans un résumé : `won 514€` (Winamax) et `won ($20)` (Stars).
      for (const ligne of resumeLignes) {
        const m = ligne.match(/^Seat \d+:\s+(.+?)\s+.*\bwon\s+\(?(\S+?)\)?$/i);
        const montant = m ? lireMontant(m[2]) : null;
        if (m && montant != null) gains.push({ nom: m[1], montant });
      }
    }

    // ⚠️ LE DRAPEAU « is sitting out » NE VIT PAS AU MÊME ENDROIT D'UNE SALLE À L'AUTRE — mesuré le
    // 05/09/2026 sur de vraies mains Full Tilt, qui l'écrivent DANS LE RÉSUMÉ
    // (`Seat 2: ferdono is sitting out`) là où PokerStars le met sur la ligne de siège de l'en-tête.
    // Ne le chercher qu'en en-tête faisait lire une table de 4 pour 2 servis : le bouton y postait
    // alors la petite blinde sans être en heads-up, et le contrôle nº 2 refusait — à juste titre,
    // mais pour une main parfaitement lisible.
    //
    // Le nom se retrouve par la LISTE DES SIÈGES et non par une capture paresseuse : un nom peut
    // contenir des espaces (`Agent 00nix`), et le résumé n'a pas la parenthèse de tapis qui servait
    // de borne en en-tête. La règle des deux signaux ne bouge pas — ceci n'ajoute qu'une source au
    // premier d'entre eux.
    for (const ligne of resumeLignes) {
      if (!/\bis sitting out\b/i.test(ligne)) continue;
      const sansNumero = ligne.replace(/^Seat \d+:\s+/, '');
      const nom = noms.find((n) => sansNumero.startsWith(n));
      if (nom) assis.add(nom);
    }

    // ⚠️ UN JOUEUR VRAIMENT NON SERVI NE DOIT PAS OCCUPER UNE POSITION : le compter donnerait une
    // table de 6 pour 5 servis, donc de fausses positions POUR TOUT LE MONDE. Mais le seul drapeau
    // du fichier ne suffit pas à le dire (cf. plus haut). On exige donc DEUX signaux : le drapeau,
    // ET l'absence du nom partout ailleurs — pas une mise forcée, pas une action, pas un abattage,
    // pas un gain. Tout joueur réellement distribué a au moins une ligne, ne serait-ce que son
    // « folds ». Les deux se tromper en même temps est improbable, et les contrôles restent
    // derrière.
    const nommes = new Set<string>([
      ...misesForcees.map((m) => m.nom), ...actions.map((a) => a.nom),
      ...abattage.map((a) => a.nom), ...gains.map((g) => g.nom),
      ...(hero ? [hero.nom] : []),
    ]);
    const servis = sieges.filter((s) => !(assis.has(s.nom) && !nommes.has(s.nom)));
    if (servis.length === 0) refuser('pas-assez-de-joueurs', 'aucun joueur servi');

    return {
      dialecte: 'generique',
      // ⚠️ AUCUNE SALLE. Ce dialecte ne peut pas DÉCLARER ce qu'il lit — or la décision nº 4 du
      // 04/09 fait justement de cette déclaration la condition pour nommer le lieu : une salle
      // donne son nom, un OUTIL ne le donne à rien. Ne pouvant distinguer les deux, il se tait, et
      // le lieu reste vide plutôt que deviné. L'auteur peut le taper.
      salle: undefined,
      typePartie: tournoi ? 'tournoi' : 'cash',
      // Le montage a la table exacte des variantes ; on lui rend la forme qu'il connaît.
      variante: 'Holdem no limit',
      devise: tournoi ? undefined : (devise as MainLue['devise']),
      // Un en-tête PokerStars donne un NUMÉRO de tournoi, pas un nom d'épreuve : rien à mettre
      // dans le champ « Nom du tournoi ».
      nomTournoi: undefined,
      buyIn,
      niveau,
      sieges: servis,
      siegeBouton,
      hero,
      misesForcees,
      actions,
      board,
      boardResume,
      abattage,
      resume: {
        potTotal: potTotal ?? undefined,
        rake: rake ?? undefined,
        gains,
        nonSuiviAnnonce,
      },
      // On ne sait pas quelle convention de pot suit cette salle (cf. `EquationDuPot`) : le
      // contrôle nº 6 acceptera l'une ou l'autre.
      equationDuPot: 'inconnue',
      temoinPositions: { genre: 'blindes-nommees', sb, bb },
    };
  },
};

/**
 * Les verbes de la famille, et LEUR CONVENTION DE MONTANT.
 *   `calls 2`            → INCRÉMENT
 *   `bets 4`             → total de street (rien n'était misé avant)
 *   `raises 2 to 3`      → TOTAL, écrit après le « to »
 *
 * ⚠️ UN `raises X` SANS « to » EST REFUSÉ. Impossible de savoir s'il désigne l'incrément ou le
 * total, et se tromper d'un cran sur une relance change tout le déroulé. C'est exactement le genre
 * d'ambiguïté qu'il faut refuser plutôt que trancher au hasard : la clôture des tours le
 * rattraperait probablement, et « probablement » ne suffit pas quand il s'agit d'argent.
 */
function lireAction(nom: string, suite: string, rue: Street, ligne: string): ActionLue {
  const tapisAnnonce = /and is all-?in/i.test(suite) || undefined;
  const brut = suite.replace(/\s*and is all-?in\s*\.?\s*$/i, '');

  if (/^folds?\b/i.test(brut)) return { nom, rue, genre: 'fold' };
  if (/^checks?\b/i.test(brut)) return { nom, rue, genre: 'check' };

  // Le premier montant est FACULTATIF : Full Tilt écrit « raises to $8.05 » là où PokerStars écrit
  // « raises $2 to $3 ». C'est le mot « to » qui compte — c'est lui, et lui seul, qui dit que le
  // montant est un TOTAL de street et non un incrément.
  const relance = brut.match(/^raises?\s+(?:\S+\s+)?to\s+(\S+)/i);
  if (relance) {
    const montant = lireMontant(relance[1]);
    if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
    return { nom, rue, genre: 'raise', montant, montantEst: 'total', tapisAnnonce };
  }
  if (/^raises?\b/i.test(brut)) {
    refuser('ligne-incomprise', `relance sans « to », montant ambigu : « ${ligne} »`);
  }

  const simple = brut.match(/^(calls?|bets?)\s+(\S+)/i);
  if (simple) {
    const suivi = /^calls?$/i.test(simple[1]);
    const montant = lireMontant(simple[2]);
    if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
    return {
      nom, rue,
      genre: suivi ? 'call' : 'bet',
      montant,
      montantEst: suivi ? 'increment' : 'total',
      tapisAnnonce,
    };
  }
  return refuser('ligne-incomprise', `verbe inconnu : « ${ligne} »`);
}
