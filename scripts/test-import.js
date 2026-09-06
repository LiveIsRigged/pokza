// « Coller une main » — le socle : lecture, montage, et les six contrôles.
// ─────────────────────────────────────────────────────────────────────────
// CE SCRIPT NE RESSEMBLE PAS AUX AUTRES, ET C'EST LE POINT DU CHANTIER : une hand history
// ANNONCE SON PROPRE RÉSULTAT (pot, rake, gagnants). Il n'y a donc presque aucun attendu à
// rédiger — on rejoue la main reconstruite dans le moteur et on compare au fichier. Chaque vraie
// main ajoutée dans `scripts/corpus/` devient un test, gratuitement.
//
// Trois familles de vérifications, et la troisième est la plus importante :
//   1. LE CORPUS PASSE — les 6 vraies mains se lisent, et quelques faits par main sont épinglés
//      à la main (position du héros, montants convertis, gagnant) : les contrôles attrapent
//      l'incohérence, pas la MÉCOMPRÉHENSION cohérente, et ces épingles-là sont là pour ça.
//   2. LES CONTRÔLES MORDENT — on abîme une main vraie d'une seule façon à chaque fois, et on
//      exige le refus qui va avec. Un contrôle qui ne refuse jamais rien ne garantit rien.
//   3. LA LIMITE EST DOCUMENTÉE — on montre qu'une main de tournoi lue comme du cash passe les
//      SIX contrôles. C'est le seul test du dépôt qui affirme un TROU plutôt qu'une garantie, et
//      c'est ce qui interdit de déplacer un jour la lecture du type de partie après les montants.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/import/index.ts pokza-app/src/import/messages.ts \
//     pokza-app/src/import/fichier.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-import.js

const fs = require('fs');
const path = require('path');
const { importerMain, compterLesMains } = require('./cm/import/index.js');
const { lireCarte, lireMontant, CODES_DE_REFUS } = require('./cm/import/formeNeutre.js');
const { messageDeRefus, messageDAvertissement } = require('./cm/import/messages.js');
const { decoderTexte, verifierTaille, TAILLE_MAX_OCTETS } = require('./cm/import/fichier.js');
const { deviseEcrite } = require('./cm/import/devise.js');
const { winamax } = require('./cm/import/dialectes/winamax.js');
const { betclic } = require('./cm/import/dialectes/betclic.js');
const { generique } = require('./cm/import/dialectes/generique.js');
const { monter } = require('./cm/import/montage.js');
const { verifier, miseNonSuivie } = require('./cm/import/verification.js');
const { committedBySeat, determinePotAwards } = require('./cm/engine/handEngine.js');
const { roundMoney } = require('./cm/utils/chipFormat.js');
const { postToSeed, seedStart, seedHistory } = require('./cm/creator/rehydrate.js');
const { buildSeats } = require('./cm/creator/positions.js');

let ko = 0;
let total = 0;
function cas(titre, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const CORPUS = path.join(__dirname, 'corpus');
const lire = (nom) => fs.readFileSync(path.join(CORPUS, nom), 'utf8');
const cartes = (liste) => (liste ?? []).map((c) => c.rank + c.suit).join(' ');
const boardDe = (h) => cartes([
  ...(h.board.flop ?? []), ...(h.board.turn ? [h.board.turn] : []), ...(h.board.river ? [h.board.river] : []),
]);
// Arrondi comme le fait la production (`controlePot`) : additionner des centimes en flottant donne
// 70.49000000000001, et c'est le test qui aurait tort de s'en formaliser.
const somme = (h) => roundMoney(Object.values(committedBySeat(h.actions)).reduce((s, v) => s + v, 0));
const tapisDe = (h, pos) => h.seats.find((s) => s.position === pos).startingStack;
const misesDe = (h, seatId, rue) =>
  h.actions.filter((a) => a.seatId === seatId && a.street === rue).map((a) => `${a.type}:${a.amount ?? ''}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. LE CORPUS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Corpus PSEUDONYMISÉ, cf. `scripts/corpus/LISEZ-MOI.md` : les pseudos ont été remplacés par des
// noms de même FORME (espaces, espaces doubles, noms tout en chiffres). Rien d'autre n'a bougé.

console.log('\n─── 1. Les six vraies mains du corpus ──────────────────────────────────────────');

const resultats = {};
for (const fichier of fs.readdirSync(CORPUS).filter((f) => f.endsWith('.txt')).sort()) {
  const r = importerMain(lire(fichier));
  resultats[fichier] = r;
  // DEUX mains du corpus sont là pour être REFUSÉES : celle à cashout, et celle dont le texte
  // s'arrête au milieu de la river (cf. plus bas). Un corpus qui ne contient que du lisible ne
  // prouve rien sur ce qu'on refuse.
  const refusAttendu = ['ggpoker-cash-cashout.txt', 'positions-cash-tronquee.txt',
                        'positions-observee-sans-heros.txt'].includes(fichier);
  cas(`${fichier} ${refusAttendu ? 'est refusée (cashout)' : 'se lit'}`,
      r.ok === true ? (refusAttendu ? 'LUE À TORT' : true) : (refusAttendu ? true : `REFUS ${r.code} : ${r.message}`),
      true);
  if (!r.ok) continue;
  cas(`${fichier} — les 6 contrôles passent`, r.controles.filter((c) => !c.ok).map((c) => c.nom), []);
}

// ─── Winamax cash, notation BBCode (3-max, table incognito) ───────────────────────────────────
// Ce qu'elle éprouve : les balises `[b]…[/b]`, les cartes sur la LIGNE SUIVANTE, un crochet par
// carte, la couleur en MAJUSCULE, un suivi en incrément, et un tapis DÉDUIT (« and is all-in »).
{
  const r = resultats['winamax-cash-bbcode.txt'];
  const h = r.source.hand;
  cas('bbcode — cash game en euros', [h.gameType, h.variant, h.currency], ['cash', 'nlhe', 'EUR']);
  cas('bbcode — blindes 0,50/1 sans ante', h.blinds, { sb: 0.5, bb: 1, ante: undefined });
  cas('bbcode — le lieu est la salle', r.source.location, 'Winamax');
  cas('bbcode — rien de l\'épreuve en cash',
      [r.source.tournamentName, r.source.buyIn, r.source.level], [undefined, undefined, undefined]);
  // Bouton au siège 2, 3 joueurs : l'anneau donne 2=BTN, 3=SB, 1=BB.
  cas('bbcode — le héros (siège 3) est en SB', h.seats.find((s) => s.isHero).position, 'SB');
  cas('bbcode — tapis par siège', [tapisDe(h, 'BTN'), tapisDe(h, 'SB'), tapisDe(h, 'BB')],
      [103, 103.64, 134.28]);
  cas('bbcode — stack effectif = le plus petit', h.effectiveStack, 103);
  cas('bbcode — cartes du héros, couleur en majuscule', cartes(h.seats.find((s) => s.isHero).holeCards), 'As 3h');
  cas('bbcode — board assemblé sur 4 lignes de street', boardDe(h), '3d 6d 9c 4h Qh');
  // ⚠️ LE PIÈGE Nº 1 : « calls 1.50€ » est un INCRÉMENT sur une BB de 1 € → total de street 2,50.
  cas('bbcode — un suivi en incrément devient un total', misesDe(h, 's-bb', 'preflop'),
      ['post-bb:1', 'call:2.5']);
  cas('bbcode — au turn, mise puis relance puis suivi', misesDe(h, 's-bb', 'turn'), ['bet:3.58', 'call:9.66']);
  cas('bbcode — Σ des contributions', somme(h), 115.66);
  // Winamax : Total pot = Σ − rake. La mise non suivie RESTE dedans. 115,66 − 1,43 = 114,23 ✓
  cas('bbcode — le gagnant est le bouton', determinePotAwards(h), [{ seatId: 's-btn', fraction: 1 }]);
  // Le résumé de cette main n'annote AUCUNE blinde : le témoin du contrôle nº 2 manque, et il le dit.
  cas('bbcode — contrôle nº 2 sans témoin', r.controles.find((c) => c.numero === 2).temoin, false);
  cas('bbcode — contrôle nº 1 avec témoin (Board: du résumé)',
      r.controles.find((c) => c.numero === 1).temoin, true);
}

// ─── Winamax cash INCOGNITO, heads-up — LA MAIN TROUVÉE EN ESSAYANT L'ÉCRAN ──────────────────
// ⚠️ ELLE ÉTAIT REFUSÉE, ET C'EST VICTOR QUI L'A VUE (06/09/2026, main de 2025/12) : Winamax écrit
// sur ses tables incognito une ligne `Player Info: Seat1: P1-<32 hexa>` qui donne l'IDENTIFIANT
// STABLE du joueur masqué, seat par seat, et seulement pour ceux qui le sont. Le dialecte ne la
// connaissait pas et refusait toute la main.
//
// ⚠️⚠️ ET C'EST LA LEÇON DU CHANTIER, ENCORE : 25 vraies mains au banc et 16 au corpus n'avaient
// jamais montré cette ligne. Un écran essayé UNE fois par son auteur a trouvé ce que ni le corpus
// ni le banc ne contenaient. Aucun jeu de test ne remplace une vraie main de plus.
{
  const r = resultats['winamax-cash-incognito-heads-up.txt'];
  const h = r.source.hand;
  cas('wina incognito — 2 joueurs sur une table 3-max', h.seats.length, 2);
  // ⚠️ À DEUX, LE BOUTON EST LA PETITE BLINDE : le héros porte le bouton ET poste la SB.
  cas('wina incognito — le héros au bouton poste la petite blinde',
      [h.seats.find((x) => x.isHero).position, misesDe(h, 's-btn', 'preflop')[0]],
      ['BTN', 'post-sb:1']);
  // `raises 3€ to 5€` : Winamax écrit l'incrément ET le total. C'est le total qui compte.
  cas('wina incognito — « raises 3€ to 5€ » vaut 5', misesDe(h, 's-btn', 'preflop'),
      ['post-sb:1', 'raise:5']);
  cas('wina incognito — Σ = pot annoncé + rake', somme(h), 16.6);
  cas('wina incognito — abattage à deux', h.seats.filter((x) => x.holeCards).length, 2);
  // ⚠️ L'IDENTIFIANT DE `Player Info` NE DOIT JAMAIS RESSORTIR : il SUIT le joueur de main en main,
  // donc il identifie mieux qu'un pseudo. Rien de ce texte ne quitte l'appareil, et rien n'entre
  // non plus dans la main — pas plus que le masque « Incognito 1 ».
  const seed = postToSeed(r.source);
  cas('wina incognito — ni le masque ni l\'identifiant ne sont importés',
      [seed.context.heroName, seed.context.opponentNames].filter(Boolean), []);
  cas('wina incognito — aucun identifiant dans la main montée',
      /P1-|e6afa3|3b7c04/.test(JSON.stringify(r.source)), false);
}
// ⚠️ ÉCARTÉE, PAS AVALÉE : c'est `Player Info:` qu'on laisse passer, pas n'importe quel en-tête.
// Une tournure inconnue doit toujours faire REFUSER — sinon on relâcherait le lecteur au lieu de
// l'instruire, et une vraie ligne d'action pourrait passer inaperçue.
{
  const inconnue = importerMain(
    lire('winamax-cash-incognito-heads-up.txt').replace('Player Info:', 'Random Info:'));
  cas('wina — une ligne d\'en-tête inconnue refuse toujours',
      inconnue.ok ? 'ACCEPTÉE À TORT' : inconnue.code, 'ligne-incomprise');
}

// ─── Winamax cash, autre notation (5-max, abattage à 3 et pots secondaires) ───────────────────
{
  const r = resultats['winamax-cash-sidepot.txt'];
  const h = r.source.hand;
  cas('sidepot — 5 joueurs, héros en BB', [h.seats.length, h.seats.find((s) => s.isHero).position], [5, 'BB']);
  cas('sidepot — le siège du bouton (2) porte 140,16', tapisDe(h, 'BTN'), 140.16);
  cas('sidepot — cartes du héros, couleur en minuscule', cartes(h.seats.find((s) => s.isHero).holeCards), 'Ah As');
  cas('sidepot — trois abattages lus', h.seats.filter((s) => s.holeCards).length, 3);
  // « calls 45€ and is all-in » sur une SB de 5 → total 50, exactement son tapis.
  cas('sidepot — le suivi à tapis tombe pile sur le tapis',
      [misesDe(h, 's-sb', 'preflop'), tapisDe(h, 'SB')], [['post-sb:5', 'call:50'], 50]);
  cas('sidepot — « raises 149 to 308 » = 308', misesDe(h, 's-bb', 'preflop'), ['post-bb:10', 'raise:308']);
  cas('sidepot — Σ = 517 (dont 149 non suivis)', somme(h), 517);
  cas('sidepot — les AA raflent les trois tranches', determinePotAwards(h), [{ seatId: 's-bb', fraction: 1 }]);
  cas('sidepot — les 6 contrôles ont tous leur témoin', r.controles.filter((c) => c.temoin).length, 6);
}

// ─── Winamax tournoi (6-max, antes par joueur, prime, pot partagé) ────────────────────────────
{
  const r = resultats['winamax-tournoi-split.txt'];
  const h = r.source.hand;
  cas('tournoi wina — tournoi SANS devise (les jetons ne sont pas de l\'argent)',
      [h.gameType, h.currency], ['tournament', undefined]);
  // ⚠️ `Holdem no limit (160/700/1400)` de l'en-tête est ante/SB/BB — JAMAIS lu. Les mises
  // forcées viennent des lignes qui les nomment.
  cas('tournoi wina — blindes lues dans les lignes `posts`', h.blinds, { sb: 700, bb: 1400, ante: 160 });
  cas('tournoi wina — un ante par joueur', h.actions.filter((a) => a.type === 'post-ante').length, 6);
  cas('tournoi wina — nom de l\'épreuve (41 caractères)',
      r.source.tournamentName, '#5 - W SERIES - MILLION EVENT - KO - DAY 1');
  cas('tournoi wina — buy-in sommé comme au formulaire', r.source.buyIn, '50€');
  cas('tournoi wina — le niveau est stocké en entier', r.source.level, 'Niveau 12');
  // La prime (`61.87€ bounty`) est un SECOND montant dans la même parenthèse : le tapis est le premier.
  cas('tournoi wina — la prime n\'est pas prise pour un tapis', tapisDe(h, 'BTN'), 80213);
  cas('tournoi wina — le Dix s\'écrit T', cartes(h.seats.find((s) => s.position === 'BTN').holeCards), 'Kh Ts');
  // Nom à ESPACE DOUBLE (« Roi  faucon ») : lu depuis les lignes `Seat N:`, jamais découpé aux blancs.
  cas('tournoi wina — le nom à espace double poste bien la SB, puis se couche',
      misesDe(h, 's-sb', 'preflop'), ['post-ante:160', 'post-sb:700', 'fold:']);
  cas('tournoi wina — Σ = 15660, sans rake', somme(h), 15660);
  cas('tournoi wina — pot partagé en deux', determinePotAwards(h),
      [{ seatId: 's-hj', fraction: 0.5 }, { seatId: 's-btn', fraction: 0.5 }]);
}

// ─── Betclic cash, fold (4 distribués sur une table 5-max, sièges impairs) ────────────────────
{
  const r = resultats['betclic-cash-fold.txt'];
  const h = r.source.hand;
  // ⚠️ `Size: 5` de l'en-tête est la CAPACITÉ de la table, pas le nombre de distribués : on
  // compte les lignes `Seat N:`, et elles sont 4.
  cas('betclic fold — 4 joueurs et non les 5 de « Size: 5 »', h.seats.length, 4);
  cas('betclic fold — aucun lieu : la signature est anonyme', r.source.location, undefined);
  cas('betclic fold — séparateur de milliers (€1,330.78)', tapisDe(h, 'BTN'), 1330.78);
  cas('betclic fold — héros en BB', h.seats.find((s) => s.isHero).position, 'BB');
  cas('betclic fold — `Call €10.00` est un incrément', misesDe(h, 's-bb', 'preflop'), ['post-bb:10', 'call:20']);
  cas('betclic fold — board du flop seul', boardDe(h), '5c 2c 9h');
  cas('betclic fold — Σ = 210 (dont 75 non suivis)', somme(h), 210);
  // Betclic : Total pot = Σ − non suivi − rake → 210 − 75 − 2,50 = 132,50 ✓
  cas('betclic fold — le gagnant emporte tout par fold', determinePotAwards(h), [{ seatId: 's-bb', fraction: 1 }]);
  // Aucun `Board:` de résumé chez Betclic : le contrôle nº 1 le dit plutôt que de faire semblant.
  cas('betclic fold — contrôle nº 1 sans témoin', r.controles.find((c) => c.numero === 1).temoin, false);
  cas('betclic fold — le bloc des sièges est dans l\'ordre de parole',
      r.controles.find((c) => c.numero === 2).ok, true);
}

// ─── Betclic cash, abattage ───────────────────────────────────────────────────────────────────
{
  const r = resultats['betclic-cash-showdown.txt'];
  const h = r.source.hand;
  cas('betclic abattage — héros en HJ', h.seats.find((s) => s.isHero).position, 'HJ');
  cas('betclic abattage — `Call €182.75` sur une relance à 20 → 202,75',
      misesDe(h, 's-hj', 'preflop'), ['raise:20', 'call:202.75']);
  cas('betclic abattage — cartes dans l\'ordre inverse ([SK SA])',
      cartes(h.seats.find((s) => s.isHero).holeCards), 'Ks As');
  cas('betclic abattage — `Shows` alimente les cartes, jamais `Mucks`',
      h.seats.filter((s) => s.holeCards).length, 2);
  cas('betclic abattage — Σ = 420,50, aucun non suivi (égalité au sommet)', somme(h), 420.5);
  cas('betclic abattage — la couleur à l\'as gagne', determinePotAwards(h), [{ seatId: 's-hj', fraction: 1 }]);
}

// ─── Betclic tournoi — LA main qui a révélé la limite des contrôles ───────────────────────────
{
  const r = resultats['betclic-tournoi.txt'];
  const h = r.source.hand;
  // ⚠️⚠️ Betclic écrit `€200.00 in chips`, `Post SB €10.00`, `Total pot €400.00` sur des JETONS.
  cas('betclic tournoi — le € des jetons est ignoré', [h.gameType, h.currency], ['tournament', undefined]);
  cas('betclic tournoi — blindes 10/20, sans ante', h.blinds, { sb: 10, bb: 20, ante: undefined });
  cas('betclic tournoi — épreuve et buy-in (le seul € qui ne mente pas)',
      [r.source.tournamentName, r.source.buyIn], ['Flash Twister 5€', '5€']);
  cas('betclic tournoi — Betclic n\'écrit aucun niveau', r.source.level, undefined);
  // `Allin €180.00` est un INCRÉMENT (20 de BB + 180 = 200) et le total obtenu ÉGALE la mise :
  // c'est donc un suivi, pas une relance. Pokza n'a pas de type « tapis ».
  cas('betclic tournoi — `Allin` devient un suivi au bon montant',
      misesDe(h, 's-bb', 'preflop'), ['post-bb:20', 'call:200']);
  cas('betclic tournoi — la paire de neuf gagne', determinePotAwards(h), [{ seatId: 's-bb', fraction: 1 }]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. LES CONTRÔLES MORDENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Chaque cas abîme UNE vraie main d'UNE seule façon. Sans ces cas, rien ne distinguerait six
// contrôles qui vérifient de six contrôles qui acquiescent.

console.log('\n─── 2. Une main abîmée doit être refusée ───────────────────────────────────────');

const abimer = (fichier, avant, apres) => {
  const texte = lire(fichier);
  if (!texte.includes(avant)) throw new Error(`le corpus ne contient plus « ${avant} »`);
  return importerMain(texte.replace(avant, apres));
};
const refus = (titre, r, code, numeros) => {
  cas(titre, r.ok ? 'ACCEPTÉE À TORT' : r.code, code);
  if (numeros != null) {
    // Le jeu COMPLET des contrôles qui refusent, et non « au moins celui-ci » : un seul montant
    // faux en fait souvent tomber plusieurs, et savoir lesquels est précisément l'intérêt du
    // filet. Si ce jeu change, c'est à comprendre avant d'ajuster l'attendu.
    cas(`   ${titre} → contrôles ${numeros.join(', ')}`,
        r.ok ? [] : (r.controles ?? []).filter((c) => !c.ok).map((c) => c.numero), numeros);
  }
};

// nº 5 — LA CLÔTURE DES TOURS, le contrôle qui ne demande aucun résumé. Un suivi lu comme un
// total au lieu d'un incrément laisse le tour ouvert (2 € contre 2,50 €).
refus('un suivi au mauvais montant',
      abimer('winamax-cash-bbcode.txt', 'calls 1.50€', 'calls 1€'), 'controle-echoue', [3, 5, 6]);

// nº 2 — LE BOUTON MAL LU. Tout le placement en dépend et rien d'autre ne le dit : déplacer le
// bouton d'un siège fait poster la petite blinde par un joueur qui n'est plus en SB.
refus('le bouton déplacé d\'un siège',
      abimer('winamax-cash-bbcode.txt', 'Seat #2 is the button', 'Seat #1 is the button'),
      'controle-echoue', [2]);

// nº 1 — UNE CARTE DISTRIBUÉE DEUX FOIS.
refus('une carte du board en double',
      abimer('winamax-cash-bbcode.txt', '[3D] [6D] [9C] [4H] [QH]\nIncognito 1 checks',
             '[3D] [6D] [9C] [4H] [3D]\nIncognito 1 checks'), 'controle-echoue', [1]);

// nº 1 (témoin) — LE BOARD DU RÉSUMÉ EN DÉSACCORD avec l'assemblage street par street.
refus('le Board: du résumé en désaccord',
      abimer('winamax-cash-sidepot.txt', 'Board: [6c 2d Qh 4s 4c]', 'Board: [6c 2d Qh 4s 5c]'),
      'controle-echoue', [1]);

// nº 4 — UN JOUEUR ENGAGE PLUS QU'IL N'A.
refus('un tapis rétréci sous ce qui est engagé',
      abimer('winamax-cash-sidepot.txt', 'Seat 3: bonjelaifait (50€)', 'Seat 3: bonjelaifait (40€)'),
      'controle-echoue', [3, 4, 5]);

// nº 6 — LE POT ANNONCÉ EN DÉSACCORD. Le rake se LIT : le fausser doit se voir.
refus('le rake faussé', abimer('winamax-cash-bbcode.txt', 'Rake 1.43€', 'Rake 2.43€'),
      'controle-echoue', [6]);
refus('le pot annoncé faussé',
      abimer('betclic-cash-showdown.txt', 'Total pot €417.00', 'Total pot €400.00'),
      'controle-echoue', [6]);

// nº 6 — LE GAGNANT ANNONCÉ N'EST PAS CELUI QUE LE MOTEUR DÉSIGNE. C'est la contre-épreuve la
// plus forte du pipeline : une action mal lue change le vainqueur ou le partage.
refus('un gagnant qui n\'a pas la meilleure main',
      abimer('betclic-cash-showdown.txt', 'JoueurBet: wins €417.00', 'villas27QJ: wins €417.00'),
      'controle-echoue', [6]);

// ─── Les refus de LECTURE, avant tout contrôle ────────────────────────────────────────────────
// ⚠️ UN MARQUEUR DE STREET INCONNU. Avalé dans le bloc courant — ce qu'il était avant —, un
// `*** SECOND FLOP ***` (run it twice) voyait ses cartes comptées comme celles de la street
// précédente : le board devenait faux SANS qu'aucun contrôle ne puisse s'en apercevoir.
refus('un marqueur de street inconnu',
      abimer('winamax-cash-sidepot.txt', '*** FLOP *** [6c 2d Qh]',
             '*** FLOP *** [6c 2d Qh]\n*** SECOND FLOP *** [Ks Kd Kh]'), 'ligne-incomprise');
refus('un marqueur inconnu chez Betclic',
      abimer('betclic-cash-fold.txt', '*** FLOP *** [C5 C2 H9]',
             '*** FLOP *** [C5 C2 H9]\n*** SECOND FLOP *** [SK DK HK]'), 'ligne-incomprise');
// … mais « SHOWDOWN » et « SHOW DOWN » sont le MÊME marqueur : les marqueurs se comparent sans
// leurs blancs, sinon une notation qui colle les deux mots serait refusée pour rien.
cas('« SHOWDOWN » vaut « SHOW DOWN »',
    abimer('winamax-cash-sidepot.txt', '*** SHOW DOWN ***', '*** SHOWDOWN ***').ok, true);

refus('un verbe inconnu', abimer('betclic-cash-fold.txt', 'abeille53: Fold', 'abeille53: Tergiverse'),
      'ligne-incomprise');
refus('une mise forcée inconnue',
      abimer('betclic-cash-fold.txt', 'Ludovic377: Post SB €5.00', 'Ludovic377: Post Straddle €5.00'),
      'mise-forcee-inconnue');
// ⚠️ `POSITION_SETS` a toujours un siège SB dès 3 joueurs : sans petite blinde postée, ce siège
// existerait sans que personne n'y ait rien mis.
refus('aucune petite blinde postée',
      abimer('betclic-cash-fold.txt', 'Ludovic377: Post SB €5.00\n', ''), 'sans-petite-blinde');
refus('une variante que Pokza ne joue pas',
      abimer('winamax-cash-bbcode.txt', 'Holdem no limit (0.50€/1€)', 'Omaha pot limit (0.50€/1€)'),
      'variante-non-prise-en-charge');
refus('un joueur qui agit sans être assis',
      abimer('winamax-cash-bbcode.txt', 'Seat 1: Incognito 1 (134.28€)\n', ''), 'ligne-incomprise');
refus('le fichier ne montre les cartes de personne',
      abimer('betclic-cash-fold.txt', 'Dealt to JoueurBet [C8 C9]\n', ''), 'hero-introuvable');
refus('aucun siège marqué DEALER', abimer('betclic-cash-fold.txt', '  DEALER', ''), 'bouton-introuvable');
// ⚠️ Renommer la seule ligne de SIÈGE ne prouve rien : elle orpheline les lignes d'action de ce
// joueur, et c'est « ligne-incomprise » qu'on obtient. Le doublon s'éprouve en renommant PARTOUT.
refus('deux joueurs du même nom',
      importerMain(lire('betclic-cash-showdown.txt').split('abeille53').join('Ludovic377')),
      'noms-en-double');

// Plus de 10 joueurs : Pokza s'arrête là (`POSITION_SETS`).
{
  const texte = lire('betclic-cash-fold.txt').replace(
    'Seat 1: villas27QJ (€360.25 in chips)',
    ['Seat 1: villas27QJ (€360.25 in chips)',
     ...Array.from({ length: 7 }, (_, i) => `Seat ${11 + i}: comparse${i} (€100.00 in chips)`)].join('\n')
  );
  refus('plus de 10 joueurs', importerMain(texte), 'trop-de-joueurs');
}

// ─── Ce qui n'est pas une main ────────────────────────────────────────────────────────────────
refus('un texte vide', importerMain('   \n  '), 'texte-vide');
refus('un texte qui n\'est pas une hand history', importerMain('Salut, regarde ma main : AA au bouton'),
      'format-inconnu');
// PAS D'IMPORT EN SÉRIE, JAMAIS : un fichier de session est un refus explicite, pas une prise du
// premier élément — l'auteur doit savoir laquelle des mains part.
{
  const deux = `${lire('betclic-cash-fold.txt')}\n\n${lire('betclic-cash-showdown.txt')}`;
  cas('deux mains dans le même texte : comptées', compterLesMains(deux), 2);
  refus('deux mains dans le même texte : refusées', importerMain(deux), 'plusieurs-mains');
  const troisWina = [1, 2, 3].map(() => lire('winamax-cash-bbcode.txt')).join('\n\n');
  cas('trois mains Winamax : comptées', compterLesMains(troisWina), 3);
  refus('trois mains Winamax : refusées', importerMain(troisWina), 'plusieurs-mains');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. LA LIMITE DES CONTRÔLES, ÉCRITE NOIR SUR BLANC
// ═══════════════════════════════════════════════════════════════════════════════════════════════

console.log('\n─── 3. Ce que les contrôles NE savent pas faire ────────────────────────────────');

// ⚠️⚠️ LE SEUL TEST DU DÉPÔT QUI AFFIRME UN TROU. Betclic met des `€` sur des jetons de tournoi.
// Lue comme un cash game à 10/20 € avec 200 € de tapis, la main est PARFAITEMENT COHÉRENTE : les
// six contrôles passent, seul le SENS est faux. Les contrôles vérifient la cohérence interne
// d'une lecture, pas son interprétation.
//
// C'EST CE QUI INTERDIT DE JAMAIS DÉPLACER LA LECTURE DU TYPE DE PARTIE APRÈS CELLE DES MONTANTS.
// Si ce test se met un jour à échouer, c'est que quelque chose a rendu la mécompréhension
// détectable — bonne nouvelle, mais à comprendre avant de supprimer le test.
{
  const lue = betclic.lit(lire('betclic-tournoi.txt'));
  cas('la lecture honnête dit « tournoi »', lue.typePartie, 'tournoi');

  const menteuse = { ...lue, typePartie: 'cash', devise: 'EUR' };
  const montage = monter(menteuse);
  const controles = verifier(menteuse, montage);
  cas('lue comme du CASH, les six contrôles passent quand même',
      controles.filter((c) => !c.ok).map((c) => c.numero), []);
  cas('… et la main serait un cash game à 10/20 € (faux, mais cohérent)',
      [montage.hand.gameType, montage.hand.currency, montage.hand.effectiveStack],
      ['cash', 'EUR', 200]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. LE BRANCHEMENT SUR L'AVAL, QUI EXISTAIT DÉJÀ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `postToSeed` → `seedStart` → `LiveHandCreator` est le chemin de « Corriger la main », en
// production. L'import n'a rien à réécrire — mais il doit produire EXACTEMENT ce que ce chemin
// attend, et l'invariant du rehydrate est que les sièges reconstruits soient identiques.

console.log('\n─── 4. La main importée entre dans le créateur ─────────────────────────────────');

for (const fichier of Object.keys(resultats)) {
  const r = resultats[fichier];
  if (!r.ok) continue;
  const seed = postToSeed(r.source);
  const ctx = seed.context;
  const reconstruits = buildSeats(ctx.numPlayers, ctx.heroPosition, ctx.effectiveStack,
                                  ctx.opponentNames, ctx.seatStacks, ctx.heroName);
  // L'invariant du rehydrate : des identifiants déterministes, donc les `seatId` des actions
  // restent valides même après un retour jusqu'à l'étape 1.
  cas(`${fichier} — sièges reconstruits à l'identique`,
      reconstruits.map((s) => `${s.id}/${s.startingStack}/${s.isHero}`),
      r.source.hand.seats.map((s) => `${s.id}/${s.startingStack}/${s.isHero}`));
  const depart = seedStart(seed);
  cas(`${fichier} — s'ouvre sur l'étape « Publier »`, depart.phase, 'review');
  cas(`${fichier} — le « ‹ » a des étapes où redescendre`, seedHistory(seed).length > 1, true);
  cas(`${fichier} — aucun pseudo importé`,
      [ctx.heroName, ctx.opponentNames].filter(Boolean), []);
  cas(`${fichier} — pas de titre proposé`, seed.review.title, '');
  // ⚠️ LA PROVENANCE DOIT SURVIVRE À UNE CORRECTION. Corriger une main la REPUBLIE en rebâtissant
  // `hand` depuis l'état du créateur : si le seed ne la portait pas, une main importée puis
  // corrigée perdrait sa mention en silence. Même chemin que `revealShowdown`.
  cas(`${fichier} — marquée importée, et le seed la porte`,
      [r.source.hand.imported, seed.imported], [true, true]);
}

// L'ante : `blinds.ante` vaut pareil qu'il soit posté par la seule BB ou par tout le monde — seul
// le NOMBRE de `post-ante` tranche, et se tromper double le pot de départ.
{
  const seed = postToSeed(resultats['winamax-tournoi-split.txt'].source);
  cas('tournoi wina — relu comme « un ante par joueur »',
      [seed.context.anteType, seed.context.ante], ['per-player', 160]);
  cas('tournoi wina — aucun straddle', seed.context.straddleCount, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 bis. CE QU'ON DIT À L'AUTEUR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `importerMain` rend un message TECHNIQUE (« marqueur inconnu : *** SECOND FLOP *** ») ; l'écran
// en montre un autre. Un code de refus ajouté sans son libellé ne se verrait qu'en production,
// sous la forme d'une phrase de secours — la liste `CODES_DE_REFUS` existe pour que ça se voie ici.

console.log('\n─── 4 bis. Les messages de refus ──────────────────────────────────────────────');

{
  const secours = "Ce texte n'a pas pu être lu.";
  cas('chaque code de refus a son libellé',
      CODES_DE_REFUS.filter((c) => !messageDeRefus(c) || messageDeRefus(c) === secours), []);
  // Le nombre est ajouté au message : savoir qu'il y en avait 47 explique le refus mieux que la
  // seule consigne.
  cas('« plusieurs mains » compte les mains',
      messageDeRefus('plusieurs-mains', 47), 'Il y a 47 mains dans ce texte. Colle une seule main.');
  // Sans le nombre, la phrase nomme quand même la cause : « colle une seule main » tout seul se
  // lit comme un reproche sans explication.
  cas('… et se passe du nombre quand il manque',
      messageDeRefus('plusieurs-mains'), 'Il y a plusieurs mains dans ce texte. Colle une seule main.');
  // Le message du chantier : il ne dit pas « erreur », il dit qu'on a préféré refuser.
  cas('le refus des contrôles assume le refus',
      /Mieux vaut refuser/.test(messageDeRefus('controle-echoue')), true);
  // ⚠️ LE SEUL REFUS QUI APPELLE UNE SUITE HORS DE L'APP. Il doit dire (1) quoi faire maintenant,
  // (2) où écrire. Et il ne doit PLUS nommer de salles : depuis la grammaire générique, la
  // couverture est une propriété par MAIN et non par SITE.
  const inconnu = messageDeRefus('format-inconnu');
  cas('format inconnu — dit quoi faire maintenant', /saisir la main toi-même/.test(inconnu), true);
  cas('format inconnu — donne l\'adresse', /contact@pokza\.app/.test(inconnu), true);
  cas('format inconnu — ne nomme aucune salle', /Winamax|Betclic|PokerStars/.test(inconnu), false);
}

// Le détail technique d'un format inconnu doit être la PREMIÈRE LIGNE du texte — c'est elle qui
// identifie une salle, et c'est elle qu'un auteur nous enverra. Répéter le refus n'apprenait rien.
{
  const r = importerMain("UnePokerRoom Hand #12: Hold'em\nSeat 1: toto (100)");
  cas('format inconnu — le détail nomme la première ligne',
      r.ok ? 'ACCEPTÉE' : r.message, "UnePokerRoom Hand #12: Hold'em");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 ter. LA GRAMMAIRE GÉNÉRIQUE — les salles qu'on n'a jamais vues
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Presque tous les formats texte descendent de celui de PokerStars. Ce dialecte lit la FAMILLE, et
// il est essayé EN DERNIER — jamais avant un dialecte mesuré, qui sait des choses que la famille
// ignore (l'équation du pot de sa salle, la place de ses cartes, son témoin de positions).
//
// ⚠️ CE QUI EST PROUVÉ ICI ET CE QUI NE L'EST PAS. Aucune main d'une troisième salle n'a été
// mesurée au 04/09/2026. Les vérifications se répartissent donc en deux familles, et il ne faut
// pas les confondre :
//   • SUR DONNÉES RÉELLES — la grammaire générique lit les deux vraies mains Winamax en notation
//     simple, SANS RIEN SAVOIR DE WINAMAX, et tombe d'accord avec le dialecte dédié action par
//     action. C'est la vraie validation de l'hypothèse « famille ».
//   • SUR MAINS SYNTHÉTIQUES — écrites ici d'après ce qu'on CROIT savoir d'un format. Elles
//     prouvent que le lecteur lit ce qu'on croit ; elles ne prouvent RIEN sur ce qu'un vrai
//     fichier contient. Elles ne vont donc PAS dans `scripts/corpus/`, réservé au réel, et leurs
//     libellés commencent par « synthétique » pour qu'on ne les confonde jamais avec une mesure.
//     ⚠️ Depuis que de vraies mains PokerStars sont au corpus (04/09/2026), leur seule utilité
//     restante est de servir de SUBSTRAT aux tests de refus (chat, blinde morte, verbe inconnu,
//     run-it-twice) : leurs assertions « les 6 contrôles passent » sont redondantes avec du réel.

console.log('\n─── 4 ter. La grammaire générique ─────────────────────────────────────────────');

const parGenerique = (texte) => {
  const lue = generique.lit(texte);
  const montage = monter(lue);
  return { lue, montage, controles: verifier(lue, montage) };
};

// ─── Sur données RÉELLES : deux lecteurs indépendants, le même résultat ───────────────────────
for (const fichier of ['winamax-cash-sidepot.txt', 'winamax-tournoi-split.txt']) {
  const texte = lire(fichier);
  cas(`${fichier} — la famille reconnaît la notation simple`, generique.reconnait(texte), true);
  const { montage, controles } = parGenerique(texte);
  cas(`${fichier} — les 6 contrôles passent SANS dialecte dédié`,
      controles.filter((c) => !c.ok).map((c) => `nº${c.numero} ${c.detail}`), []);
  // LA vérification qui compte : le lecteur générique et le lecteur mesuré doivent tomber
  // d'accord sur tout ce qui fait la main. Une lecture cohérente mais différente serait pire
  // qu'un refus — c'est la seule façon de le voir.
  const dedie = resultats[fichier].source.hand;
  const commun = (h) => JSON.stringify({
    gameType: h.gameType, variant: h.variant, blinds: h.blinds, currency: h.currency,
    effectiveStack: h.effectiveStack, board: h.board,
    seats: h.seats.map((x) => [x.position, x.startingStack, x.isHero, cartes(x.holeCards)]),
    actions: h.actions.map((a) => [a.street, a.seatId, a.type, a.amount ?? null]),
  });
  cas(`${fichier} — générique et dédié lisent la MÊME main`, commun(montage.hand) === commun(dedie), true);
}

// ─── POKERSTARS, quatre vraies mains trouvées sur le web le 04/09/2026 ───────────────────────
// La grammaire générique avait été écrite d'après ce que je CROYAIS savoir du format PokerStars.
// Ces quatre mains sont la première confrontation au réel — trois ont passé du premier coup, la
// quatrième a révélé une erreur de ma part sur `is sitting out`.
{
  const r = resultats['pokerstars-tournoi-ante-prime.txt'];
  const h = r.source.hand;
  cas('stars tournoi — lu par la grammaire générique', r.provenance.dialecte, 'generique');
  cas('stars tournoi — 9 joueurs, antes, jetons',
      [h.seats.length, h.blinds, h.currency], [9, { sb: 300, bb: 600, ante: 90 }, undefined]);
  // `Level XVIII` — les niveaux de PokerStars sont en chiffres ROMAINS.
  cas('stars tournoi — le niveau romain converti', r.source.level, 'Niveau 18');
  // `$2.00+$2.00+$0.40 USD` : TROIS parts, et un code ISO à retirer avant de sommer.
  cas('stars tournoi — buy-in à trois parts sommé', r.source.buyIn, '$4.4');
  // ⚠️ LA PRIME D'ÉLIMINATION N'EST PAS UN GAIN DE POT : « mousson wins $1 for eliminating Hero »
  // ajoutait une part fantôme de 1 à côté des 18 010 du pot. Un seul gagnant l'absorbait ici ;
  // sur un pot PARTAGÉ les proportions auraient été fausses et une main juste refusée.
  cas('stars tournoi — la prime n\'est pas comptée comme un gain',
      determinePotAwards(h), [{ seatId: 's-utg', fraction: 1 }]);
}
{
  const r = resultats['pokerstars-cash-heads-up.txt'];
  const h = r.source.hand;
  // À DEUX, le bouton EST la petite blinde : `POSITION_SETS[2]` n'a pas de siège SB.
  cas('stars heads-up — 2 joueurs, héros au bouton',
      [h.seats.length, h.seats.find((s) => s.isHero).position], [2, 'BTN']);
  // ⚠️ Le résumé écrit « Seat 3: Hero (button) (small blind) » — DEUX parenthèses. Ne lire que la
  // première perdait le témoin des blindes.
  cas('stars heads-up — le témoin des blindes survit aux deux parenthèses',
      r.controles.find((c) => c.numero === 2).temoin, true);
  cas('stars heads-up — board de 4 cartes (fold au turn)', boardDe(h), '5s Jd Jc 2s');
}
{
  const r = resultats['pokerstars-tournoi-siege-leve.txt'];
  const h = r.source.hand;
  // ⚠️ MON ERREUR, CORRIGÉE PAR CETTE MAIN. J'excluais tout siège marqué `is sitting out` — or ici
  // un tel joueur POSTE SON ANTE puis se couche : il est dans le coup, le drapeau ne concerne que
  // la main suivante. L'exclure faisait refuser la main (« ligne incomprise : 427tireur: posts the
  // ante 60 ») et, pire, aurait décalé les positions de tout le monde. Il faut DEUX signaux : le
  // drapeau ET l'absence du nom partout ailleurs.
  cas('stars siège levé — le joueur marqué « sitting out » reste à table', h.seats.length, 9);
  cas('stars siège levé — et son ante est comptée',
      h.actions.filter((a) => a.type === 'post-ante').length, 9);
}

// ─── LE CASHOUT DE GGPOKER : REFUSÉ (Victor, 04/09/2026) ──────────────────────────────────────
// Une vraie main GG, gardée au corpus pour ce qu'elle REFUSE. Le joueur y paie 10,09 de prime pour
// encaisser son équité avant la fin : il touche un QUART de moins que le pot de 41,87 que Pokza
// afficherait. Le déroulé du coup est pourtant exact, et ces lignes n'entrent pas dans le pot —
// donc AUCUN contrôLE ne les verrait. C'est le seul refus qui porte sur le SENS du résultat et non
// sur sa cohérence.
{
  const r = resultats['ggpoker-cash-cashout.txt'];
  cas('gg cashout — refusée', r.ok ? 'ACCEPTÉE À TORT' : r.code, 'main-avec-cashout');
  cas('gg cashout — le message dit ce qui cloche',
      /n'a pas touché le pot affiché/.test(messageDeRefus('main-avec-cashout')), true);
  // ⚠️ ET SANS SES LIGNES DE CASHOUT, ELLE SE LIT PARFAITEMENT — c'est bien le cashout qu'on
  // refuse, pas le format GGPoker. Cette main reste la seule preuve qu'une room sans dialecte
  // dédié est lisible de bout en bout : 6 sièges, héros au CO, et le board qui ne se laisse pas
  // polluer par les mains montrées en cours de street.
  const sansCashout = lire('ggpoker-cash-cashout.txt')
    .split('\n').filter((l) => !/(Chooses to|Pays Cashout)/i.test(l)).join('\n');
  const propre = importerMain(sansCashout);
  cas('gg — sans le cashout, la main est lue', propre.ok === true ? propre.provenance.dialecte : propre.code,
      'generique');
  if (propre.ok) {
    const h = propre.source.hand;
    cas('gg — 6 joueurs, héros au CO',
        [h.seats.length, h.seats.find((s) => s.isHero).position], [6, 'CO']);
    // ⚠️ LE BUG QUE CETTE MAIN A RÉVÉLÉ. GG retourne les mains dès le tapis, donc
    // `Hero: shows [Jh Jc]` vit DANS le bloc du flop : lire « les N dernières cartes du bloc »
    // donnait `Jc Ah Kc` — les cartes des joueurs — comme flop. Les cartes d'une street ne se
    // lisent plus que sur la LIGNE DU MARQUEUR.
    cas('gg — le board n\'attrape pas les mains montrées en cours de street',
        boardDe(h), 'Qh 8s 2c Jd 9s');
    cas('gg — Σ des contributions', somme(h), 70.49);
    // La mise non suivie DÉRIVÉE tombe pile sur celle que GG ANNONCE.
    cas('gg — mise non suivie dérivée = annoncée',
        miseNonSuivie(committedBySeat(h.actions)), 28.62);
    cas('gg — les trois valets emportent le pot',
        determinePotAwards(h), [{ seatId: 's-co', fraction: 1 }]);
  }
}

// La notation BBCode de Winamax n'est PAS de la famille : ses marqueurs sont des balises, et les
// cartes du héros vivent sur la ligne suivante. Elle doit rester hors de portée.
cas('la notation BBCode n\'est pas de la famille',
    generique.reconnait(lire('winamax-cash-bbcode.txt')), false);

// ⚠️ LE REFUS DÉLIBÉRÉ, vérifié sur du réel : Betclic écrit `Raise (NF) €20.00`, sans « to ».
// Impossible de savoir si le montant est l'incrément ou le total, et se tromper d'un cran sur une
// relance change tout le déroulé. Son dialecte dédié, lui, SAIT que c'est un total (mesuré) — donc
// rien n'est perdu en pratique, et c'est bien lui qui la lit (ordre des dialectes).
for (const fichier of ['betclic-cash-fold.txt', 'betclic-cash-showdown.txt', 'betclic-tournoi.txt']) {
  let refus = null;
  try { parGenerique(lire(fichier)); } catch (e) { refus = e.code; }
  cas(`${fichier} — la famille refuse la relance sans « to »`, refus, 'ligne-incomprise');
  cas(`${fichier} — mais le dialecte dédié la lit`, resultats[fichier].provenance.dialecte, 'betclic');
}
cas('une main Winamax reste lue par SON dialecte, pas par la famille',
    resultats['winamax-cash-sidepot.txt'].provenance.dialecte, 'winamax');

// ─── Sur mains SYNTHÉTIQUES : ce qu'aucun vrai fichier du corpus n'exerce ─────────────────────
// ⚠️ ÉCRITES DE MÉMOIRE, pas mesurées. Elles éprouvent le lecteur, pas la réalité de PokerStars.
const STARS_CASH = [
  "PokerStars Hand #241234567890:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/01/02 16:39:38 CET",
  "Table 'Aludra II' 6-max Seat #2 is the button",
  'Seat 1: Alpha ($100 in chips)',
  'Seat 2: Bravo ($120 in chips)',
  'Seat 3: Charlie ($95 in chips)',
  'Seat 4: Delta ($200 in chips)',
  // Un joueur assis mais NON SERVI : le compter donnerait une table de 5 pour 4 servis, donc de
  // fausses positions pour tout le monde.
  'Seat 5: Echo ($60 in chips) is sitting out',
  'Charlie: posts small blind $0.50',
  'Delta: posts big blind $1',
  '*** HOLE CARDS ***',
  'Dealt to Delta [Ah As]',
  'Alpha: folds',
  'Bravo: raises $2 to $3',
  'Charlie: folds',
  'Delta: raises $7 to $10',
  'Bravo: said, "nh"',
  'Bravo: calls $7',
  '*** FLOP *** [6c 2d Qh]',
  'Delta: bets $12',
  'Bravo: folds',
  'Uncalled bet ($12) returned to Delta',
  'Delta collected $20.50 from pot',
  '*** SUMMARY ***',
  'Total pot $20.50 | Rake $0',
  'Board [6c 2d Qh]',
  'Seat 3: Charlie (small blind) folded before Flop',
  'Seat 4: Delta (big blind) collected ($20.50)',
].join('\n');

{
  const { lue, montage, controles } = parGenerique(STARS_CASH);
  cas('synthétique cash — les 6 contrôles passent', controles.filter((c) => !c.ok).map((c) => c.detail), []);
  // Le code ISO est plus sûr que le sigle : « $ » couvre huit devises de la table de Pokza.
  cas('synthétique cash — la devise vient du code ISO', montage.hand.currency, 'USD');
  cas('synthétique cash — 4 joueurs servis, pas 5', montage.hand.seats.length, 4);
  cas('synthétique cash — le tapis du joueur non servi ne compte pas', montage.hand.effectiveStack, 95);
  cas('synthétique cash — héros en BB', montage.hand.seats.find((s) => s.isHero).position, 'BB');
  cas('synthétique cash — la ligne de chat est ignorée',
      misesDe(montage.hand, 's-btn', 'preflop'), ['raise:3', 'call:10']);
  // ⚠️ LE TÉMOIN QUE NOS DEUX DIALECTES N'ONT PAS : la famille ÉCRIT la mise non suivie, là où
  // Winamax et Betclic la laissent dériver. C'est le seul contrôle qui existe sur la seule
  // quantité que le pipeline calcule sans rien avoir à comparer.
  cas('synthétique cash — la mise non suivie annoncée est lue', lue.resume.nonSuiviAnnonce, 12);
  cas('synthétique cash — et elle tombe d\'accord avec la dérivée', miseNonSuivie(committedBySeat(montage.hand.actions)), 12);
  cas('synthétique cash — aucun lieu : la famille ne peut pas déclarer ce qu\'elle lit',
      montage.location, undefined);
  // Une mise non suivie annoncée FAUSSE doit se voir — sinon le témoin ne sert à rien.
  let refuse = null;
  try {
    const t = STARS_CASH.replace('Uncalled bet ($12)', 'Uncalled bet ($9)');
    const c = parGenerique(t).controles.filter((x) => !x.ok);
    refuse = c.map((x) => x.numero);
  } catch (e) { refuse = e.code; }
  cas('synthétique cash — une mise non suivie faussée est vue', refuse, [6]);
}

const STARS_TOURNOI = [
  "PokerStars Hand #241234567891: Tournament #3456789012, $4.60+$0.40 USD Hold'em No Limit - Level V (100/200) - 2026/01/02 17:00:00 CET",
  "Table '3456789012 3' 3-max Seat #1 is the button",
  'Seat 1: Alpha (3000 in chips)',
  'Seat 2: Bravo (5000 in chips)',
  'Seat 3: Charlie (4000 in chips)',
  'Alpha: posts the ante 25',
  'Bravo: posts the ante 25',
  'Charlie: posts the ante 25',
  'Bravo: posts small blind 100',
  'Charlie: posts big blind 200',
  '*** HOLE CARDS ***',
  'Dealt to Charlie [Ah As]',
  'Alpha: raises 400 to 600',
  'Bravo: folds',
  'Charlie: raises 1000 to 1600',
  'Alpha: calls 1000',
  '*** FLOP *** [6c 2d Qh]',
  'Charlie: bets 1400',
  'Alpha: calls 1375 and is all-in',
  'Uncalled bet (25) returned to Charlie',
  '*** TURN *** [6c 2d Qh] [4s]',
  '*** RIVER *** [6c 2d Qh 4s] [4c]',
  '*** SHOW DOWN ***',
  'Charlie: shows [Ah As] (two pair, Aces and Fours)',
  'Alpha: shows [Ks 9d] (a pair of Fours)',
  'Charlie collected 6125 from pot',
  '*** SUMMARY ***',
  'Total pot 6125 | Rake 0',
  'Board [6c 2d Qh 4s 4c]',
].join('\n');

{
  const { montage, controles } = parGenerique(STARS_TOURNOI);
  cas('synthétique tournoi — les 6 contrôles passent', controles.filter((c) => !c.ok).map((c) => c.detail), []);
  cas('synthétique tournoi — jetons, donc aucune devise',
      [montage.hand.gameType, montage.hand.currency], ['tournament', undefined]);
  // ⚠️ `Level V` — PokerStars numérote ses niveaux en chiffres ROMAINS, là où Pokza stocke
  // « Niveau 12 ». Illisible, le niveau serait simplement abandonné (il ne coûte rien).
  cas('synthétique tournoi — le niveau romain est converti', montage.level, 'Niveau 5');
  // Le code ISO derrière le prix empêcherait `normaliserBuyIn` de sommer : il est retiré avant.
  cas('synthétique tournoi — buy-in sommé malgré le code ISO', montage.buyIn, '$5');
  cas('synthétique tournoi — un ante par joueur', montage.hand.blinds, { sb: 100, bb: 200, ante: 25 });
  // Le nom d'épreuve n'existe pas dans un en-tête de la famille : c'est un NUMÉRO de tournoi.
  cas('stars tournoi — aucun nom d\'épreuve à inventer', montage.tournamentName, undefined);
}

// ─── DEUX BUGS SILENCIEUX PAYÉS LE 05/09, chacun mesuré sur de vraies mains Full Tilt ────────
{
  // ⚠️ nº 1 — LE SÉPARATEUR DE MILLIERS ÉTAIT COUPÉ AVEC LA PRIME. Les deux dialectes faisaient
  // `split(',')` sur la parenthèse du siège pour écarter la prime d'un tournoi à élimination
  // (`1500 in chips, $2.50 bounty`) — et coupaient du même geste `$1,020`, lu **1**. Un tapis de
  // mille vingt dollars devenait un dollar. Aucune main fausse n'a pu partir (le contrôle nº 4
  // voyait « BTN engage 5 pour un tapis de 1 »), mais TOUTE main à tapis de quatre chiffres était
  // perdue en silence, et le refus accusait la mauvaise cause.
  const { montage } = parGenerique(STARS_CASH.replace('Bravo ($120 in chips)', 'Bravo ($1,020 in chips)'));
  cas('un tapis à séparateur de milliers n\'est pas coupé',
      montage.hand.seats.find((x) => x.position === 'BTN').startingStack, 1020);
  // Et la raison d'être du découpage doit survivre : la prime reste écartée.
  const avecPrime = parGenerique(STARS_CASH.replace('Bravo ($120 in chips)', 'Bravo (1020 in chips, $2.50 bounty)'));
  cas('… mais la prime derrière la virgule reste écartée',
      avecPrime.montage.hand.seats.find((x) => x.position === 'BTN').startingStack, 1020);
  // Le cas qui porte les deux à la fois.
  const lesDeux = parGenerique(STARS_CASH.replace('Bravo ($120 in chips)', 'Bravo ($1,151.70 in chips, $2.50 bounty)'));
  cas('… les deux ensemble', lesDeux.montage.hand.seats.find((x) => x.position === 'BTN').startingStack, 1151.7);
}
{
  // ⚠️ nº 2 — LE DRAPEAU « is sitting out » NE VIT PAS AU MÊME ENDROIT D'UNE SALLE À L'AUTRE.
  // Full Tilt l'écrit DANS LE RÉSUMÉ, là où PokerStars le met sur la ligne de siège. Ne le
  // chercher qu'en en-tête faisait lire une table de 5 pour 4 servis, donc de fausses positions
  // pour tout le monde.
  const dansLeResume = STARS_CASH
    .replace('Seat 5: Echo ($60 in chips) is sitting out', 'Seat 5: Echo ($60 in chips)')
    .replace('Board [6c 2d Qh]', 'Board [6c 2d Qh]\nSeat 5: Echo is sitting out');
  const { montage } = parGenerique(dansLeResume);
  cas('« sitting out » lu depuis le résumé aussi', montage.hand.seats.length, 4);
  cas('… et le tapis du non-servi ne compte toujours pas', montage.hand.effectiveStack, 95);
}

// ─── Ce que la famille doit REFUSER ───────────────────────────────────────────────────────────
const refuseGenerique = (titre, texte, code) => {
  let obtenu = 'ACCEPTÉE À TORT';
  try { parGenerique(texte); } catch (e) { obtenu = e.code; }
  cas(titre, obtenu, code);
};
// Une blinde morte n'a AUCUN modèle dans Pokza : la lire comme une petite blinde décalerait tout
// le pot de départ, et rien ne le dirait.
refuseGenerique('une blinde morte (« small & big blinds »)',
  STARS_CASH.replace('Charlie: posts small blind $0.50', 'Charlie: posts small & big blinds $1.50'),
  'mise-forcee-inconnue');
// Une tournure de politesse absente de `SANS_EFFET` refuse — c'est la bonne direction d'erreur.
refuseGenerique('un verbe jamais vu', STARS_CASH.replace('Alpha: folds', 'Alpha: tergiverse'),
  'ligne-incomprise');
refuseGenerique('un marqueur de run-it-twice',
  STARS_CASH.replace('*** FLOP *** [6c 2d Qh]', '*** FIRST FLOP *** [6c 2d Qh]'), 'ligne-incomprise');
refuseGenerique('une variante que Pokza ne joue pas',
  STARS_CASH.replace("Hold'em No Limit", 'Omaha Pot Limit'), 'variante-non-prise-en-charge');
refuseGenerique('un Hold\'em à structure limitée',
  STARS_CASH.replace("Hold'em No Limit", "Hold'em Limit"), 'variante-non-prise-en-charge');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 quater. LA FAMILLE PARTYPOKER / 888 — l'autre grande famille des formats texte
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ MAINS SYNTHÉTIQUES, et il faut savoir ce que ça vaut : la GRAMMAIRE vient de 84 vrais
// fichiers (partypoker, 888poker, LuckyAcePoker.com, Cassava), mais aucune de ces mains n'est
// commitable — le dépôt d'où elles viennent n'a AUCUNE LICENCE. Ces deux mains-ci les rejouent
// donc de mémoire, à la ligne près, avec une arithmétique calculée à la main. Elles éprouvent le
// lecteur, pas la réalité de partypoker (cf. `scripts/corpus/LISEZ-MOI.md`).
//
// LE FAIT QUI TIENT TOUT LE DIALECTE : `raises [$0.45]` N'A PAS DE « to », et c'est un INCRÉMENT.
// Mesuré sur quatre vraies mains, dont deux où l'autre lecture donne un rake NÉGATIF. La main A
// le rejoue : la petite blinde a 0,05 en jeu, relance de 0,45, et son adversaire complète de 0,40
// depuis 0,10 — les deux arrivent à 0,50, et le tour ne ferme QUE dans cette lecture.

console.log('\n─── 4 quater. La famille partypoker / 888 ─────────────────────────────────────');

const PARTY_CASH = [
  '***** Hand History for Game 12345678901 *****',
  "$0.05/$0.10 USD NL Texas Hold'em - Monday, January 06, 08:54:23 EST 2014",
  'Table Roubaix (Real Money)',
  'Seat 3 is the button',
  'Total number of players : 7/7 ',
  'Seat 3: Alpha ( $10 USD )',
  'Seat 4: Bravo ( $20 USD )',
  'Seat 5: Charlie ( $15 USD )',
  'Seat 6: Delta ( $8 USD )',
  'Seat 1: Echo ( $12 USD )',
  // Un point ET un espace dans le nom : partypoker en est plein (`dr. spaz`, `marlboro man`).
  'Seat 2: dr. spaz ( $9 USD )',
  // ⚠️ ASSIS MAIS NON SERVI, et RIEN NE LE DIT — mesuré sur une vraie main partypoker. Son tapis
  // est le plus petit de la table exprès : s'il était compté, le stack effectif tomberait à 3.
  'Seat 7: Foxtrot ( $3 USD )',
  'Bravo posts small blind [$0.05 USD].',
  'Charlie posts big blind [$0.10 USD].',
  '** Dealing down cards **',
  'Dealt to Bravo [ Ah, As ]',
  'Delta folds',
  'zzTop has joined the table.',
  'Echo folds',
  'dr. spaz calls [$0.10 USD]',
  'Alpha folds',
  'Bravo raises [$0.45 USD]',
  'Echo: nh bien joue',
  'Charlie folds',
  'dr. spaz calls [$0.40 USD]',
  '** Dealing Flop ** [ 7c, 2d, Qh ]',
  'Bravo bets [$1 USD]',
  'dr. spaz raises [$3 USD]',
  'Bravo calls [$2 USD]',
  '** Dealing Turn ** [ 4s ]',
  'Bravo checks',
  'Delta will be using his time bank for this hand.',
  'dr. spaz bets [$2 USD]',
  'Bravo calls [$2 USD]',
  '** Dealing River ** [ 9h ]',
  'Bravo checks',
  'dr. spaz is all-In  [$3.50 USD]',
  'Bravo calls [$3.50 USD]',
  'dr. spaz shows [ Kd, Kh ]a pair of Kings.',
  'Bravo shows [ Ah, As ]a pair of Aces.',
  'Bravo wins $17.20 USD from the main pot with a pair of Aces.',
].join('\n');

{
  const r = importerMain(PARTY_CASH);
  cas('party — la main est lue', r.ok === true ? [] : [r.code, r.message], []);
  const h = r.source.hand;
  cas('party — les 6 contrôles passent', r.controles.filter((c) => !c.ok).map((c) => c.detail), []);
  cas('party — le dialecte dédié, pas la famille générique', r.provenance.dialecte, 'party888');
  // ⚠️ partypoker N'ÉCRIT NULLE PART SON NOM : l'en-tête est `***** Hand History for Game N *****`.
  // Le lieu reste donc VIDE plutôt que deviné (décision nº 4 du 04/09).
  cas('party — aucune salle nommée : le lieu reste vide', r.provenance.salle, undefined);
  cas('party — 6 servis sur 7 assis', h.seats.length, 6);
  cas('party — le tapis du non-servi ne compte pas', h.effectiveStack, 8);
  cas('party — héros en SB', h.seats.find((s) => s.isHero).position, 'SB');
  cas('party — la devise vient du code ISO', h.currency, 'USD');
  cas('party — cash game', h.gameType, 'cash');
  // LE TEST QUI PORTE LE DIALECTE : `raises [0.45]` depuis 0,05 de petite blinde = 0,50 au TOTAL.
  cas('party — une relance est un INCRÉMENT sur ce qui est déjà misé',
      misesDe(h, 's-sb', 'preflop'), ['post-sb:0.05', 'raise:0.5']);
  cas('party — le suivi complète jusqu\'au même total',
      misesDe(h, 's-co', 'preflop'), ['call:0.1', 'call:0.5']);
  cas('party — « is all-In » est l\'exact reste du tapis', somme(h), 18.1);
  cas('party — le board s\'assemble street par street', boardDe(h), '7c 2d Qh 4s 9h');
  cas('party — la main importée porte sa marque', h.imported, true);

  // L'AVAL EST LE MÊME POUR TOUS LES DIALECTES, et c'est ce qui rend une salle bon marché : rien
  // en dessous de la forme neutre ne se réécrit. On le vérifie quand même sur un dialecte neuf —
  // c'est le seul endroit où une salle pourrait casser autre chose qu'elle-même.
  const seed = postToSeed(r.source);
  cas('party — s\'ouvre sur l\'étape « Publier »', seedStart(seed).phase, 'review');
  cas('party — aucun pseudo importé, « dr. spaz » compris',
      [seed.context.heroName, seed.context.opponentNames].filter(Boolean), []);
  cas('party — la provenance survit au seed (donc à une correction)', seed.imported, true);
}

// ─── PMU : LA VRAIE MAIN, ET C'EST UN TOURNOI ────────────────────────────────────────────────
// ⚠️ PMU POKER TOURNE SUR PARTYGAMING — trouvée le 05/09/2026 sur un forum français, partagée par
// le joueur lui-même (donc avec son héros), et VÉRIFIÉE AU JETON : Σ des engagements = 223 226 =
// exactement la somme des quatre pots annoncés, et quatre joueurs atteignent leur tapis annoncé au
// jeton près. Si les comptes tombent juste à ce point, la main est authentique ET complète.
//
// ⚠️⚠️ ELLE PROUVE AUSSI POURQUOI LE GARDE-FOU DES TOURNOIS ÉTAIT JUSTE. Avant cette main, aucun
// tournoi de cette famille n'avait été vu, et le dialecte refusait `Trny:`. Sans ce refus, cette
// main-ci se lisait comme un CASH GAME à 2 500/5 000 € — le `€0.50` du buy-in habillant des jetons
// — et elle passait LES SIX CONTRÔLES, exactement comme le tournoi Betclic. Ne jamais déplacer la
// lecture du type de partie après celle des montants.
{
  const r = resultats['pmu-tournoi-pots-secondaires.txt'];
  const h = r.source.hand;
  cas('pmu — le dialecte de la famille party', r.provenance.dialecte, 'party888');
  // L'en-tête ne nomme aucune salle : `***** Hand History for Game N *****`. PMU ne se déclare
  // nulle part, et le lieu reste vide plutôt que deviné (décision nº 4 du 04/09).
  cas('pmu — aucune salle nommable', r.provenance.salle, undefined);
  cas('pmu — tournoi, pas cash', h.gameType, 'tournament');
  // ⚠️ LES JETONS NE SONT PAS DE L'ARGENT, même avec un `€` à deux mots de là.
  cas('pmu — aucune devise sur des jetons', h.currency, undefined);
  cas('pmu — le buy-in est le seul montant réel', r.source.buyIn, '0.5€');
  cas('pmu — le nom d\'épreuve porte un €', r.source.tournamentName, '50€ Garantis Hyper Turbo Rebuy');
  cas('pmu — le niveau', r.source.level, 'Niveau 22');
  cas('pmu — un ante par joueur, et les deux blindes', h.blinds, { sb: 2500, bb: 5000, ante: 500 });
  cas('pmu — 8 servis sur 9 sièges', h.seats.length, 8);
  cas('pmu — héros en BB', h.seats.find((x) => x.isHero).position, 'BB');
  cas('pmu — Σ des engagements = les quatre pots annoncés', somme(h), 223226);
  // Les tapis atteints EXACTEMENT : la preuve que « is all-In [X] » et « raises [X] » sont des
  // incréments, sur une main de tournoi cette fois.
  const engage = committedBySeat(h.actions);
  cas('pmu — quatre tapis atteints au jeton',
      h.seats.filter((x) => engage[x.id] === x.startingStack).map((x) => x.position).sort(),
      ['BB', 'BTN', 'CO', 'UTG']);
  cas('pmu — quatre mains révélées à l\'abattage',
      h.seats.filter((x) => x.holeCards).length, 4);
  cas('pmu — le board complet', boardDe(h), 'Jd Tc 9d 6c 5c');
  // ⚠️ UNE PLACE PAYÉE N'EST PAS UN GAIN DE POT (`finished in 8 place and received €4.03 EUR`) :
  // de l'argent réel au milieu d'une main en jetons. La compter faisait échouer le contrôle nº 6.
  cas('pmu — les places payées ne sont pas des gains',
      r.controles.find((c) => c.numero === 6).ok, true);
}
// LES DEUX ÉQUATIONS DU POT DE LA MÊME FAMILLE, séparées par le VERBE du gain (`wins` contre
// `collected`) — et c'est la borne « encaissé ≤ misé » qui les met à l'épreuve, faute de « Total
// pot » et de rake dans cette famille.
const HUIT_CENT = [
  '#Game No : 987654321',
  '***** LuckyAcePoker.com Hand History for Game 987654321 *****',
  '$0.50/$1 Blinds No Limit Holdem - *** 14 04 2015 03:11:08',
  'Table Roubaix 6 Max (Real Money)',
  'Seat 6 is the button',
  'Total number of players : 3',
  'Seat 6: Alpha ( $100 )',
  'Seat 7: Bravo ( $100 )',
  'Seat 9: Charlie ( $100 )',
  'Bravo posts small blind [$0.50]',
  'Charlie posts big blind [$1]',
  '** Dealing down cards **',
  'Dealt to Bravo [ Kd, Kh ]',
  'Alpha folds',
  'Bravo raises [$2.50]',
  'Charlie folds',
  '** Summary **',
  'Bravo collected [ $2 ]',
].join('\n');

{
  const r = importerMain(HUIT_CENT);
  cas('888 — la main est lue', r.ok === true ? [] : [r.code, r.message], []);
  cas('888 — les 6 contrôles passent', r.controles.filter((c) => !c.ok).map((c) => c.detail), []);
  // ⚠️ AUCUN NOM DE SALLE N'EST CODÉ EN DUR : la signature CAPTURE ce que le fichier écrit de
  // lui-même. C'est ce qui a fait apparaître tout seuls `LuckyAcePoker.com` et `Cassava`.
  cas('888 — la salle vient de la signature, sans liste écrite d\'avance',
      r.provenance.salle, 'LuckyAcePoker.com');
  cas('888 — le lieu suit la salle', r.source.location, 'LuckyAcePoker.com');
  cas('888 — 3 joueurs, le bouton n\'est pas la petite blinde', r.source.hand.seats.length, 3);
  // Σ 4, non suivi 2, `collected` 2 : 888 SORT la mise non suivie du gain annoncé. Prouvé au
  // centime sur une vraie main sans flop (rake 0 — « no flop, no drop »).
  cas('888 — le gain annoncé exclut la mise non suivie', somme(r.source.hand), 4);
}

const refuseParty = (titre, texte, code) => {
  const r = importerMain(texte);
  cas(titre, r.ok ? 'ACCEPTÉE À TORT' : r.code, code);
};

// Une main de tournoi de cette famille dont l'en-tête n'a PAS `Trny:` reste refusée : la forme
// n'a jamais été mesurée, et la direction de l'échec ne change pas.
refuseParty('party — un tournoi de forme inconnue reste refusé',
  lire('pmu-tournoi-pots-secondaires.txt').replace('Trny:129592788 Level:22 Blinds-Antes', 'Tournament Level:22 Blindes'),
  'format-inconnu');

// LA BORNE DU POT : sans « Total pot » ni rake, ce qui reste de vrai sans aucun seuil, c'est qu'on
// n'encaisse pas plus qu'on n'a misé. 3 > 4 − 2 : impossible.
refuseParty('888 — encaisser plus que le pot possible est vu',
  HUIT_CENT.replace('collected [ $2 ]', 'collected [ $3 ]'), 'controle-echoue');
// La MÊME somme passe chez partypoker, dont le `wins` inclut la mise non suivie : les deux
// équations ne sont pas interchangeables, et c'est le verbe qui les sépare.
{
  const r = importerMain(HUIT_CENT.replace('Bravo collected [ $2 ]', 'Bravo wins $3 USD'));
  cas('party — le même montant passe, parce que « wins » inclut le non suivi', r.ok, true);
}

// ⚠️ LA BLINDE MORTE EST REFUSÉE, PAS DEVINÉE — les deux tournures mesurées de la famille. Pokza
// n'a aucun modèle pour une part morte, et le formulaire non plus : la main ne se relirait pas.
refuseParty('party — une blinde morte (« big blind + dead »)',
  PARTY_CASH.replace('Alpha folds', 'Alpha posts big blind + dead [$0.15 USD].'),
  'mise-forcee-inconnue');
refuseParty('888 — une blinde morte (« dead blind »)',
  HUIT_CENT.replace('Alpha folds', 'Alpha posts dead blind [$0.50 + $1]'),
  'mise-forcee-inconnue');
// Le fichier compte lui-même ses joueurs assis : un désaccord veut dire un collage tronqué, et une
// table amputée d'un siège décale TOUT le placement.
refuseParty('party — un collage tronqué se voit au compte des sièges',
  PARTY_CASH.replace('Seat 7: Foxtrot ( $3 USD )\n', ''), 'ligne-incomprise');
refuseParty('party — un verbe jamais vu',
  PARTY_CASH.replace('Delta folds', 'Delta tergiverse'), 'ligne-incomprise');
// L'AUTRE MOITIÉ DU DISCRIMINANT : sans `Trny:`, la main reste du CASH, et ses montants restent de
// l'argent. C'est ce couple-là qui décide du sens de tous les nombres de la main, et il se lit dans
// l'en-tête AVANT le premier montant — la vraie main PMU plus haut en est l'autre versant.
{
  const r = importerMain(PARTY_CASH);
  cas('party — sans « Trny: », la main reste du cash', r.source.hand.gameType, 'cash');
  cas('party — et ses montants sont de l\'argent', r.source.hand.currency, 'USD');
}

// ⚠️ LE MESSAGE QUI ÉTAIT FAUX, ET C'EST CE BLOC QUI L'INTERDIT. Une main d'une salle d'une AUTRE
// famille (WinningPoker) passait la signature générique — elle a bien des `Seat N:` et un
// `*** FLOP ***` — puis se faisait refuser en lisant sa PREMIÈRE LIGNE, qui n'est pas un en-tête :
// l'auteur lisait « Pokza ne lit que le Hold'em pour l'instant » DEVANT UNE MAIN DE HOLD'EM.
// Un message faux, et pire qu'inutile : il fait croire au joueur que son jeu n'est pas géré, donc
// il ne nous écrit pas. Désormais l'en-tête doit NOMMER un jeu pour que la famille se reconnaisse.
{
  const AUTRE_FAMILLE = [
    'Game started at: 2014/10/29 15:33:25',
    'Game ID: 328766507 1/2 Wichita Falls (Hold\'em)',
    'Seat 4 is the button',
    'Seat 1: Alpha (224.12).',
    'Seat 2: Bravo (31.55).',
    'Player Alpha has small blind (1)',
    'Player Bravo has big blind (2)',
    '*** FLOP ***: [7c Qd Kd]',
  ].join('\n');
  const r = importerMain(AUTRE_FAMILLE);
  cas('un en-tête qui ne nomme aucun jeu n\'est PAS de la famille', r.code, 'format-inconnu');
  cas('… et son message demande l\'exemple qui manque',
      messageDeRefus(r.code).includes('contact@pokza.app'), true);
  // Un Omaha de la famille PokerStars, lui, doit rester RECONNU pour être refusé en nommant sa
  // variante — là, la phrase est vraie.
  const r2 = importerMain(STARS_CASH.replace("Hold'em No Limit", 'Omaha Pot Limit'));
  cas('… mais un Omaha de la famille garde son vrai message', r2.code, 'variante-non-prise-en-charge');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 quinquies. LA NOTATION PAR POSITIONS — celle des outils de suivi, pas d'une salle
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ CETTE NOTATION RENVERSE LE PROBLÈME : les sièges SONT les positions. Partout ailleurs, tout le
// placement dépend d'une seule donnée — quel siège porte le bouton — que rien d'autre ne dit ; ici
// elle est écrite. Le dialecte fabrique donc des numéros de siège tels que l'anneau du montage
// redonne exactement ces positions, et AUCUNE ligne de logique partagée ne bouge.
//
// ⚠️ ET C'EST UN OUTIL, PAS UNE SALLE : le lieu reste VIDE (décision nº 4 du 04/09, confirmée par
// Victor le 05/09). Le dialecte porte le nom de sa NOTATION, pas celui du produit.

console.log('\n─── 4 quinquies. La notation par positions ─────────────────────────────────────');

{
  const r = resultats['positions-cash-totaux.txt'];
  const h = r.source.hand;
  cas('positions — le dialecte de la notation', r.provenance.dialecte, 'positions');
  // Un OUTIL ne donne son nom à rien : ni salle, ni lieu.
  cas('positions — aucune salle, aucun lieu', [r.provenance.salle, r.source.location], [undefined, undefined]);
  cas('positions — 8 joueurs', h.seats.length, 8);
  cas('positions — héros en SB', h.seats.find((x) => x.isHero).position, 'SB');
  // ⚠️ LE TEST QUI PORTE LE DIALECTE : `SB: raise 130` alors que la SB a déjà 2 en jeu, et le
  // bouton suit à 130. En incrément la SB serait à 132 et le tour ne fermerait pas ; en TOTAL les
  // deux sont à 130 — et le pot recoupe le gain annoncé au jeton près.
  cas('positions — les montants sont des TOTAUX de street',
      misesDe(h, 's-sb', 'preflop'), ['post-sb:2', 'raise:130']);
  cas('positions — Σ = le gain annoncé', somme(h), 1155);
  cas('positions — le board vient du bloc en tête, découpé deux par deux',
      boardDe(h), '8h 7h 6d Kc 3h');
  // ⚠️ SIX SIÈGES PORTENT LE MÊME LIBELLÉ DE JOUEUR (« Unknown ») — lus comme des noms ils
  // feraient refuser la main en doublon. La clef est la POSITION, et aucun pseudo n'est importé.
  const seed = postToSeed(r.source);
  cas('positions — aucun pseudo importé malgré les « Unknown »',
      [seed.context.heroName, seed.context.opponentNames].filter(Boolean), []);
  // Les tapis non déclarés reçoivent le stack effectif — le défaut que `buildSeats` applique déjà
  // à un siège non renseigné du formulaire. Ce n'est pas une invention, c'est la règle de Pokza.
  cas('positions — les sièges sans « s/ » prennent le stack effectif',
      new Set(h.seats.map((x) => x.startingStack)), new Set([2000]));
  // Aucune devise n'est écrite dans cette notation : les montants sont nus.
  cas('positions — aucune devise', h.currency, undefined);
}

// ─── LE STRADDLE, LU DEPUIS UN FICHIER POUR LA PREMIÈRE FOIS ─────────────────────────────────
// `post TB 8` avec des blindes 2/4, posté par le PREMIER PARLEUR : un straddle simple à deux fois
// la grosse blinde, exactement en tête de chaîne — la seule forme que Pokza sait dire.
{
  const r = resultats['positions-cash-straddle.txt'];
  const h = r.source.hand;
  cas('positions — 10 joueurs', h.seats.length, 10);
  // ⚠️ LES LIBELLÉS NE SONT JAMAIS TRADUITS : cette notation numérote ses UTG à partir de 1
  // (`UTG1` est le premier parleur) là où Pokza part de zéro, et elle a un `MP` que Pokza appelle
  // `UTG3`. C'est l'ORDRE des lignes qui fait l'anneau, pas une table de correspondance.
  cas('positions — le héros écrit « UTG3 » est en UTG2 chez Pokza',
      h.seats.find((x) => x.isHero).position, 'UTG2');
  cas('positions — le straddle est posté, et par le premier parleur',
      h.actions.filter((a) => a.type === 'post-straddle').map((a) => `${a.seatId}:${a.amount}`),
      ['s-utg:8']);
  cas('positions — le straddle devient le montant à suivre',
      misesDe(h, 's-bb', 'preflop'), ['post-bb:4', 'call:24', 'fold:']);
  cas('positions — Σ = les deux moitiés annoncées', somme(h), 846);
  cas('positions — pot partagé à égalité',
      determinePotAwards(h).map((x) => `${x.seatId}:${x.fraction}`).sort(),
      ['s-utg2:0.5', 's-utg:0.5']);
  // Le straddle ne vit que dans les actions : il doit se relire tel quel en remontant les étapes.
  const seed = postToSeed(r.source);
  cas('positions — le straddle se relit depuis le seed',
      [seed.context.straddleCount, seed.context.straddleAmounts[0], seed.context.straddleBouton],
      [1, 8, false]);
}

// ─── LA MAIN TRONQUÉE : LE 7e MOTIF DE REFUS, ET IL MANQUAIT ─────────────────────────────────
// ⚠️ `*** RIVER ***` annoncé, la cinquième carte dans le board, et RIEN dessous — l'auteur a cessé
// d'enregistrer. Lue telle quelle, la main publiait une river que personne n'a jouée puis le pot
// attribué : une séquence qui NE PEUT PAS avoir eu lieu, et qu'aucun autre contrôle ne voyait (le
// pot, lui, tombait juste, faute de gain annoncé à confronter).
{
  const r = resultats['positions-cash-tronquee.txt'];
  cas('positions — la main tronquée est refusée', r.code, 'controle-echoue');
  cas('positions — et le refus nomme la troncature',
      /river distribué sans aucune action/.test(r.message), true);
  // L'EXEMPTION EST LA SEULE LÉGITIME : quand tous ceux qui restent sont à TAPIS, les cartes
  // suivantes tombent sans que personne n'ait à parler. Deux vraies mains du corpus le font.
  cas('positions — turn ET river muets restent verts quand tout le monde est à tapis',
      [resultats['pmu-tournoi-pots-secondaires.txt'].controles.find((c) => c.numero === 1).ok,
       resultats['winamax-cash-bbcode.txt'].controles.find((c) => c.numero === 1).ok],
      [true, true]);
  // Sans la carte de river, la même main se lit : c'est la river MUETTE qu'on refuse, pas la main.
  const sansRiver = lire('positions-cash-tronquee.txt')
    .replace('Qs8s3s7s4s', 'Qs8s3s7s')
    .replace(/\n\*\*\* RIVER \*\*\*\s*$/, '');
  cas('positions — sans sa river muette, la même main est lue', importerMain(sansRiver).ok, true);
}

// ─── LA MAIN QUI A CORRIGÉ DEUX CHOSES QUE JE CROYAIS SAVOIR ─────────────────────────────────
// Une main de TOURNOI de l'outil (06/09/2026). Σ = 608 = le gain annoncé au jeton, et l'ordre de
// parole du fichier tombe exactement — mais elle a démenti deux lectures :
//
//   1. `c/` N'EST PAS LE MARQUEUR DU HÉROS. Je l'avais lu comme ça parce que les trois premières
//      mains n'en portaient qu'un, toujours sur `Hero`. Celle-ci en porte QUATRE : `c/` veut dire
//      « cartes connues », et l'outil en connaît autant que l'auteur en a noté. Le seul signal du
//      point de vue est le libellé `Hero` — celui-là même qu'on n'importe jamais.
//   2. UN SIÈGE PEUT N'AVOIR AUCUN LIBELLÉ (`: Unknown`) : il n'est alors pas dans la main. Le
//      compter donnait 8 places pour 7 joueurs, et l'anneau se décalait d'un cran.
//
// ⚠️⚠️ ET ELLE CONFIRME LE TROU : **rien dans cette main ne dit qu'elle est un tournoi.** Blindes
// 2/5, comme la main de cash. La notation ne distingue pas les deux, et c'est Victor qui a dû le
// dire. Le fichier, lui, se tait.
{
  const r = resultats['positions-observee-sans-heros.txt'];
  cas('positions observée — refusée faute de point de vue', r.code, 'hero-introuvable');
  // Le détail dit LAQUELLE des deux causes c'est, là où le message d'écran couvre les deux.
  cas('positions observée — le détail nomme la cause',
      /aucun siège n'est marqué/.test(r.message), true);
  // ⚠️ ET LE MESSAGE D'ÉCRAN NE DOIT PLUS MENTIR : cette main montre QUATRE mains. L'ancienne
  // phrase (« ce texte ne montre les cartes de personne ») était fausse ici.
  cas('positions observée — le message d\'écran est vrai des deux côtés',
      /ne montre les cartes de personne/.test(messageDeRefus('hero-introuvable')), false);

  // Avec un point de vue et un tapis, TOUT LE RESTE se lit — c'est le point de vue qui manquait,
  // pas la grammaire.
  const avec = lire('positions-observee-sans-heros.txt')
    .replace('UTG: Unknown c/QcQd', 'UTG: Hero c/QcQd s/1500')
    .replace('BB: Unknown c/Tc9c', 'BB: Unknown c/Tc9c s/900');
  const ok = importerMain(avec);
  cas('positions observée — avec un héros, la main est lue', ok.ok === true ? [] : [ok.code, ok.message], []);
  // Le siège SANS LIBELLÉ est écarté : 7 joueurs, pas 8. Si on le comptait, la grosse blinde
  // tomberait sur un autre siège et le contrôle nº 2 refuserait.
  cas('positions observée — le siège sans libellé est écarté', ok.source.hand.seats.length, 7);
  cas('positions observée — et l\'anneau reste juste',
      ok.source.hand.seats.find((x) => x.isHero).position, 'UTG');
  cas('positions observée — Σ = le gain annoncé', somme(ok.source.hand), 608);
  // ⚠️ `mucked` NE RÉVÈLE RIEN, même quand le tirage connaît les cartes (`c/Tc9c` sur ce siège) :
  // c'est la différence entre ce que l'outil SAIT et ce que la table a VU. Une seule main révélée.
  cas('positions observée — seul le « shows » révèle, pas le « c/ » d\'un joueur qui mucke',
      ok.source.hand.seats.filter((x) => x.holeCards).map((x) => x.position), ['UTG']);
  // `Xx` est une carte inconnue : une main partielle n'est pas évaluable, et n'est pas révélée.
  cas('positions observée — la carte inconnue « Xx » ne devient pas une carte',
      ok.source.hand.seats.every((x) => !x.holeCards || x.holeCards.length === 2), true);
  // ⚠️ RIEN NE DIT QUE C'EST UN TOURNOI — et c'en est un. Le trou est ici, mesuré, pas supposé.
  cas('positions observée — lue comme du cash, faute de le savoir', ok.source.hand.gameType, 'cash');
}
// Une main dont le siège Hero a une carte illisible est refusée : on ne publie pas la main de
// quelqu'un qui ne connaîtrait pas ses propres cartes.
refuseParty('positions — un héros aux cartes incomplètes est refusé',
  lire('positions-observee-sans-heros.txt')
    .replace('UTG: Unknown c/QcQd', 'UTG: Hero c/QcXx s/1500')
    .replace('BB: Unknown c/Tc9c', 'BB: Unknown c/Tc9c s/900'),
  'hero-introuvable');

// ─── CE QUI EST LU MAIS N'A PAS SUIVI ────────────────────────────────────────────────────────
// ⚠️ LE CANAL EXISTAIT ET N'ÉTAIT PAS BRANCHÉ (trouvé le 06/09/2026). Le montage produit des
// avertissements « jamais bloquants, mais à dire à l'auteur » — et PERSONNE ne les lisait :
// `ImportHHScreen` rendait la main et disparaissait, donc la perte était SILENCIEUSE. C'est
// exactement ce que ce chantier refuse partout ailleurs.
//
// ⚠️ ET C'EST UN CHEMIN DÉFENSIF, PAS UN CAS COURANT : mesuré, AUCUNE des 15 mains du corpus n'en
// déclenche (les champs vont à 44 et 16 caractères). D'où une phrase et rien de plus — mais elle
// existe, et ces tests interdisent qu'elle se débranche à nouveau.
{
  // ⚠️ SEULE LA NOTATION PAR POSITIONS AVERTIT, ET ELLE LE FAIT À CHAQUE FOIS (tranché par Victor
  // le 06/09/2026) : son format n'écrit nulle part s'il s'agit de cash ou de tournoi. Toute autre
  // main du corpus qui se mettrait à bavarder serait un vrai changement à regarder.
  const bavardes = Object.entries(resultats)
    .filter(([, r]) => r.ok && r.avertissements.length > 0)
    .map(([f]) => f)
    .sort();
  cas('seule la notation par positions avertit, et toujours',
      bavardes, ['positions-cash-straddle.txt', 'positions-cash-totaux.txt']);
  cas('… d\'un seul avertissement, celui du type de partie',
      resultats['positions-cash-totaux.txt'].avertissements,
      ['ce format ne dit pas si la main est un cash game ou un tournoi : Pokza a lu du cash game']);
  // Le défaut est CASH, et c'est ce que l'avertissement annonce — les deux doivent rester d'accord.
  cas('… et le défaut annoncé est bien celui appliqué',
      resultats['positions-cash-totaux.txt'].source.hand.gameType, 'cash');
  // ⚠️ LE CANAL VIENT DU DIALECTE, PAS DU MONTAGE : « cette notation ne dit pas le type de partie »
  // est une propriété du FORMAT, invisible depuis la forme neutre. Les deux sources doivent se
  // cumuler, pas s'écraser — un nom d'épreuve trop long EN PLUS du type de partie ferait deux
  // lignes. (La notation par positions étant toujours lue en cash, elle n'a pas de nom d'épreuve :
  // on éprouve donc le cumul sur la mécanique, via `messageDAvertissement`.)
  cas('la phrase s\'adapte à plusieurs avertissements',
      messageDAvertissement(2).includes('2 choses'), true);

  const pmu = lire('pmu-tournoi-pots-secondaires.txt');
  // Un nom d'épreuve plus long que son champ est TRONQUÉ — et l'auteur doit le savoir, sinon il
  // publie un nom coupé sans jamais avoir été prévenu.
  const long = importerMain(pmu.replace(
    'Table 50€ Garantis Hyper Turbo Rebuy (',
    'Table 50€ Garantis Hyper Turbo Rebuy Deepstack Progressif KO ('));
  cas('un nom d\'épreuve trop long est tronqué…', long.source.tournamentName.length, 44);
  cas('… et il est DIT', long.avertissements, ['nom du tournoi raccourci à 44 caractères']);

  // ⚠️ UN PRIX NE SE TRONQUE PAS : « 1000€ » coupé donnerait « 100€ », c'est-à-dire un FAUX. Trop
  // long, le buy-in est donc ABANDONNÉ — et c'est encore plus important de le dire, puisque le
  // champ reste vide sans que rien ne l'explique.
  // 17 caractères une fois sommé : le champ en accepte 16. (`€123456789012.34 + €1` en fait
  // exactement 16 et passe — la borne est serrée, et c'est bien ce qu'on veut vérifier.)
  const cher = importerMain(pmu.replace('€0.50 EUR Buy-in', '€999999999999999 + €1 EUR Buy-in'));
  cas('un buy-in trop long est abandonné, pas tronqué…', cher.source.buyIn, undefined);
  cas('… et il est DIT', cher.avertissements, ['buy-in trop long pour le champ : laissé vide']);
  // La main, elle, reste parfaitement lue : un avertissement n'est pas un refus.
  cas('… la main reste lue malgré tout',
      [cher.ok, cher.controles.filter((c) => !c.ok).length], [true, 0]);

  // La phrase dit OÙ corriger ; les lignes en dessous disent QUOI.
  cas('la phrase s\'accorde au nombre et dit où aller',
      [messageDAvertissement(1).includes('Une chose'), messageDAvertissement(1).includes("l'étape 1")],
      [true, true]);
  // ⚠️ « si besoin » n'est pas une politesse : la plupart du temps le défaut sera le bon, et la
  // phrase ne doit pas faire croire à une erreur.
  cas('… sans faire croire à une erreur', messageDAvertissement(1).includes('si besoin'), true);
  // Elle ne doit PAS sonner comme un refus : la main est bonne et elle part.
  cas('… et elle ne s\'excuse pas', /^La main est lue\./.test(messageDAvertissement(1)), true);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 sexies. LE FICHIER — le geste du bureau
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Un fichier ne fait qu'apporter du TEXTE : il n'y a aucun chemin de lecture qui lui soit propre,
// et c'est voulu — un fichier et un collage donnent la même main et se refusent pour les mêmes
// raisons. Reste deux choses qui n'existent que là : l'encodage, et la suite à donner.

console.log('\n─── 4 sexies. Le fichier ──────────────────────────────────────────────────────');

const octetsDe = (chaine, encodage) => {
  if (encodage === 'utf-8') return new TextEncoder().encode(chaine).buffer;
  // windows-1252 sur la plage latine : un octet par caractère, c'est exactement le piège.
  return new Uint8Array([...chaine].map((c) => c.charCodeAt(0))).buffer;
};

// ⚠️ TOUS LES CLIENTS N'ÉCRIVENT PAS EN UTF-8, et un nom mal décodé n'est PAS rattrapé par les
// contrôles : les lignes d'action se reconnaissent contre les noms lus dans LE MÊME fichier, donc
// un charabia cohérent avec lui-même se lit très bien — et la main se publierait avec des pseudos
// illisibles. Ce dépôt porte déjà les traces d'un épisode de mojibake.
cas('encodage — de l\'UTF-8 se lit comme de l\'UTF-8',
    decoderTexte(octetsDe("Table: 'Zielona Góra 06'", 'utf-8')), "Table: 'Zielona Góra 06'");
cas('encodage — du windows-1252 est reconnu et replié',
    decoderTexte(octetsDe("Table: 'Zielona Góra 06'", 'latin')), "Table: 'Zielona Góra 06'");
cas('encodage — l\'ASCII pur passe par le chemin strict',
    decoderTexte(octetsDe('Seat 1: aa (100)', 'utf-8')), 'Seat 1: aa (100)');

// Le plafond n'est pas une valeur produit — rien ne l'affiche. C'est un garde-fou : décoder cent
// mégaoctets figerait l'onglet, et au-delà de huit on ne lit pas des mains de poker.
const refuseTaille = (titre, octets, code) => {
  let obtenu = 'ACCEPTÉE';
  try { verifierTaille(octets); } catch (e) { obtenu = e.code; }
  cas(titre, obtenu, code);
};
refuseTaille('taille — un fichier vide', 0, 'texte-vide');
refuseTaille('taille — un fichier plausible', 300 * 1024, 'ACCEPTÉE');
refuseTaille('taille — juste sous le plafond', TAILLE_MAX_OCTETS, 'ACCEPTÉE');
refuseTaille('taille — au-dessus du plafond', TAILLE_MAX_OCTETS + 1, 'fichier-trop-gros');

// ⚠️ « Colle une seule main » n'a AUCUN sens devant un fichier de session : le geste utile est
// d'ouvrir le fichier. C'est le seul message où la provenance change la suite à donner — tous les
// autres décrivent la main, pas le geste.
cas('un fichier de session dit quoi faire',
    messageDeRefus('plusieurs-mains', 47, 'fichier'),
    "Ce fichier contient 47 mains. Pokza n'en importe qu'une : ouvre-le et colle celle que tu veux.");
cas('… là où un collage dit autre chose',
    messageDeRefus('plusieurs-mains', 47, 'collage'),
    'Il y a 47 mains dans ce texte. Colle une seule main.');
cas('… et sans le nombre, la phrase tient encore',
    messageDeRefus('plusieurs-mains', undefined, 'fichier'),
    "Ce fichier contient plusieurs mains. Pokza n'en importe qu'une : ouvre-le et colle celle que tu veux.");

// Un fichier de session, tel qu'on en déposera : REFUSÉ (décision de Victor le 04/09/2026 — le
// fichier se comporte comme un collage). Le dépôt sert donc les exports d'UNE main.
{
  const session = [1, 2, 3].map(() => lire('winamax-cash-sidepot.txt')).join('\n\n');
  const r = importerMain(session);
  cas('un fichier de session entier est refusé', r.ok ? 'ACCEPTÉE' : r.code, 'plusieurs-mains');
  cas('… et on sait combien il en contenait', compterLesMains(session), 3);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. LES BRIQUES PARTAGÉES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

console.log('\n─── 5. Cartes, montants, devises ──────────────────────────────────────────────');

// Rangs {2..9,T,J,Q,K,A} et couleurs {C,D,H,S} sont DISJOINTS : un jeton se lit dans les deux
// ordres sans jamais devenir ambigu. C'est ce qui permet UN lecteur pour tous les dialectes.
cas('carte — ordre rang-couleur', lireCarte('AS'), { rank: 'A', suit: 's' });
cas('carte — ordre couleur-rang', lireCarte('SA'), { rank: 'A', suit: 's' });
cas('carte — casse mélangée', [lireCarte('3h'), lireCarte('3H')], [{ rank: '3', suit: 'h' }, { rank: '3', suit: 'h' }]);
cas('carte — le Dix en T', lireCarte('Ts'), { rank: 'T', suit: 's' });
cas('carte — le Dix en 10 (jamais mesuré, mais sans ambiguïté possible)',
    lireCarte('10s'), { rank: 'T', suit: 's' });
cas('carte — ce qui n\'est pas une carte', [lireCarte('XX'), lireCarte('A'), lireCarte('')], [null, null, null]);

// ⚠️ Ici la virgule est un séparateur de MILLIERS (Betclic écrit `€1,330.78`), à l'inverse du
// champ « buy-in » où `1,500` est refusé faute de pouvoir trancher. Une hand history est écrite
// par une machine anglophone, pas par un joueur.
cas('montant — séparateur de milliers', lireMontant('€1,330.78'), 1330.78);
cas('montant — sigle derrière', lireMontant('0.50€'), 0.5);
cas('montant — jetons nus', lireMontant('80213'), 80213);
cas('montant — décoré de mots', lireMontant('€200.00 in chips'), 200);
cas('montant — rien à lire', [lireMontant('No rake'), lireMontant('')], [null, null]);

// ⚠️ Trois sigles de Pokza sont des lettres latines (« R », « RM », « Kč ») : chercher une devise
// dans une ligne entière trouverait le « R » de « Rake » ou de « RIVER ».
cas('devise — euro dans les enjeux', deviseEcrite('0.50€/1€'), 'EUR');
cas('devise — dollar devant', deviseEcrite('$5/$10'), 'USD');
cas('devise — sigle en lettres', deviseEcrite('CHF 5/CHF 10'), 'CHF');
cas('devise — jetons de tournoi : aucune', deviseEcrite('160/700/1400'), undefined);
cas('devise — du texte n\'est pas une devise',
    [deviseEcrite('Rake'), deviseEcrite('RIVER'), deviseEcrite('45€+5$')], [undefined, undefined, undefined]);

console.log(`\n${ko === 0 ? '✅ TOUT PASSE' : `❌ ${ko} ÉCHEC(S)`} — ${total - ko}/${total} vérifications`);
process.exit(ko === 0 ? 0 : 1);
