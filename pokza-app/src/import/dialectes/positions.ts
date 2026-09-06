import type { Card, Street } from '../../types/poker';
import {
  lireCartes, lireMontant, refuser,
  type ActionLue, type CartesMontrees, type Dialecte, type MainLue, type MiseForceeLue, type SiegeLu,
} from '../formeNeutre';
import { clefs, decouperEnBlocs } from '../blocs';

/**
 * LA NOTATION PAR POSITIONS — CELLE DES OUTILS DE SUIVI, PAS D'UNE SALLE.
 * ═════════════════════════════════════════════════════════════════════
 * Tout ce qui précède décrit une TABLE : des numéros de siège, un bouton quelque part, des pseudos.
 * Cette notation-ci décrit une MAIN : les sièges SONT les positions, et il n'y a ni numéro, ni
 * bouton, ni nom de table.
 *
 *     *** SEAT DRAW ***
 *     SB: Hero c/AhJd s/2000
 *     BB: Unknown
 *     …
 *     BU: Vilain s/2000
 *     *** PREFLOP ***
 *     SB: post SB 2
 *     BU: raise 30
 *     SB: raise 130
 *
 * ⚠️ C'EST UN OUTIL, PAS UNE SALLE — ET UN OUTIL NE DONNE SON NOM À RIEN (décision nº 4 du 04/09,
 * confirmée par Victor le 05/09 : « intègre-le, mais sans le nommer »). D'où `salle: undefined` : le
 * champ « Lieu » reste VIDE, et la main s'affichera « importée » tout court. Le dialecte lui-même
 * est nommé d'après sa NOTATION et non d'après le produit qui l'écrit — ce qui est de toute façon la
 * règle du chantier (« un dialecte se reconnaît à sa notation, pas au nom du site ») et vaudra pour
 * le prochain outil qui écrira pareil.
 *
 * ═══ CE QUE CETTE NOTATION DONNE, ET CE QU'ELLE ENLÈVE ═══
 * ELLE DONNE le placement. Partout ailleurs, tout dépend d'une seule donnée — quel siège porte le
 * bouton — que rien d'autre ne dit ; ici elle est écrite. On n'a donc rien à déduire : il suffit de
 * fabriquer des numéros de siège qui, passés dans l'anneau du montage, redonnent ces positions-là.
 * Aucune ligne de logique partagée ne bouge.
 *
 * ⚠️ ET ELLE N'EST PAS TRIVIALEMENT VRAIE POUR AUTANT : c'est l'ORDRE des lignes du tirage qui fait
 * l'anneau (de la SB au bouton), et le contrôle nº 2 le vérifie — si cet ordre n'était pas celui de
 * la table, la petite blinde tomberait sur un autre siège que « SB » et la main serait refusée.
 *
 * ELLE ENLÈVE trois choses, et il faut le savoir :
 *   • LES TAPIS. Seuls les sièges que l'auteur a annotés portent un `s/` — les autres n'ont RIEN.
 *     Ils reçoivent le stack effectif, exactement comme un siège non renseigné du formulaire
 *     (cf. `buildSeats`) : ce n'est pas une invention, c'est le défaut que Pokza applique déjà à une
 *     main saisie à la main. Mais le contrôle nº 4 n'a alors plus rien à mordre sur ces sièges.
 *   • LA DEVISE. Aucun signe, aucun code : les montants sont nus. `devise` reste absente, et
 *     l'affichage retombe sur l'euro (cf. `devise()`), corrigible par l'auteur.
 *   • LE TYPE DE PARTIE. Rien ne distingue le cash du tournoi. Les trois mains mesurées sont du cash
 *     (l'une porte même un straddle, qui n'existe qu'en cash), et c'est la lecture retenue. ⚠️ C'est
 *     le trou connu de ce dialecte, et il est du même genre que celui qui a fait écarter WinningPoker
 *     — la différence est qu'ici l'intégration est une demande explicite de Victor.
 */

const MARQUEURS = clefs('COMMUNITY CARDS', 'SEAT DRAW', 'PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOW DOWN');

/** `*** SEAT DRAW ***` : aucune autre notation mesurée n'a ce marqueur, et il est structurel. */
const SIGNATURE = /^\*\*\*\s*SEAT DRAW\s*\*\*\*\s*$/m;

/** Le bouton, tel que cette notation le nomme. C'est le seul libellé dont le SENS nous importe :
 *  il fixe l'origine de l'anneau. Tous les autres restent des clefs opaques. */
const BOUTON = 'BU';

const RUES: { marqueur: string; rue: Street; cartes: number }[] = [
  { marqueur: 'PREFLOP', rue: 'preflop', cartes: 0 },
  { marqueur: 'FLOP', rue: 'flop', cartes: 3 },
  { marqueur: 'TURN', rue: 'turn', cartes: 1 },
  { marqueur: 'RIVER', rue: 'river', cartes: 1 },
];

export const positions: Dialecte = {
  id: 'positions',

  reconnait: (texte) => SIGNATURE.test(texte),

  decoupe: (texte) =>
    texte
      .split(/(?=^\*\*\*\s*COMMUNITY CARDS\s*\*\*\*\s*$)/m)
      .map((t) => t.trim())
      .filter((t) => SIGNATURE.test(t)),

  lit(texte): MainLue {
    const { parMarqueur } = decouperEnBlocs(texte.split('\n'), MARQUEURS);

    // ─── Les sièges : ce sont les positions, dans l'ordre de la table ─────────────────────────
    const tirage = (parMarqueur.get('SEAT DRAW') ?? []).filter((l) => l.trim());
    if (tirage.length < 2) refuser('pas-assez-de-joueurs', `${tirage.length} ligne(s) de tirage`);

    /** Un siège lu : son libellé, et ce que la ligne en dit de plus. */
    const lus: { libelle: string; tapis?: number; cartes?: Card[]; heros: boolean }[] = [];
    for (const ligne of tirage) {
      const m = ligne.match(/^(\S*):\s*(.*)$/);
      if (!m) refuser('ligne-incomprise', `ligne de tirage incomprise : « ${ligne} »`);
      const reste = m![2].trim();
      // ⚠️ LE LIBELLÉ SANS POSITION EST UN SIÈGE QUI N'EST PAS DANS LA MAIN — mesuré : une main de
      // tournoi ouvre son tirage par « : Unknown », sans le moindre libellé, et ce siège n'agit
      // JAMAIS de toute la main. Le compter décalerait tout l'anneau d'un cran (8 places lues pour
      // 7 joueurs, l'ordre de parole du fichier ne tomberait plus).
      if (!m![1].trim()) continue;
      // ⚠️ LE PSEUDO N'EST PAS LU, ET C'EST HEUREUX : cette notation en met un par siège
      // (`Unknown` la plupart du temps), et plusieurs sièges portent donc LE MÊME. Lus comme des
      // noms, ils feraient refuser la main en doublon — alors qu'aucun pseudo n'est importé de
      // toute façon (décision nº 1 du 04/09). Le libellé de position fait la clef, et il est unique.
      //
      // `c/` = les cartes du HÉROS, `h/` = une main adverse que l'outil connaît, `s/` = le tapis.
      const propre = (p: string) => reste.match(new RegExp(`(?:^|\\s)${p}/(\\S+)`))?.[1];
      const tapis = propre('s') ? lireMontant(propre('s')!) ?? undefined : undefined;
      lus.push({
        libelle: m![1],
        tapis,
        cartes: propre('c') ? lireCartes(decouper(propre('c')!)) : undefined,
        // ⚠️ LE HÉROS SE RECONNAÎT À SON LIBELLÉ DE JOUEUR, ET C'EST UNE CORRECTION PAYÉE.
        // J'avais lu `c/` comme « les cartes du héros », parce que les trois premières mains
        // mesurées n'en portaient qu'un, toujours sur `Hero`. Une main de tournoi en porte QUATRE :
        // `c/` veut seulement dire « cartes connues », et l'outil en connaît autant que l'auteur en
        // a noté. Le seul signal du point de vue est donc le libellé `Hero` — celui-là même qu'on
        // n'importe jamais (aucun pseudo n'entre dans Pokza, décision nº 1 du 04/09) : on le lit
        // pour savoir OÙ est l'auteur, pas pour l'écrire.
        heros: /(?:^|\s)Hero(?:$|\s)/.test(reste),
      });
    }

    const libelles = lus.map((s) => s.libelle);
    if (new Set(libelles).size !== libelles.length) {
      refuser('noms-en-double', 'deux sièges portent le même libellé de position');
    }
    const rangBouton = libelles.indexOf(BOUTON);
    if (rangBouton < 0) refuser('bouton-introuvable', `aucun siège « ${BOUTON} » dans le tirage`);

    /**
     * L'ANNEAU, DEPUIS LE BOUTON — et des numéros de siège FABRIQUÉS pour que le montage retrouve
     * exactement ces positions-là.
     *
     * Le montage trie les sièges par numéro, tourne jusqu'au bouton, et applique
     * `anneauDepuisLeBouton` (BTN, SB, BB, UTG, …). Il suffit donc de numéroter 1..n dans l'ordre
     * de l'anneau en commençant au bouton : rien de la logique partagée ne change.
     *
     * ⚠️ ET LES LIBELLÉS NE SONT JAMAIS TRADUITS. Cette notation numérote ses UTG à partir de 1
     * (`UTG1` est le premier parleur) là où Pokza part de zéro (`UTG`), et elle a un `MP` que Pokza
     * appelle `UTG3`. Une table de correspondance serait à refaire à chaque nombre de joueurs et se
     * tromperait un jour ; l'ORDRE, lui, suffit et ne peut pas se tromper.
     */
    const anneau = [...lus.slice(rangBouton), ...lus.slice(0, rangBouton)];
    const sieges: SiegeLu[] = anneau.map((s, i) => ({
      numero: i + 1,
      nom: s.libelle,
      // ⚠️ 0 vaut « non déclaré » : `buildSeats` retombe alors sur le stack effectif, comme pour un
      // siège vide du formulaire. Le montage prend le PLUS PETIT tapis pour stack effectif, et un 0
      // le ferait tomber à zéro — d'où le repli sur le plus grand tapis déclaré.
      tapis: s.tapis ?? 0,
    }));
    // LE POINT DE VUE D'ABORD : c'est le manque le plus fondamental, et le plus fréquent. Cette
    // notation sert aussi à noter des mains OBSERVÉES — l'auteur y connaît les cartes de plusieurs
    // joueurs sans être aucun d'eux. Une telle main est parfaitement lisible, simplement sans
    // point de vue, et Pokza n'a alors personne à désigner.
    const heros = anneau.filter((s) => s.heros);
    if (heros.length !== 1) {
      refuser('hero-introuvable',
        heros.length === 0
          ? "aucun siège n'est marqué « Hero » : main observée ?"
          : `${heros.length} sièges sont marqués « Hero »`);
    }
    // ⚠️ ET SES CARTES DOIVENT ÊTRE COMPLÈTES. Cette notation écrit `Xx` pour une carte inconnue
    // (mesuré : `c/7dXx`), et `lireCarte` la laisse tomber — ce qui est juste. Mais on ne publie pas
    // la main de quelqu'un qui ne connaîtrait pas ses propres cartes.
    if ((heros[0].cartes ?? []).length !== 2) {
      refuser('hero-introuvable',
        `le siège « ${heros[0].libelle} » est marqué Hero mais ses deux cartes ne se lisent pas`);
    }

    const declares = anneau.map((s) => s.tapis).filter((t): t is number => t != null && t > 0);
    if (declares.length === 0) {
      // Aucun `s/` nulle part : Pokza afficherait un tapis qu'aucune ligne ne dit. Refuser vaut
      // mieux qu'un nombre inventé sur la table.
      refuser('ligne-incomprise', "aucun tapis n'est déclaré dans le tirage");
    }
    const parDefaut = Math.min(...declares);
    for (const s of sieges) if (s.tapis === 0) s.tapis = parDefaut;

    // ─── Les actions ──────────────────────────────────────────────────────────────────────────
    const connus = new Set(libelles);
    const misesForcees: MiseForceeLue[] = [];
    const actions: ActionLue[] = [];
    const abattage: CartesMontrees[] = [];
    const gains: { nom: string; montant: number }[] = [];

    /** Une ligne d'abattage ou de gain, quelle que soit la street où elle traîne. */
    const lireHorsRue = (nom: string, reste: string, ligne: string): boolean => {
      const montre = reste.match(/^shows\s+(\S+)/i);
      if (montre) {
        abattage.push({ nom, cartes: lireCartes(decouper(montre[1])) });
        return true;
      }
      // ⚠️ `mucked` NE RÉVÈLE RIEN, même quand le tirage connaît les cartes du joueur (mesuré : un
      // siège porte `c/Tc9c` et se couche à l'abattage). C'est toute la différence entre ce que
      // l'outil SAIT et ce que la table a VU — montrer les secondes serait raconter une autre main.
      if (/^mucked?\b/i.test(reste)) return true;
      const gagne = reste.match(/^won\s+(\S+)/i);
      if (gagne) {
        const montant = lireMontant(gagne[1]);
        if (montant == null) refuser('ligne-incomprise', `gain illisible : « ${ligne} »`);
        gains.push({ nom, montant: montant! });
        return true;
      }
      return false;
    };

    const board: Card[] = [];
    // ⚠️ LES CARTES COMMUNES SONT DONNÉES EN BLOC, EN TÊTE DE FICHIER (`8h7h6dKc3h`), collées et
    // toutes les cinq d'un coup — pas street par street comme partout ailleurs. On ne prend donc
    // que celles des streets RÉELLEMENT ANNONCÉES, jamais les cinq d'office : le fichier écrit le
    // board complet même quand la main s'arrête avant.
    const communes = lireCartes(decouper((parMarqueur.get('COMMUNITY CARDS') ?? []).join('')));

    for (const { marqueur, rue, cartes } of RUES) {
      const bloc = parMarqueur.get(marqueur);
      if (!bloc) continue;
      if (cartes > 0) {
        const prises = board.length;
        if (communes.length < prises + cartes) {
          refuser('ligne-incomprise',
            `${marqueur} : ${communes.length} carte(s) commune(s) pour ${prises + cartes} attendue(s)`);
        }
        board.push(...communes.slice(prises, prises + cartes));
      }
      for (const ligne of bloc) {
        if (!ligne.trim()) continue;
        const m = ligne.match(/^(\S+):\s*(.+)$/);
        if (!m || !connus.has(m[1])) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
        const nom = m![1];
        const reste = m![2].trim();
        if (lireHorsRue(nom, reste, ligne)) continue;

        const poste = reste.match(/^post\s+(SB|BB|TB)\s+(\S+)/i);
        if (poste) {
          const montant = lireMontant(poste[2]);
          if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
          const quoi = poste[1].toUpperCase();
          // `TB` = le straddle de cette notation (mesuré : blindes 2/4, `post TB 8` par le premier
          // parleur — deux fois la grosse blinde, à la place exacte d'un straddle).
          misesForcees.push({
            nom, montant: montant!,
            genre: quoi === 'SB' ? 'sb' : quoi === 'BB' ? 'bb' : 'straddle',
          });
          continue;
        }
        if (/^post\b/i.test(reste)) {
          refuser('mise-forcee-inconnue', `mise forcée inconnue : « ${ligne} »`);
        }
        actions.push(lireAction(nom, reste, rue, ligne));
      }
    }

    for (const ligne of parMarqueur.get('SHOW DOWN') ?? []) {
      if (!ligne.trim()) continue;
      const m = ligne.match(/^(\S+):\s*(.+)$/);
      if (!m || !connus.has(m[1]) || !lireHorsRue(m[1], m[2].trim(), ligne)) {
        refuser('ligne-incomprise', `ligne d'abattage incomprise : « ${ligne} »`);
      }
    }

    return {
      dialecte: 'positions',
      // Un OUTIL ne donne son nom à rien : le lieu restera vide (cf. l'en-tête de ce fichier).
      salle: undefined,
      // ⚠️ RIEN NE DISTINGUE LE CASH DU TOURNOI dans cette notation — trou connu, assumé, et
      // documenté en tête de fichier. Les trois mains mesurées sont du cash, dont une à straddle.
      typePartie: 'cash',
      variante: 'Holdem no limit',
      // Aucune devise n'est écrite : les montants sont nus.
      devise: undefined,
      sieges,
      // Fabriqué : le bouton est le premier de l'anneau, par construction.
      siegeBouton: 1,
      hero: { nom: heros[0].libelle, cartes: heros[0].cartes! },
      misesForcees,
      actions,
      board,
      boardResume: undefined,
      abattage,
      resume: {
        // Aucun « Total pot », aucun rake : l'outil n'en écrit pas. Reste la borne
        // « encaissé ≤ misé » et la confrontation des gagnants.
        potTotal: undefined,
        rake: undefined,
        gains,
      },
      // Mesuré sur deux mains : `won` = Σ des contributions, mise non suivie COMPRISE et rake
      // ignoré (1155 = 1155 sur la première, 423 + 423 = 846 sur le pot partagé).
      equationDuPot: 'somme-moins-rake',
      /**
       * ⚠️ ON LE DIT À CHAQUE IMPORT, et c'est Victor qui l'a tranché le 06/09/2026 : « oui, par
       * défaut cash game, mais dire au joueur que le format ne le dit pas — il peut ensuite le
       * modifier si c'est une main de tournoi ».
       *
       * MESURÉ, PAS SUPPOSÉ : sa propre main de TOURNOI de cette notation ne porte AUCUN signe
       * qu'elle en est une — mêmes blindes (2/5) que sa main de cash, aucun ante, aucun niveau,
       * aucun buy-in, aucune devise. C'est lui qui a dû me le dire ; le fichier se tait.
       *
       * Le défaut est donc cash, et l'auteur est prévenu. C'est le seul endroit du chantier où on
       * PUBLIE une lecture qu'on sait possiblement fausse — et c'est tenable précisément parce
       * qu'on la nomme : le type de partie se corrige à l'étape 1 sans rien perdre du déroulé
       * (cf. `invalidation.ts`). Un refus, lui, aurait fermé la notation entière.
       */
      avertissements: ['ce format ne dit pas si la main est un cash game ou un tournoi :'
        + ' Pokza a lu du cash game'],
      // Le placement ne se DÉDUIT pas ici, il est écrit : aucun témoin indépendant à confronter.
      // Le contrôle nº 2 garde sa contre-épreuve universelle, et elle porte — c'est elle qui
      // vérifie que l'ordre des lignes du tirage est bien celui de la table.
      temoinPositions: undefined,
    };
  },
};

/** `AhJd` → `Ah Jd` : cette notation colle ses cartes, deux caractères par carte. */
function decouper(colle: string): string {
  return (colle.replace(/[^0-9A-Za-z]/g, '').match(/.{1,2}/g) ?? []).join(' ');
}

/**
 * Un verbe de cette notation, et sa convention : **des TOTAUX de street**, tous.
 *
 * C'est l'inverse de la famille partypoker, et ça se prouve par l'arithmétique d'une vraie main
 * (blindes 2/5) :
 *     `BU: raise 30` · `SB: raise 130` · `BU: call 130`
 * La SB a 2 en jeu. En incrément elle serait à 132, et le suivi de 130 du bouton ne fermerait pas
 * le tour. En total, les deux sont à 130 — et le pot recoupe le gain annoncé au jeton (1155).
 */
function lireAction(nom: string, reste: string, rue: Street, ligne: string): ActionLue {
  if (/^fold\b/i.test(reste)) return { nom, rue, genre: 'fold' };
  if (/^check\b/i.test(reste)) return { nom, rue, genre: 'check' };

  const m = reste.match(/^(call|bet|raise)\s+(\S+)/i);
  if (!m) refuser('ligne-incomprise', `verbe inconnu : « ${ligne} »`);
  const montant = lireMontant(m![2]);
  if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
  return { nom, rue, genre: m![1].toLowerCase() as 'call' | 'bet' | 'raise', montant: montant!, montantEst: 'total' };
}
