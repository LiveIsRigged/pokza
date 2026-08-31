// La main en texte, à coller ailleurs (`mainEnTexte`).
// ──────────────────────────────────────────────────
// Ce que ce fichier surveille, et qui ne se voit pas à la relecture :
//
//   1. LE TEXTE NE RACONTE PAS UNE AUTRE MAIN QUE LE REPLAYER. Le déroulé est rejoué avec le
//      moteur et mis en mots par `describeAction` — le même narrateur que la bulle d'action, à qui
//      l'on demande seulement un autre vocabulaire et une autre façon de nommer les sièges. Les cas
//      « straddle » et « all-in » sont là pour ça : ce sont les deux endroits où un second
//      narrateur écrirait à côté (« Straddle straddle », un tapis non signalé).
//   2. LE POT DE CHAQUE STREET EST CELUI D'AVANT LA STREET. Pas celui d'après, pas le total. Une
//      erreur d'un cran ne se verrait sur aucune main courte, et fausserait toutes les autres.
//   3. CHAQUE JOUEUR PORTE SA PLACE, JUSQUE DANS L'ACTION. « Marc suit » ne dit pas où Marc était
//      assis ; à l'écran la table le dit, dans un texte collé ailleurs il n'y a que ces lignes.
//   4. LES MISES FORCÉES NE S'ÉCRIVENT PAS — et un préflop qui n'a plus rien à dire (bomb pot)
//      disparaît en entier, titre compris.
//   5. UNE MAIN ARRÊTÉE N'A PAS DE VAINQUEUR. `determinePotAwards` renonce, et le texte doit finir
//      sur la question posée — pas sur un « gagne » que le replayer n'affiche pas.
//   6. LE DOUBLE BOARD TOMBE SUR UNE SEULE LIGNE. Deux boards, un seul flop : les séparer en deux
//      titres « FLOP » ferait croire à deux streets.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/mainEnTexte.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-main-texte.js

const { mainEnTexte } = require('./cm/engine/mainEnTexte.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}
function contient(titre, texte, morceau) {
  cas(titre, texte.includes(morceau) ? morceau : `ABSENT — ${JSON.stringify(texte)}`, morceau);
}
function absent(titre, texte, morceau) {
  cas(titre, texte.includes(morceau) ? `PRÉSENT : ${morceau}` : 'absent', 'absent');
}

const c = (s) => ({ rank: s[0], suit: s[1] });
let n = 0;
const reset = () => { n = 0; };
const a = (street, seatId, type, amount) => ({ id: `a${++n}`, street, seatId, type, amount, order: n });
const ligne = (texte, prefixe) => texte.split('\n').find((l) => l.startsWith(prefixe)) ?? `AUCUNE ligne « ${prefixe} »`;

// ── 1. Une main complète, six joueurs, un adversaire nommé ────────────────────
reset();
const seats = [
  { id: 'utg', position: 'UTG', isHero: false, startingStack: 500 },
  { id: 'hj', position: 'HJ', isHero: false, startingStack: 500, playerName: 'Marc' },
  { id: 'co', position: 'CO', isHero: true, startingStack: 500, holeCards: [c('As'), c('Kh')] },
  { id: 'btn', position: 'BTN', isHero: false, startingStack: 500, holeCards: [c('Qd'), c('Qc')] },
  { id: 'sb', position: 'SB', isHero: false, startingStack: 500 },
  { id: 'bb', position: 'BB', isHero: false, startingStack: 500 },
];
const complete = {
  id: 'x', variant: 'nlhe', gameType: 'cash', blinds: { sb: 2, bb: 5 },
  effectiveStack: 500, visibility: 'public', currency: 'EUR', seats,
  board: { flop: [c('Ks'), c('7d'), c('2c')], turn: c('9d'), river: c('3c') },
  actions: [
    a('preflop', 'sb', 'post-sb', 2), a('preflop', 'bb', 'post-bb', 5),
    a('preflop', 'utg', 'fold'), a('preflop', 'hj', 'call', 5),
    a('preflop', 'co', 'raise', 20), a('preflop', 'btn', 'raise', 65),
    a('preflop', 'sb', 'fold'), a('preflop', 'bb', 'fold'), a('preflop', 'hj', 'fold'),
    a('preflop', 'co', 'call', 65),
    a('flop', 'co', 'check'), a('flop', 'btn', 'bet', 70), a('flop', 'co', 'call', 70),
    a('turn', 'co', 'check'), a('turn', 'btn', 'bet', 180), a('turn', 'co', 'call', 180),
    a('river', 'co', 'check'), a('river', 'btn', 'bet', 185), a('river', 'co', 'call', 185),
  ],
};
const t1 = mainEnTexte({ hand: complete, location: 'Aviation Club', buyIn: 'Cave 500€', level: 'NL5' });

cas("en-tête : dénomination puis lieu, buy-in, niveau", t1.split('\n')[0],
    'Cash game · NLHE 2/5€ · Aviation Club · Cave 500€ · NL5');
cas('cartes en lettres, jamais en symboles', /[♠♥♦♣]/.test(t1), false);

// La place d'abord, le nom entre parenthèses — et Hero ne fait pas exception : dans un texte, sa
// position est la seule chose qui dise d'où il jouait.
cas('le nom entre parenthèses, après la position et avant le tapis', ligne(t1, 'HJ'), 'HJ (Marc) 500€');
cas('un siège sans nom garde sa seule position', ligne(t1, 'BTN'), 'BTN 500€');
cas('Hero porte sa position comme tout le monde', ligne(t1, 'CO '), 'CO (Hero) 500€ — As Kh');
absent("Hero n'apparaît jamais seul, sans sa place", t1, '\nHero ');

// Le pot du flop est celui d'AVANT le flop : 2 + 5 + 5 (HJ suit puis se couche) + 65 + 65.
cas('pot du flop = tout ce qui est entré au préflop', ligne(t1, 'FLOP'), 'FLOP  Ks 7d 2c  (pot 142€)');
cas('pot du turn', ligne(t1, 'TURN'), 'TURN  9d  (pot 282€)');
cas('pot de la river', ligne(t1, 'RIVER'), 'RIVER  3c  (pot 642€)');
absent('pas de pot au préflop, il y vaudrait zéro', t1, 'PRÉFLOP  (');

// Les verbes sont ceux des hand histories, et la place suit le joueur jusque dans l'action.
contient('fold en anglais', t1, 'UTG folds');
contient('call en anglais, avec la place du joueur', t1, 'HJ (Marc) calls 5€');
contient('raise en anglais', t1, 'CO (Hero) raises to 20€');
contient('check en anglais', t1, 'CO (Hero) checks');
contient('bet en anglais', t1, 'BTN bets 70€');
for (const verbe of ['se couche', ' suit (', 'relance à', ' mise ']) {
  absent(`plus aucun verbe français : « ${verbe.trim()} »`, t1, verbe);
}

// Les mises forcées ne s'écrivent plus : la dénomination les annonce, le pot du flop les compte.
absent('la petite blinde ne se poste pas dans le texte', t1, 'small blind');
absent('la grosse blinde non plus', t1, 'big blind');
cas('le préflop ouvre sur la première vraie décision',
    t1.split('PRÉFLOP\n')[1].split('\n')[0], 'UTG folds');

contient('le tapis est signalé comme dans la bulle du replayer', t1, 'BTN bets 185€ — ALL-IN');
contient("l'abattage donne les mains adverses saisies", t1, 'ABATTAGE\nBTN : Qd Qc');
contient('le résultat, avec le pot entier', t1, 'CO (Hero) gagne 1012€');

// ── 2. Une main arrêtée par son auteur ────────────────────────────────────────
reset();
const arretee = {
  ...complete, stoppedAtSeatId: 'co',
  board: { flop: [c('Ks'), c('7d'), c('2c')] },
  seats: seats.map((s) => (s.id === 'btn' ? { ...s, holeCards: undefined } : s)),
  actions: [
    a('preflop', 'sb', 'post-sb', 2), a('preflop', 'bb', 'post-bb', 5),
    a('preflop', 'utg', 'fold'), a('preflop', 'hj', 'fold'),
    a('preflop', 'co', 'raise', 20), a('preflop', 'btn', 'call', 20),
    a('preflop', 'sb', 'fold'), a('preflop', 'bb', 'fold'),
    a('flop', 'co', 'check'), a('flop', 'btn', 'bet', 30),
  ],
};
const t2 = mainEnTexte({ hand: arretee });
contient("la main s'arrête sur la question posée", t2, "La main s'arrête ici — à CO (Hero) de jouer.");
absent('aucun vainqueur sur une main arrêtée', t2, 'gagne');
absent("pas d'abattage : personne n'a montré", t2, 'ABATTAGE');

// ── 3. Un straddle : la dénomination ET le narrateur doivent le voir ──────────
reset();
const straddle = {
  ...complete, blinds: { sb: 2, bb: 5 },
  seats: seats.map((s) => (s.id === 'btn' ? { ...s, holeCards: undefined } : s)),
  board: { flop: [c('Ks'), c('7d'), c('2c')] },
  actions: [
    a('preflop', 'sb', 'post-sb', 2), a('preflop', 'bb', 'post-bb', 5),
    a('preflop', 'utg', 'post-straddle', 10),
    a('preflop', 'hj', 'fold'), a('preflop', 'co', 'raise', 35), a('preflop', 'btn', 'fold'),
    a('preflop', 'sb', 'fold'), a('preflop', 'bb', 'fold'), a('preflop', 'utg', 'call', 35),
    a('flop', 'utg', 'check'), a('flop', 'co', 'check'),
  ],
};
const t3 = mainEnTexte({ hand: straddle });
contient('la dénomination porte le straddle', t3, 'NLHE 2/5/10€');
contient("le siège straddle garde l'étiquette du replayer", t3, 'Straddle 500€');
absent("le straddle est une mise forcée : il ne s'écrit pas non plus", t3, '(10€)');
contient('et il agit sous ce nom-là', t3, 'Straddle calls 35€');

// ── 4. Bomb pot double board ─────────────────────────────────────────────────
reset();
const bomb = {
  id: 'b', variant: 'plo', gameType: 'cash', blinds: { sb: 0, bb: 10 }, bombPot: true,
  effectiveStack: 300, visibility: 'public', currency: 'EUR',
  seats: [
    { id: 'p1', position: 'BTN', isHero: true, startingStack: 300, holeCards: [c('As'), c('Kh'), c('Qd'), c('Jc')] },
    { id: 'p2', position: 'SB', isHero: false, startingStack: 300 },
    { id: 'p3', position: 'BB', isHero: false, startingStack: 300 },
  ],
  board: { flop: [c('Ks'), c('7d'), c('2c')], turn: c('9d'), river: c('3c') },
  board2: { flop: [c('Ah'), c('8c'), c('3s')], turn: c('Td'), river: c('4h') },
  actions: [
    a('preflop', 'p1', 'post-ante', 10), a('preflop', 'p2', 'post-ante', 10), a('preflop', 'p3', 'post-ante', 10),
    a('flop', 'p2', 'check'), a('flop', 'p3', 'check'), a('flop', 'p1', 'check'),
    a('turn', 'p2', 'check'), a('turn', 'p3', 'check'), a('turn', 'p1', 'check'),
    a('river', 'p2', 'check'), a('river', 'p3', 'check'), a('river', 'p1', 'check'),
  ],
};
const t4 = mainEnTexte({ hand: bomb });
contient('bomb pot : la dénomination dit le bomb pot, pas des blindes', t4, 'PLO bomb pot 10€');
cas('les deux boards sur la même ligne de flop', ligne(t4, 'FLOP'), 'FLOP  Ks 7d 2c  |  Ah 8c 3s  (pot 30€)');
cas('et sur la même ligne de turn', ligne(t4, 'TURN'), 'TURN  9d  |  Td  (pot 30€)');
// Un bomb pot n'a QUE des antes au préflop : sans les mises forcées, la section est vide. Un titre
// « PRÉFLOP » suivi de rien ferait croire à une street escamotée.
absent('un préflop vide se saute entièrement', t4, 'PRÉFLOP');
contient('mais le pot des antes est bien compté au flop', t4, '(pot 30€)');

// ── 5. Tournoi : pas de devise, jetons abrégés ───────────────────────────────
reset();
const tournoi = {
  ...complete, gameType: 'tournament', currency: undefined,
  blinds: { sb: 5000, bb: 10000 },
  seats: seats.map((s) => ({ ...s, startingStack: 250000, holeCards: s.isHero ? s.holeCards : undefined })),
  board: { flop: [c('Ks'), c('7d'), c('2c')] },
  actions: [
    a('preflop', 'sb', 'post-sb', 5000), a('preflop', 'bb', 'post-bb', 10000),
    a('preflop', 'utg', 'fold'), a('preflop', 'hj', 'fold'),
    a('preflop', 'co', 'raise', 25000), a('preflop', 'btn', 'fold'),
    a('preflop', 'sb', 'fold'), a('preflop', 'bb', 'call', 25000),
    a('flop', 'bb', 'check'), a('flop', 'co', 'check'),
  ],
};
const t5 = mainEnTexte({ hand: tournoi, level: 'Niveau 12' });
cas('aucun symbole de devise en tournoi', /[€$]/.test(t5), false);
contient('les jetons de tournoi sont abrégés', t5, 'CO (Hero) 250k — As Kh');
contient('et les blindes aussi', t5, 'Tournoi · NLHE 5k/10k · Niveau 12');

console.log(ko === 0 ? '\nTout est vert.' : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
