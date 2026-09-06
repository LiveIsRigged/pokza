import type { Card, Street } from '../../types/poker';
import {
  cartesNeuves, crochets, lireCartes, lireMontant, refuser,
  type ActionLue, type CartesMontrees, type Dialecte, type MainLue, type MiseForceeLue, type SiegeLu,
} from '../formeNeutre';
import { deviseDeclaree, deviseEcrite } from '../devise';
import { MARQUEUR_DEUX_ETOILES, clefs, decouperEnBlocs } from '../blocs';

/**
 * LA FAMILLE PARTYPOKER / 888 — LA SECONDE GRANDE FAMILLE DES FORMATS TEXTE.
 * ════════════════════════════════════════════════════════════════════════
 * Presque tout ce qui n'est pas PokerStars et n'est pas du XML est ICI : partypoker, 888poker, et
 * les habillages qui tournent sur le même logiciel (`LuckyAcePoker.com`, `Cassava` — le second est
 * la maison mère de 888, et aucun des deux n'aurait pu être deviné). Une seule grammaire, deux
 * salles majeures : c'est le meilleur rapport d'un dialecte de ce chantier.
 *
 * TOUT Y DIFFÈRE DE LA FAMILLE POKERSTARS, et c'est pour ça qu'elle a besoin de son dialecte :
 *   • les marqueurs ont DEUX astérisques (`** Dealing Flop **`), l'en-tête en a CINQ ;
 *   • les montants vivent entre CROCHETS (`calls [$0.02 USD]`), là où les crochets de l'autre
 *     famille ne portent que des cartes ;
 *   • les cartes du board sont séparées par des VIRGULES (`[ Kc, 9s, Jd ]`) ;
 *   • le bouton s'annonce sans dièse (`Seat 6 is the button`) ;
 *   • et il n'y a NI « Total pot » NI ligne de rake — voir plus bas ce que ça coûte.
 *
 * ⚠️⚠️ LE PIÈGE PRINCIPAL, ET IL EST RÉSOLU PAR L'ARITHMÉTIQUE : `raises [$0.70]` N'A PAS DE « to ».
 * La grammaire générique REFUSE cette tournure, faute de pouvoir dire si le nombre est un total de
 * street ou un incrément — et elle a raison de refuser, parce que les deux lectures sont
 * plausibles. Ici on ne devine pas, on MESURE, sur une main réelle à deux joueurs (blindes
 * 0,05/0,10) :
 *
 *      A poste 0,05 (SB) · A raises [0,25] · B raises [0,70] · A calls [0,50]
 *
 *   — en TOTAL     : A à 0,25, B à 0,70 → A doit 0,45 pour suivre, or il suit 0,50. ✗
 *   — en INCRÉMENT : A à 0,30, B à 0,80 → A doit 0,50 pour suivre, et il suit 0,50. ✓
 *
 * Et l'incrément se compte sur ce que le joueur a DÉJÀ MIS SUR LA STREET, pas au-dessus de la mise
 * adverse — la relance suivante le confirme au centime (0,80 misé + 2,94 poussés = 5,34 au pot,
 * moins 5 % de rake sur le pot suivi = 5,18, exactement le gain annoncé). Chaque nombre de cette
 * famille est donc DES JETONS POUSSÉS, verbe par verbe, sans exception : c'est la règle la plus
 * courte qui rende compte de tout ce qu'on a mesuré.
 *
 * ⚠️ CE QUE CETTE FAMILLE NE DONNE PAS : ni « Total pot », ni rake. Le contrôle nº 6 perd donc son
 * équation exacte et ne garde que les GAGNANTS (leur identité et leurs proportions) plus la borne
 * ajoutée pour l'occasion : ce qui est encaissé ne peut pas dépasser ce qui a été misé. Les
 * contrôles nº 1 à nº 5 sont intacts — et le nº 5, la clôture des tours, est justement celui qui
 * n'a jamais eu besoin d'un résumé.
 */

const MARQUEURS = clefs('Dealing down cards', 'Dealing Flop', 'Dealing Turn', 'Dealing River', 'Summary');

/**
 * LA SIGNATURE — et elle donne le nom de la salle EN PRIME, dans son groupe de capture.
 *
 * C'est une règle, pas une liste : `***** 888poker Hand History for Game N *****` se nomme,
 * `***** Hand History for Game N *****` (partypoker) ne se nomme pas. Aucun nom n'est codé en dur,
 * et c'est ce qui a fait apparaître tout seuls `LuckyAcePoker.com` et `Cassava` — deux habillages
 * qu'aucune liste écrite d'avance n'aurait contenus. Conforme à la décision nº 4 du 04/09 : une
 * salle qui se nomme donne son nom au lieu, un fichier anonyme ne le donne à rien.
 */
const SIGNATURE = /^\uFEFF?\*{4,}\s*(.*?)\s*Hand History for Game\s+\S+\s*\*{4,}\s*$/m;

const RUES: { marqueur: string; rue: Street; cartes: number }[] = [
  // Aucun marqueur de préflop à part la distribution : les actions préflop vivent dans le bloc des
  // cartes fermées, juste après `Dealt to` — comme chez Betclic.
  { marqueur: 'Dealing down cards', rue: 'preflop', cartes: 0 },
  { marqueur: 'Dealing Flop', rue: 'flop', cartes: 3 },
  { marqueur: 'Dealing Turn', rue: 'turn', cartes: 1 },
  { marqueur: 'Dealing River', rue: 'river', cartes: 1 },
];

/** Les variantes acceptées, dans les DEUX ordres que la famille emploie : `USD NL Texas Hold'em`
 *  (partypoker) et `Blinds No Limit Holdem` (888). Une liste d'ordres plutôt qu'un test
 *  « contient holdem et contient no limit », qui accepterait « Omaha Hi-Lo No Limit ». */
const VARIANTES_ACCEPTEES = ['nltexasholdem', 'nolimitholdem', 'nolimittexasholdem', 'texasholdemnl'];

/**
 * LE VA-ET-VIENT À TABLE, ET LA PENDULE — des lignes faites par des gens qui ne sont pas forcément
 * dans la main (`poom88 has joined the table.`, alors que poom88 n'est assis nulle part).
 *
 * ⚠️ C'EST LE PRÉDICAT QUI DÉCIDE, PAS LE SUJET — même règle que dans la grammaire générique :
 * aucune ligne d'action ne contient « has joined the table », donc n'importe quel sujet est sûr
 * DEVANT CES TOURNURES-LÀ, et devant elles seules.
 */
const TRAFIC = [
  /\bhas (joined|left) the table\b/i,
  /\bis sitting out\b/i,
  /\bwill be using (his|her|their) time bank for this hand\b/i,
  // ⚠️ UNE PLACE PAYÉE N'EST PAS UN GAIN DE POT — `Player TURBO3 finished in 8 place and received
  // €4.03 EUR`. C'est de l'argent RÉEL au milieu d'une main en JETONS, et le compter dans les gains
  // ferait échouer le contrôle nº 6 sur une main parfaite (même piège que la prime d'élimination
  // PokerStars). Le sujet est préfixé de « Player », donc aucun nom assis ne le rattrape : c'est
  // bien le prédicat qui décide.
  /\bfinished in \d+ place\b/i,
  // Le séparateur des fichiers de session, quand une main en traîne un bout.
  /^Game #\d+ starts\.?$/i,
];

/** Ce qu'un joueur peut dire de ses cartes SANS les montrer. Elles ne vont jamais à l'abattage. */
const SANS_CARTES = [
  /^does not show cards\.?$/i, /^did not show his hand\.?$/i, /^did not show her hand\.?$/i,
  /^mucks\b/i,
];

export const party888: Dialecte = {
  id: 'party888',

  reconnait: (texte) => SIGNATURE.test(texte),

  decoupe: (texte) =>
    texte
      // ⚠️ Le `#Game No : N` de 888 précède la ligne de signature : découper SUR la signature le
      // laisserait à la fin de la main précédente. On découpe donc devant lui quand il est là.
      .split(/(?=^(?:#Game No\s*:.*\n)?\*{4,}[^*\n]*Hand History for Game\s)/m)
      .map((t) => t.trim())
      .filter((t) => SIGNATURE.test(t)),

  lit(texte): MainLue {
    const { entete, parMarqueur, apresMarqueur } =
      decouperEnBlocs(texte.split('\n'), MARQUEURS, MARQUEUR_DEUX_ETOILES);

    // ─── L'en-tête ────────────────────────────────────────────────────────────────────────────
    const signature = texte.match(SIGNATURE);
    // Vide chez partypoker, `888poker` / `LuckyAcePoker.com` / `Cassava` chez 888.
    const salle = signature?.[1]?.trim() || undefined;

    // La ligne des enjeux est celle qui SUIT la signature : `$0.05/$0.10 USD NL Texas Hold'em - …`
    // ou `$0.50/$1 Blinds No Limit Holdem - *** …`. Ce qui précède le premier « - » décrit la
    // partie ; ce qui suit est une date, et on ne lit jamais une date.
    const rangSignature = entete.findIndex((l) => SIGNATURE.test(l));
    const ligneEnjeux = entete[rangSignature + 1] ?? '';
    const descripteur = ligneEnjeux.split(' - ')[0].trim();

    /**
     * ⚠️ LE TYPE DE PARTIE SE LIT ICI, AVANT LE MOINDRE MONTANT — et cette famille en donne la
     * démonstration la plus nette du chantier.
     *
     * `Trny:` est le marqueur POSITIF du tournoi, mesuré sur une vraie main PMU (PMU Poker tourne
     * sur PartyGaming, donc sur cette grammaire) :
     *     `NL Texas Hold'em €0.50 EUR Buy-in Trny:129592788 Level:22 Blinds-Antes(2 500/5 000 -500)`
     * Le `€0.50` est un BUY-IN, donc de l'argent réel ; les `2 500/5 000` sont des JETONS. Lue comme
     * du cash, cette main donnait une partie à 2 500/5 000 € — et elle passait les six contrôles,
     * exactement comme le tournoi Betclic. C'est le garde-fou d'avant qui l'a arrêtée, à une époque
     * où aucun tournoi de cette famille n'avait encore été vu.
     *
     * ⚠️ ET IL RESTE UN REFUS pour ce qui porte `Tournament` ou `Level` SANS `Trny:` : cette forme
     * n'a jamais été mesurée, et on ne l'invente pas. La direction de l'échec ne change pas.
     */
    const tournoi = /\bTrny:/i.test(ligneEnjeux);
    if (!tournoi && /\b(Tournament|Level)\b/i.test(ligneEnjeux)) {
      refuser('format-inconnu', `tournoi de forme inconnue (« ${descripteur.slice(0, 60)} »)`);
    }

    const nu = descripteur.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!VARIANTES_ACCEPTEES.some((v) => nu.includes(v))) {
      refuser('variante-non-prise-en-charge', `variante non reconnue dans « ${descripteur.slice(0, 80)} »`);
    }

    // ⚠️ CE QUE CETTE LIGNE PORTE N'EST PAS TOUJOURS LES BLINDES, et ça n'a aucune importance : elle
    // ne sert QU'À LA DEVISE. `$0.05/$0.10 USD NL Texas Hold'em` donne bien les blindes, mais
    // `$4 USD NL Texas Hold'em` nomme le MAXIMUM D'ENTRÉE d'une table à 0,02/0,04 — mesuré. Les
    // mises forcées ne se lisent que dans les lignes qui les NOMMENT (piège nº 2 du montage), donc
    // on se contente ici du premier fragment chiffré, sous l'une ou l'autre forme.
    const enjeux = descripteur.match(/^(\S*\d\S*(?:\s*\/\s*\S*\d\S*)?)/)?.[1] ?? '';
    const devise = deviseDeclaree(descripteur) ?? deviseEcrite(enjeux);

    // ─── Le contexte du tournoi ───────────────────────────────────────────────────────────────
    // ⚠️ LE SEUL ENDROIT D'UNE MAIN DE TOURNOI OÙ UN SIGNE DE DEVISE NE MENT PAS : le buy-in est de
    // l'argent réel, là où les tapis et le pot sont des jetons. Le code ISO qui le suit est retiré —
    // `normaliserBuyIn` refuse de sommer ce qu'il ne comprend pas entièrement, et « EUR » suffirait
    // à tout laisser inchangé. La forme à deux parts (`€4.50 + €0.50`) est prévue : c'est la même
    // que le champ du formulaire somme au blur.
    const buyIn = tournoi
      ? ligneEnjeux.match(/(\S*\d\S*(?:\s*\+\s*\S*\d\S*)?)(?:\s+[A-Z]{3})?\s+Buy-in/i)?.[1]
      : undefined;
    // `Table 50€ Garantis Hyper Turbo Rebuy (129592788) Table #6 (Real Money)` — le nom de
    // l'épreuve, borné par le numéro de tournoi entre parenthèses puis `Table #N`. En cash la même
    // ligne s'écrit `Table Bloemfontein (Real Money)`, sans ce couple : les deux ne peuvent pas se
    // confondre.
    const nomTournoi = tournoi
      ? entete.map((l) => l.match(/^Table\s+(.+?)\s+\(\d+\)\s+Table\s+#\d+/i)).find(Boolean)?.[1]
      : undefined;
    const niveau = tournoi ? (ligneEnjeux.match(/\bLevel:\s*(\d+)/i)?.[1]) : undefined;

    // ─── Les sièges ───────────────────────────────────────────────────────────────────────────
    const sieges: SiegeLu[] = [];
    let siegeBouton = -1;
    let annonces: number | undefined;
    for (const ligne of entete) {
      // Un nom peut contenir des espaces (`dr. spaz`) et des points : on prend tout jusqu'à la
      // DERNIÈRE parenthèse, qui porte le tapis.
      const m = ligne.match(/^Seat (\d+):\s+(.*?)\s+\(\s*([^()]*?)\s*\)\s*$/);
      if (m) {
        const tapis = lireMontant(m[3]);
        if (tapis == null) refuser('ligne-incomprise', `tapis illisible : « ${ligne} »`);
        sieges.push({ numero: parseInt(m[1], 10), nom: m[2], tapis: tapis! });
        continue;
      }
      const bouton = ligne.match(/^Seat (\d+) is the button\s*$/i);
      if (bouton) siegeBouton = parseInt(bouton[1], 10);
      const total = ligne.match(/^Total number of players\s*:\s*(\d+)/i);
      if (total) annonces = parseInt(total[1], 10);
    }
    if (sieges.length === 0) refuser('pas-assez-de-joueurs', "aucune ligne « Seat N: »");
    if (siegeBouton < 0) refuser('bouton-introuvable', "aucune ligne « Seat N is the button »");
    // ⚠️ TÉMOIN GRATUIT SUR UN COLLAGE TRONQUÉ : le fichier compte lui-même ses joueurs assis. Un
    // désaccord veut dire qu'une ligne de siège manque ou n'a pas été lue — et une table amputée
    // d'un siège décale TOUT le placement des positions.
    if (annonces != null && annonces !== sieges.length) {
      refuser('ligne-incomprise',
        `${sieges.length} ligne(s) « Seat N: » pour ${annonces} joueur(s) annoncé(s) : texte incomplet ?`);
    }

    const noms = sieges.map((s) => s.nom).sort((a, b) => b.length - a.length);
    /** Un nom connu en tête de ligne, LE PLUS LONG D'ABORD — `marlboro man` avant `marlboro`. */
    const quelNom = (ligne: string) => noms.find((n) => ligne.startsWith(`${n} `));

    const misesForcees: MiseForceeLue[] = [];
    const actions: ActionLue[] = [];
    const abattage: CartesMontrees[] = [];
    const gains: { nom: string; montant: number }[] = [];
    let hero: MainLue['hero'];
    /** Les noms vus AILLEURS que sur leur ligne de siège (cf. `dansLaMain` plus bas). */
    const vus = new Set<string>();
    let verbeDuGain: 'wins' | 'collected' | undefined;

    /** Les lignes qui n'appartiennent à aucune street : mises forcées, cartes, abattage, gains. */
    const lireLigneHorsRue = (ligne: string): boolean => {
      if (TRAFIC.some((r) => r.test(ligne))) return true;

      const dealt = ligne.match(/^Dealt to (.+?)\s+(\[[^\]]*\])\s*$/);
      if (dealt) {
        hero = { nom: dealt[1], cartes: crochets(dealt[2]).flatMap((c) => lireCartes(c)) };
        vus.add(dealt[1]);
        return true;
      }

      // ⚠️ LE BAVARDAGE DE TABLE : `Roycey1992: always play ur opponent`. Ce qui le rend sûr, c'est
      // LE DEUX-POINTS — aucune ligne d'action de cette famille n'en porte (elles s'écrivent toutes
      // `<nom> <verbe>`), donc rien d'utile ne peut se cacher derrière cette forme. On exige quand
      // même un nom ASSIS, faute d'avoir jamais mesuré un bavard non assis : si une vraie main en
      // porte un, elle sera refusée en nommant la ligne, et c'est comme ça que cette liste grandit.
      const bavard = noms.find((n) => ligne.startsWith(`${n}: `));
      if (bavard) return true;

      const nom = quelNom(ligne);
      if (!nom) return false;
      const reste = ligne.slice(nom.length + 1).trim();
      vus.add(nom);

      // ⚠️ LA BLINDE MORTE EST REFUSÉE, PAS DEVINÉE. Deux tournures mesurées, et elles disent la
      // même chose : `posts big blind + dead [$3]` (partypoker) et `posts dead blind [$1 + $2]`
      // (888) — une part MORTE, qui va au pot sans compter dans ce qu'il faut suivre, et une part
      // VIVE égale à la grosse blinde. Pokza n'a aucun moyen de dire ça : son modèle n'a ni blinde
      // morte ni « mise forcée d'un joueur qui n'est pas aux blindes », et le formulaire non plus —
      // une main importée avec ce bricolage ne se relirait pas en remontant les étapes. Le montage
      // refuserait de toute façon (« plus d'une blinde du même genre ») ; on le dit ici, plus tôt
      // et plus clairement. Même choix que le straddle, pour la même raison.
      if (/^posts\b.*\bdead\b/i.test(reste)) {
        refuser('mise-forcee-inconnue', `blinde morte : pas encore lue depuis un fichier (« ${ligne.trim()} »)`);
      }
      // `posts ante [500]` — un ante PAR JOUEUR, mesuré sur la main PMU. Les huit joueurs le
      // postent, chacun sur sa ligne, AVANT les deux blindes.
      const poste = reste.match(/^posts\s+(small blind|big blind|ante)\s+(\[[^\]]*\])/i);
      if (poste) {
        const montant = lireMontant(poste[2]);
        if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);
        const quoi = poste[1].toLowerCase();
        misesForcees.push({
          nom, montant: montant!,
          genre: quoi === 'small blind' ? 'sb' : quoi === 'big blind' ? 'bb' : 'ante',
        });
        return true;
      }
      // On n'invente aucune tournure de mise forcée qu'on n'a pas mesurée : mieux vaut refuser la
      // main que la lire de travers.
      if (/^posts\b/i.test(reste)) {
        refuser('mise-forcee-inconnue', `mise forcée inconnue : « ${ligne} »`);
      }

      // ⚠️ `shows` SEUL ALIMENTE L'ABATTAGE. Deux tournures montrent pourtant des cartes :
      //   `X shows [ 8c, 8d ]three of a kind, Eights.`
      //   `X doesn't show [ Jc, Jd ]a pair of Jacks.`
      // La seconde est ambiguë — le fichier CONNAÎT ces cartes, mais son propre verbe dit que le
      // joueur ne les a pas montrées. Les révéler dans le replayer serait raconter une main que
      // personne n'a vue à table ; les taire ne coûte qu'une main de moins à l'abattage. C'est la
      // même règle que pour le `Mucks` de Betclic, et elle se retourne sans rien casser le jour où
      // une vraie main tranchera.
      const montre = reste.match(/^shows\s+(\[[^\]]*\])/i);
      if (montre) {
        abattage.push({ nom, cartes: crochets(montre[1]).flatMap((c) => lireCartes(c)) });
        return true;
      }
      if (/^doesn'?t show\b/i.test(reste) || SANS_CARTES.some((r) => r.test(reste))) return true;

      // `X wins $0.78 USD` · `X wins $1.87 USD from the side pot 1 with …` · `X collected [ $5.70 ]`
      const gagne = reste.match(/^(wins|collected)\s+(\[[^\]]*\]|\S+)/i);
      if (gagne) {
        const montant = lireMontant(gagne[2]);
        if (montant == null) refuser('ligne-incomprise', `gain illisible : « ${ligne} »`);
        gains.push({ nom, montant: montant! });
        verbeDuGain = gagne[1].toLowerCase() === 'collected' ? 'collected' : 'wins';
        return true;
      }
      return false;
    };

    entete.forEach((ligne, i) => {
      // La signature et la ligne des enjeux se sautent par INDICE : deux lignes de texte identiques
      // resteraient possibles, et se comparer à `ligneEnjeux` en sauterait alors une de trop.
      if (i === rangSignature || i === rangSignature + 1) return;
      if (!ligne.trim()) return;
      // ⚠️ `Trny:… Level:…` et `Blinds-Antes(…)` sont RÉPÉTÉS en lignes à part, juste avant les
      // antes — tout est déjà lu dans la ligne des enjeux. Et on ne lit JAMAIS les nombres de
      // `Blinds-Antes(2 500/5 000 -500)` : les mises forcées ne viennent que des lignes qui les
      // NOMMENT (piège nº 2 du montage). Ça évite au passage l'ESPACE comme séparateur de milliers,
      // que la version française écrit là et nulle part ailleurs.
      if (/^(#Game No|Table\b|Seat \d+|Total number of players|Trny:|Blinds-Antes)/i.test(ligne)) return;
      if (!lireLigneHorsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
    });

    // ─── Les streets ──────────────────────────────────────────────────────────────────────────
    const board: Card[] = [];
    for (const { marqueur, rue, cartes } of RUES) {
      const bloc = parMarqueur.get(marqueur);
      if (!bloc) continue;
      // Les cartes de la street sont sur la LIGNE DU MARQUEUR, jamais ailleurs dans le bloc — chez
      // partypoker l'abattage vit dans le bloc de la dernière street, et le lire entier
      // ramasserait les cartes des joueurs (bug mesuré sur GGPoker, cf. `cartesNeuves`).
      if (cartes > 0) board.push(...cartesNeuves(apresMarqueur.get(marqueur) ?? '', cartes, marqueur));
      for (const ligne of bloc) {
        if (!ligne.trim()) continue;
        if (lireLigneHorsRue(ligne)) continue;
        const nom = quelNom(ligne);
        if (!nom) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
        actions.push(lireAction(nom!, ligne.slice(nom!.length + 1).trim(), rue, ligne));
      }
    }

    // ─── Le résumé (888 seulement — partypoker n'en a aucun) ──────────────────────────────────
    for (const ligne of parMarqueur.get('Summary') ?? []) {
      if (!ligne.trim()) continue;
      if (!lireLigneHorsRue(ligne)) refuser('ligne-incomprise', `ligne incomprise : « ${ligne} »`);
    }

    // ⚠️ UN SIÈGE QUI N'APPARAÎT NULLE PART AILLEURS N'A PAS ÉTÉ SERVI — et il faut le retirer,
    // sinon tout l'anneau des positions se décale d'un cran.
    //
    // Mesuré sur une vraie main partypoker : `Total number of players : 6/6`, six lignes de siège,
    // et l'un des six ne fait RIEN de toute la main — aucun `is sitting out`, aucun fold, rien. Il
    // est assis, il n'est pas dans le coup. Lu comme servi, la grosse blinde tombait sur son voisin
    // et le contrôle nº 2 refusait une main pourtant parfaite.
    //
    // CE QUI REND LA RÈGLE SÛRE : un joueur servi produit TOUJOURS au moins une ligne — il poste,
    // ou il parle, ne serait-ce que pour se coucher. Il n'existe aucun chemin où il n'écrit rien.
    // Et le seul risque de faux positif — une ligne mal attribuée — n'existe pas non plus : une
    // ligne dont le sujet n'est pas reconnu fait REFUSER la main, elle n'est jamais avalée.
    //
    // ⚠️ Cette règle reste LOCALE à cette famille, exprès. La famille PokerStars écrit `is sitting
    // out` sur la ligne de siège, et son dialecte croise déjà deux signaux — mesuré, et vert. On ne
    // relâche pas un lecteur éprouvé pour une tournure constatée ailleurs.
    const dansLaMain = sieges.filter((s) => vus.has(s.nom));

    return {
      dialecte: 'party888',
      // Renseignée seulement quand le fichier se nomme lui-même (cf. `SIGNATURE`).
      salle,
      typePartie: tournoi ? 'tournoi' : 'cash',
      // Le montage a la table exacte des variantes ; on lui rend la forme qu'il connaît.
      variante: 'Holdem no limit',
      // ⚠️ EN TOURNOI LES JETONS NE SONT PAS DE L'ARGENT, même quand le fichier écrit `€` juste à
      // côté (le buy-in) : aucune devise ne les habille.
      devise: tournoi ? undefined : (devise as MainLue['devise']),
      nomTournoi,
      buyIn,
      niveau,
      sieges: dansLaMain,
      siegeBouton,
      hero,
      misesForcees,
      actions,
      board,
      // Aucun `Board:` de résumé dans cette famille : l'assemblage street par street est la seule
      // source, ce qui rend la clôture des tours (nº 5) d'autant plus utile.
      boardResume: undefined,
      abattage,
      resume: {
        // NI « Total pot » NI RAKE dans cette famille — le contrôle nº 6 perd son équation exacte
        // et garde les gagnants, plus la borne « encaissé ≤ misé ».
        potTotal: undefined,
        rake: undefined,
        gains,
      },
      /**
       * ⚠️ DEUX SALLES DE LA MÊME FAMILLE, DEUX ÉQUATIONS DU POT — et c'est le VERBE DU GAIN qui les
       * sépare, ce qui tombe bien : c'est justement la ligne dont l'équation parle.
       *
       *   • `wins $X` (partypoker) → Σ − rake. La mise non suivie est DEDANS : elle revient au
       *     joueur à l'intérieur du montant annoncé, et partypoker la baptise même « side pot 1 ».
       *     Mesuré deux fois, dont une où l'autre lecture donnerait un rake NÉGATIF (impossible).
       *   • `collected [ $X ]` (888) → Σ − non suivi − rake. Prouvé au centime sur une main sans
       *     flop : 20 misés, 10 non suivis, 10 encaissés, rake 0 — « no flop, no drop ».
       *
       * Les deux verbes ne cohabitent dans aucun des 84 fichiers mesurés (partypoker : 40 `wins`,
       * 0 `collected` ; 888 : 35 `collected`, et son bloc `** Summary **` que partypoker n'a pas).
       */
      equationDuPot: verbeDuGain === 'collected' ? 'somme-moins-non-suivi-moins-rake'
        : verbeDuGain === 'wins' ? 'somme-moins-rake'
        : 'inconnue',
      // Le bloc des sièges N'EST PAS dans l'ordre de parole (mesuré : partypoker écrit 2,3,5,6,1,4),
      // et rien n'annote les blindes. Il reste la contre-épreuve universelle du contrôle nº 2 :
      // qui poste la petite blinde doit être en SB. Un siège levé retiré ci-dessus s'y voit tout de
      // suite, puisqu'il décalerait l'anneau.
      temoinPositions: undefined,
    };
  },
};

/**
 * UN VERBE DE CETTE FAMILLE, ET SA CONVENTION — LA MÊME POUR TOUS : **des jetons poussés**.
 *
 * C'est ce qui la distingue le plus de PokerStars, où `raises to $8.05` annonce un TOTAL. Ici il
 * n'y a pas de « to », et le nombre est toujours ce que le joueur avance depuis ce qu'il a déjà mis
 * sur la street (démonstration au centime dans l'en-tête de ce fichier).
 *
 *   `calls [$0.25 USD]`     → incrément (il complète jusqu'à la mise)
 *   `bets [$1.10 USD]`      → incrément, et il vaut le total : une mise ouvre une street à zéro
 *   `raises [$2.94 USD]`    → incrément
 *   `is all-In  [$4.90 USD]` → incrément, et c'est le reste EXACT du tapis (vérifié sur deux mains).
 *                              Double espace dans le texte : `\s+` s'en charge.
 */
function lireAction(nom: string, reste: string, rue: Street, ligne: string): ActionLue {
  if (/^folds\b/i.test(reste)) return { nom, rue, genre: 'fold' };
  if (/^checks\b/i.test(reste)) return { nom, rue, genre: 'check' };

  const m = reste.match(/^(calls|bets|raises|is all-In)\s+(\[[^\]]*\])/i);
  if (!m) refuser('ligne-incomprise', `verbe inconnu : « ${ligne} »`);
  const montant = lireMontant(m![2]);
  if (montant == null) refuser('ligne-incomprise', `montant illisible : « ${ligne} »`);

  switch (m![1].toLowerCase()) {
    case 'calls': return { nom, rue, genre: 'call', montant: montant!, montantEst: 'increment' };
    case 'bets': return { nom, rue, genre: 'bet', montant: montant!, montantEst: 'increment' };
    case 'raises': return { nom, rue, genre: 'raise', montant: montant!, montantEst: 'increment' };
    // Le texte dit « à tapis » sans dire suivre ni relancer : c'est le MONTAGE qui tranche, d'après
    // le total obtenu. Pokza n'a pas de type « tapis » — il se déduit de l'épuisement du tapis.
    default:
      return { nom, rue, genre: 'tapis', montant: montant!, montantEst: 'increment', tapisAnnonce: true };
  }
}
