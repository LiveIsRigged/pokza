import type { Card, Street } from '../../types/poker';
import {
  cartesNeuves, crochets, lireCartes, lireMontant, refuser,
  type ActionLue, type CartesMontrees, type Dialecte, type MainLue, type MiseForceeLue, type SiegeLu,
} from '../formeNeutre';
import { deviseEcrite } from '../devise';
import { clefs, decouperEnBlocs } from '../blocs';

/**
 * BETCLIC — UN DIALECTE RECONNAISSABLE SANS QUE LA SALLE SOIT NOMMABLE.
 * ═══════════════════════════════════════════════════════════════════
 * Le fichier n'écrit nulle part « Betclic ». Sa signature — `GAME #… Version:23.1.1.1
 * Uncalled:Y` — est parfaite mais ANONYME, et le même logiciel peut servir plusieurs salles.
 * D'où `salle: undefined` : le champ « Lieu » restera VIDE plutôt que deviné (3e cas de la
 * décision nº 4 du 04/09). Le nom du dialecte est un nom de code interne, pas une affirmation.
 *
 * ⚠️⚠️ LA MAIN QUI A RÉVÉLÉ LA LIMITE DES CONTRÔLES. Betclic écrit des `€` SUR DES JETONS DE
 * TOURNOI : `(€200.00 in chips)`, `Post SB €10.00`, `Total pot €400.00`. Lu naïvement, ça donne
 * un cash game à 10/20 € avec 200 € de tapis — et LES SIX CONTRÔLES PASSENT, parce que cette
 * lecture est parfaitement cohérente ; seul son SENS est faux. C'est pourquoi le type de partie se
 * lit ici, dans l'en-tête, AVANT le moindre montant, et décide de ce que les montants veulent dire.
 */

const MARQUEURS = clefs('HOLE CARDS', 'FLOP', 'TURN', 'RIVER', 'SUMMARY');
const SIGNATURE = /^GAME #\d+\s+Version:/m;

const RUES: { marqueur: string; rue: Street; cartes: number }[] = [
  // Betclic n'a AUCUN marqueur de préflop : les actions préflop vivent dans le bloc des cartes
  // fermées, juste après `Dealt to`.
  { marqueur: 'HOLE CARDS', rue: 'preflop', cartes: 0 },
  { marqueur: 'FLOP', rue: 'flop', cartes: 3 },
  { marqueur: 'TURN', rue: 'turn', cartes: 1 },
  { marqueur: 'RIVER', rue: 'river', cartes: 1 },
];

export const betclic: Dialecte = {
  id: 'betclic',

  reconnait: (texte) => SIGNATURE.test(texte),

  decoupe: (texte) =>
    texte
      .split(/(?=^GAME #\d+\s+Version:)/m)
      .map((t) => t.trim())
      .filter((t) => SIGNATURE.test(t)),

  lit(texte): MainLue {
    const { entete, parMarqueur, apresMarqueur } = decouperEnBlocs(texte.split('\n'), MARQUEURS);

    // ─── L'en-tête, ET LE TYPE DE PARTIE AVANT TOUT LE RESTE ──────────────────────────────────
    const premiere = entete.find((l) => /^GAME #/.test(l)) ?? '';
    const descripteur = premiere.match(/^GAME #\S+\s+Version:\S+(?:\s+\S+:\S+)*\s+(.+?)\s+\d{4}-\d{2}-\d{2}/)?.[1] ?? '';
    // `Texas Hold'em NL  Tournament` (double espace là où les enjeux s'écriraient en cash) contre
    // `Texas Hold'em NL €5/€10`.
    const tournoi = /\bTournament\b/.test(descripteur);
    const enjeux = tournoi ? '' : (descripteur.match(/\s(\S*\d\S*)$/)?.[1] ?? '');
    const variante = descripteur.replace(/\bTournament\b/, '').replace(enjeux, '').trim();

    // ⚠️ LA LIGNE `Table Info: Size: 5, Blinds: 5/10` N'EST PAS LUE, ET C'EST VOULU.
    //   • `Size` est la CAPACITÉ de la table (5-max, sièges impairs 1/3/5/7/9), pas le nombre de
    //     joueurs distribués — celui-ci se compte sur les lignes `Seat N:`, jamais ailleurs.
    //   • `Blinds: 10/20` ne se lit pas davantage : les mises forcées se lisent dans les lignes
    //     `Post`, où elles sont NOMMÉES. Un en-tête peut mentir, une ligne nommée non.
    const tournoiInfo = entete.map((l) => l.match(/\(Tournament:\s*(.+?)\s+Buy-In:\s*(.+?)\)/)).find(Boolean);

    const sieges: SiegeLu[] = [];
    let siegeBouton = -1;
    for (const ligne of entete) {
      const m = ligne.match(/^Seat (\d+):\s+(.+?)\s+\(([^)]*)\)\s*(DEALER)?\s*$/);
      if (!m) continue;
      const tapis = lireMontant(m[3]);
      if (tapis == null) refuser('ligne-incomprise', `tapis illisible : « ${ligne} »`);
      const numero = parseInt(m[1], 10);
      sieges.push({ numero, nom: m[2], tapis });
      // Le bouton est un SUFFIXE de la ligne de siège, pas une ligne à lui.
      if (m[4]) siegeBouton = numero;
    }
    if (sieges.length === 0) refuser('pas-assez-de-joueurs', "aucune ligne « Seat N: »");
    if (siegeBouton < 0) refuser('bouton-introuvable', "aucun siège marqué « DEALER »");

    const noms = sieges.map((s) => s.nom).sort((a, b) => b.length - a.length);
    const quelNom = (ligne: string) => noms.find((n) => ligne.startsWith(`${n}:`));

    const misesForcees: MiseForceeLue[] = [];
    const actions: ActionLue[] = [];
    const abattage: CartesMontrees[] = [];
    const gains: { nom: string; montant: number }[] = [];
    let hero: MainLue['hero'];

    /** Les lignes qui n'appartiennent à aucune street : mises forcées, cartes du héros, abattage. */
    const lireLigneHorsRue = (ligne: string): boolean => {
      const dealt = ligne.match(/^Dealt to (.+?)\s*(\[[^\]]*\])\s*$/);
      if (dealt) {
        hero = { nom: dealt[1], cartes: crochets(dealt[2]).flatMap((c) => lireCartes(c)) };
        return true;
      }
      const nom = quelNom(ligne);
      if (!nom) return false;
      const reste = ligne.slice(nom.length + 1).trim();

      const poste = reste.match(/^Post\s+(SB|BB|Ante)\s+(\S+)/i);
      if (poste) {
        const montant = lireMontant(poste[2]);
        if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
        const clef = poste[1].toUpperCase();
        misesForcees.push({ nom, genre: clef === 'SB' ? 'sb' : clef === 'BB' ? 'bb' : 'ante', montant });
        return true;
      }
      // On n'invente aucune tournure de mise forcée qu'on n'a pas mesurée (un straddle, une
      // blinde morte) : mieux vaut refuser la main que la lire de travers.
      if (/^Post\b/i.test(reste)) {
        refuser('mise-forcee-inconnue', `mise forcée inconnue : « ${ligne} »`);
      }

      // ⚠️ `Shows` ≠ `Mucks`. Seul `Shows` alimente les cartes révélées : un `Mucks` d'adversaire
      // montrerait dans le replayer des cartes que PERSONNE n'a vues à table. Celles du héros
      // arrivent par `Dealt to`, jamais par son propre `Mucks`.
      const montre = reste.match(/^Shows\s+(\[[^\]]*\])/i);
      if (montre) {
        abattage.push({ nom, cartes: crochets(montre[1]).flatMap((c) => lireCartes(c)) });
        return true;
      }
      if (/^Mucks\b/i.test(reste)) return true;

      const gagne = reste.match(/^wins\s+(\S+)/i);
      if (gagne) {
        const montant = lireMontant(gagne[1]);
        if (montant != null) gains.push({ nom, montant });
        return true;
      }
      return false;
    };

    for (const ligne of entete) {
      if (!ligne.trim() || /^(GAME #|Table)/.test(ligne) || /^Seat \d+:/.test(ligne)) continue;
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
        actions.push(lireAction(nom!, ligne.slice(nom!.length + 1).trim(), rue, ligne));
      }
    }

    // ─── Le résumé ────────────────────────────────────────────────────────────────────────────
    const resumeLignes = parMarqueur.get('SUMMARY') ?? [];
    for (const ligne of resumeLignes) {
      if (!ligne.trim() || /^Total pot/.test(ligne)) continue;
      if (!lireLigneHorsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
    }
    const potLigne = resumeLignes.find((l) => /^Total pot/.test(l));
    const pot = potLigne?.match(/^Total pot\s+(\S+)(?:\s+Rake\s+(\S+))?/);

    return {
      dialecte: 'betclic',
      // Aucune salle : la signature est anonyme (cf. l'en-tête de ce fichier).
      salle: undefined,
      typePartie: tournoi ? 'tournoi' : 'cash',
      variante,
      devise: tournoi ? undefined : (deviseEcrite(enjeux) as MainLue['devise']),
      nomTournoi: tournoiInfo?.[1],
      // ⚠️ LE SEUL ENDROIT D'UNE MAIN DE TOURNOI OÙ UN `€` NE MENT PAS : le buy-in est de
      // l'argent réel, là où les tapis et le pot sont des jetons.
      buyIn: tournoiInfo?.[2],
      // Betclic n'écrit AUCUN niveau de blindes.
      niveau: undefined,
      sieges,
      siegeBouton,
      hero,
      misesForcees,
      actions,
      board,
      // Betclic n'a AUCUN `Board:` de résumé pour servir de témoin — l'assemblage street par
      // street est sa seule source, ce qui rend le contrôle de clôture d'autant plus utile.
      boardResume: undefined,
      abattage,
      resume: {
        potTotal: pot ? (lireMontant(pot[1]) ?? undefined) : undefined,
        rake: pot?.[2] ? (lireMontant(pot[2]) ?? undefined) : undefined,
        gains,
      },
      // Mesuré : 210 − 75 (non suivi) − 2,50 = 132,50. Betclic SORT la mise non suivie du total,
      // contrairement à Winamax. Hypothèse non vérifiée : c'est ce que déclare le drapeau
      // `Uncalled:Y` de l'en-tête — on n'a jamais vu de `:N`. Si un tel fichier existe et que la
      // convention y change, le contrôle du pot REFUSERA la main au lieu de publier un faux.
      equationDuPot: 'somme-moins-non-suivi-moins-rake',
      // Le bloc des sièges est écrit dans l'ORDRE DE PAROLE PRÉFLOP, pas dans l'ordre des
      // numéros — vérifié sur les 3 mains Betclic du corpus. C'est une contre-épreuve gratuite
      // sur la lecture du bouton, la seule donnée dont tout le placement dépend.
      temoinPositions: { genre: 'ordre-de-parole' },
    };
  },
};

/**
 * Un verbe Betclic, et SA CONVENTION DE MONTANT — qui n'est PAS uniforme par salle :
 *   `Call €10.00`        → INCRÉMENT
 *   `Bet €45.00`         → total de street
 *   `Raise (NF) €202.75` → TOTAL (prouvé : c'était le tapis exact du joueur ; un incrément
 *                          aurait débordé). Le sens de `(NF)` reste inconnu — on tolère la
 *                          parenthèse plutôt que d'en dépendre.
 *   `Allin €180.00`      → INCRÉMENT (20 de BB + 180 = 200, son tapis exact)
 *
 * Betclic n'écrit jamais « and is all-in » : le tapis se DÉDUIT de l'épuisement du tapis, ce que
 * Pokza fait déjà (il n'a pas de type « tapis » non plus).
 */
function lireAction(nom: string, reste: string, rue: Street, ligne: string): ActionLue {
  if (/^Fold\b/i.test(reste)) return { nom, rue, genre: 'fold' };
  if (/^Check\b/i.test(reste)) return { nom, rue, genre: 'check' };

  const m = reste.match(/^(Call|Bet|Raise|Allin)\b(?:\s*\([^)]*\))?\s+(\S+)/i);
  if (!m) refuser('ligne-incomprise', `verbe inconnu : « ${ligne} »`);
  const montant = lireMontant(m![2]);
  if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);

  switch (m![1].toLowerCase()) {
    case 'call': return { nom, rue, genre: 'call', montant, montantEst: 'increment' };
    case 'bet': return { nom, rue, genre: 'bet', montant, montantEst: 'total' };
    case 'raise': return { nom, rue, genre: 'raise', montant, montantEst: 'total' };
    // Le texte dit « à tapis » sans dire suivre ni relancer : c'est le MONTAGE qui tranche,
    // d'après le total obtenu.
    default: return { nom, rue, genre: 'tapis', montant, montantEst: 'increment', tapisAnnonce: true };
  }
}
