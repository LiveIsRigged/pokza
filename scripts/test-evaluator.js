// Non-régression de l'évaluateur de mains — le composant le plus critique de l'app.
// ================================================================================
// `bestHandRank` décide qui gagne une main ET alimente le calcul d'équité (des centaines de
// milliers d'appels par main à tapis). Une erreur ici ne se voit pas : elle donne juste le pot au
// mauvais joueur.
//
// CE QUI A REMPLACÉ L'ANCIENNE VERSION DE CE FICHIER
// L'ancien script était un test DIFFÉRENTIEL jetable : il comparait l'évaluateur réécrit le
// 16/08/2026 à la version d'avant, figée dans `scripts/ref/`, sur des millions de mains tirées au
// hasard. Ce travail est fait — la réécriture a été validée. Mais la référence n'existe plus (elle
// venait d'un commit désormais lointain, et `scripts/ref/` n'est pas versionné), et le script
// exigeait une sonde `handEvaluatorProbe.ts` jamais versionnée non plus : il ne démarrait plus.
// Le ressusciter aurait voulu dire réextraire l'ancien évaluateur de l'historique pour se comparer
// à une version dont le seul mérite serait d'être vieille.
//
// LE PARTI PRIS DE CELUI-CI : AUCUNE VALEUR ATTENDUE ÉCRITE À LA MAIN
// On n'affirme jamais « cette main vaut [7, 9, 2] ». On n'affirme que des ORDRES et des ÉGALITÉS :
// telle main bat telle autre, ces deux-là sont exactement à égalité. C'est ce qui met ce test à
// l'abri du travers qui a déjà mordu trois fois sur ce projet — l'attendu écrit à la main était
// faux, pas le code. Un ordre, lui, se vérifie contre les règles du poker, pas contre ma mémoire.
// Bonus : plus besoin de sonde, `bestHandRank` et `compareHandRanks` sont publics.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/handEvaluator.ts \
//     --outDir scripts/b3 --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-evaluator.js

const {
  bestHandRank,
  compareHandRanks,
  bestHandForVariant,
  bestHandWinners,
} = require('./b3/engine/handEvaluator.js');

let ko = 0;
function cas(titre, ok, detail) {
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok && detail) console.log(`   ${detail}`);
}

/** « As Kd Qh » → cartes. */
const m = (s) => s.split(' ').map((c) => ({ rank: c[0], suit: c[1] }));

/** `forte` doit battre `faible`, strictement. */
const bat = (titre, forte, faible) => {
  const d = compareHandRanks(bestHandRank(m(forte)), bestHandRank(m(faible)));
  cas(titre, d > 0, `${forte} vs ${faible} → comparaison = ${d} (attendu > 0)`);
};

/** Les deux doivent être exactement à égalité. */
const egales = (titre, a, b) => {
  const d = compareHandRanks(bestHandRank(m(a)), bestHandRank(m(b)));
  cas(titre, d === 0, `${a} vs ${b} → comparaison = ${d} (attendu 0)`);
};

// ── 1. L'échelle des mains, barreau par barreau ──────────────────────────────────────────────────
// Chaque main est comparée à la suivante : si un barreau était mal placé, la chaîne casse ici.
const echelle = [
  ['quinte flush', 'As Ks Qs Js Ts'],
  ['carre',        '9h 9d 9c 9s 2d'],
  ['full',         '8h 8d 8c 3s 3d'],
  ['couleur',      'Ah Jh 8h 5h 2h'],
  ['quinte',       '9c 8d 7h 6s 5c'],
  ['brelan',       '7h 7d 7c Kd 4s'],
  ['deux paires',  'Qh Qd 5c 5s 9h'],
  ['paire',        'Th Td 8c 6s 3h'],
  ['hauteur',      'Ah Qd 9c 7s 4h'],
];
for (let i = 0; i < echelle.length - 1; i++) {
  bat(`${echelle[i][0]} bat ${echelle[i + 1][0]}`, echelle[i][1], echelle[i + 1][1]);
}

// ── 2. La roue : une quinte, et la plus petite de toutes ─────────────────────────────────────────
// L'as y compte pour 1. C'est le cas particulier que tout évaluateur rate en premier : soit il ne
// voit pas la quinte du tout, soit il la classe en tête parce qu'elle contient un as.
bat('la roue bat un brelan (c est bien une quinte)', '5h 4d 3c 2s Ah', '7h 7d 7c Kd 4s');
bat('mais la quinte 6-haute bat la roue', '6c 5d 4h 3s 2c', '5h 4d 3c 2s Ah');
bat('et la quinte a l as bat la roue', 'Ah Kd Qc Js Th', '5h 4d 3c 2s Ah');
bat('meme chose en couleur : la quinte flush 6-haute bat la roue flush',
    '6s 5s 4s 3s 2s', '5s 4s 3s 2s As');
bat('la roue flush reste au-dessus d un carre', '5s 4s 3s 2s As', '9h 9d 9c 9s 2d');

// ── 3. Sept cartes : la meilleure des cinq, et rien d'autre ──────────────────────────────────────
// Le board se joue tout seul quand la main n'apporte rien : ajouter deux cartes inutiles ne doit
// NI améliorer NI dégrader le résultat.
egales('deux cartes inutiles ne changent rien au board',
  '2c 3d As Ks Qh Jd Th', 'As Ks Qh Jd Th');
// ⚠️ Le contre-exemple qui m'a piégé en écrivant ce fichier : sur ce même board A-K-Q-J-T,
// apparier l'as N'AMÉLIORE RIEN — une paire perd contre la quinte que le board fait déjà. Pour
// mesurer qu'une carte sert vraiment, il faut un board qui ne se suffit pas à lui-même.
bat('une carte qui apparie un board sans quinte ameliore bien la main',
  'Kd 3h As Ks Qh 7d 2c', 'As Ks Qh 7d 2c');

// ── 4. Le kicker, et l'égalité exacte ────────────────────────────────────────────────────────────
// Deux joueurs sur le même board : c'est `bestHandWinners` qui tranche, la fonction dont dépendent
// à la fois la désignation du gagnant et le calcul d'équité.
{
  const board = m('As 9d 4c 2h 7s');
  const gagnants = bestHandWinners(
    [{ seatId: 'ak', holeCards: m('Ad Kh') }, { seatId: 'aq', holeCards: m('Ac Qd') }],
    board
  );
  cas('AK bat AQ sur un board a l as (le kicker departage)',
    JSON.stringify(gagnants) === JSON.stringify(['ak']), `obtenu ${JSON.stringify(gagnants)}`);

  const partage = bestHandWinners(
    [{ seatId: 'a', holeCards: m('3c 5d') }, { seatId: 'b', holeCards: m('6h 8c') }],
    m('As Ks Qh Jd Th')
  );
  cas('deux joueurs qui jouent le board partagent le pot',
    JSON.stringify(partage.sort()) === JSON.stringify(['a', 'b']), `obtenu ${JSON.stringify(partage)}`);
}

// ── 5. La règle Omaha : EXACTEMENT deux cartes de la main ────────────────────────────────────────
// Le piège classique. Avec un seul pique en main et quatre au board, le Hold'em donne une quinte
// flush royale ; le PLO l'interdit, puisqu'il faut prendre exactement deux cartes fermées. Si les
// deux variantes rendaient la même chose, c'est que la règle Omaha ne serait pas appliquée.
{
  const hole = m('As 2c 3d 4h');
  const board = m('Ks Qs Js Ts 9c');
  const holdem = bestHandForVariant(hole, board, 'nlhe');
  const plo = bestHandForVariant(hole, board, 'plo');
  cas('le Hold em joue le board : quinte flush royale', compareHandRanks(holdem, plo) > 0,
    `nlhe ${JSON.stringify(holdem)} vs plo ${JSON.stringify(plo)}`);
  // Plus fort encore : le board porte une quinte K-Q-J-T-9, et en PLO le joueur ne peut même pas
  // la jouer — il lui faut deux cartes fermées, donc au mieux une hauteur d'as.
  cas('en PLO le joueur ne peut pas jouer la quinte du board',
    compareHandRanks(plo, bestHandRank(board)) < 0,
    `plo ${JSON.stringify(plo)} vs board seul ${JSON.stringify(bestHandRank(board))}`);
}

console.log(ko === 0 ? '\n🎉 tout passe' : `\n${ko} cas en échec`);
process.exit(ko === 0 ? 0 : 1);
