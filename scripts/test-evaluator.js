// Non-régression de l'évaluateur de mains — le composant le plus critique de l'app.
// ================================================================================
// `evaluate5` décide qui gagne une main ET alimente le calcul d'équité (800 000 appels par main à
// tapis). Elle a été réécrite le 16/08/2026 pour la vitesse, à comportement STRICTEMENT identique.
//
// Ce script compare la version courante à la version d'AVANT, figée dans `scripts/ref/`, sur des
// millions de mains tirées au hasard. Un test différentiel de cette taille vaut mieux qu'une liste
// de cas écrits à la main : il ne dépend pas de ce que j'ai pensé à tester, et sur Pokza l'attendu
// écrit à la main s'est déjà révélé faux trois fois (cf. mémoire projet).
//
// Compiler les deux versions avant de lancer :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/handEvaluator.ts \
//     --outDir scripts/b3 --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
//   (la référence `scripts/ref/` est produite de la même façon depuis le commit precedent)
// puis : node scripts/test-evaluator.js

const ref = require('./ref/engine/handEvaluatorProbe.js');
const cur = require('./b3/engine/handEvaluatorProbe.js');

const RANGS = '23456789TJQKA'.split('');
const COULEURS = ['h', 'd', 'c', 's'];
const PAQUET = [];
for (const rank of RANGS) for (const suit of COULEURS) PAQUET.push({ rank, suit });

let ko = 0;
function cas(titre, ok, detail) {
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (detail) console.log(`   ${detail}`);
}

const melange = (n) => {
  const c = PAQUET.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (52 - i));
    const t = c[i];
    c[i] = c[j];
    c[j] = t;
  }
  return c.slice(0, n);
};
const nom = (m) => m.map((c) => c.rank + c.suit).join(' ');

// ── 1. Mains de 5 cartes : le classement doit être identique, terme à terme.
{
  let ecarts = 0;
  let premier = null;
  const N = 2_000_000;
  for (let i = 0; i < N; i++) {
    const m = melange(5);
    const a = ref.evaluate5(m);
    const b = cur.evaluate5(m);
    if (a.length !== b.length || a.some((v, k) => v !== b[k])) {
      ecarts++;
      if (!premier) premier = `${nom(m)} → ref [${a}] vs courant [${b}]`;
    }
  }
  cas(`${N.toLocaleString('fr')} mains de 5 cartes classées à l'identique`, ecarts === 0, premier ?? `${ecarts} écart(s)`);
}

// ── 2. Sept cartes (Hold'em) : la MEILLEURE main de 5 parmi 7 doit être la même.
{
  let ecarts = 0;
  let premier = null;
  const N = 300_000;
  for (let i = 0; i < N; i++) {
    const m = melange(7);
    const a = ref.bestHandRank(m);
    const b = cur.bestHandRank(m);
    if (a.length !== b.length || a.some((v, k) => v !== b[k])) {
      ecarts++;
      if (!premier) premier = `${nom(m)} → ref [${a}] vs courant [${b}]`;
    }
  }
  cas(`${N.toLocaleString('fr')} mains de 7 cartes : meilleure combinaison identique`, ecarts === 0, premier ?? `${ecarts} écart(s)`);
}

// ── 3. Désignation du gagnant, la sortie réellement utilisée par l'app — en Hold'em et en Omaha,
// où la règle « exactement 2 en main + 3 au board » emprunte un tout autre chemin de code.
for (const [variante, nbCartes] of [['nlhe', 2], ['plo', 4], ['plo5', 5]]) {
  let ecarts = 0;
  let premier = null;
  const N = 60_000;
  for (let i = 0; i < N; i++) {
    const tirage = melange(5 + 3 * nbCartes);
    const board = tirage.slice(0, 5);
    const contenders = [0, 1, 2].map((k) => ({
      seatId: 's' + k,
      holeCards: tirage.slice(5 + k * nbCartes, 5 + (k + 1) * nbCartes),
    }));
    const a = ref.bestHandWinners(contenders, board, variante).join(',');
    const b = cur.bestHandWinners(contenders, board, variante).join(',');
    if (a !== b) {
      ecarts++;
      if (!premier) premier = `board ${nom(board)} → ref [${a}] vs courant [${b}]`;
    }
  }
  cas(`${N.toLocaleString('fr')} abattages à 3 joueurs en ${variante} : mêmes gagnants`, ecarts === 0, premier ?? `${ecarts} écart(s)`);
}

// ── 4. Repères de poker vérifiables à l'œil : chaque catégorie doit sortir avec le bon code, et le
// départage doit être le bon. C'est le complément du différentiel : si les DEUX versions se
// trompaient de la même façon, seul un cas écrit à la main pourrait le dire.
{
  const C = (t) => ({ rank: t[0], suit: t[1] });
  const m = (...t) => t.map(C);
  const reperes = [
    ['quinte flush royale', m('As', 'Ks', 'Qs', 'Js', 'Ts'), 8],
    ['quinte flush basse (A-2-3-4-5)', m('Ah', '2h', '3h', '4h', '5h'), 8],
    ['carré', m('9c', '9d', '9h', '9s', '2c'), 7],
    ['full', m('9c', '9d', '9h', '2s', '2c'), 6],
    ['couleur', m('Ah', 'Jh', '9h', '5h', '2h'), 5],
    ['quinte', m('9c', '8d', '7h', '6s', '5c'), 4],
    ['quinte basse (la roue)', m('Ac', '2d', '3h', '4s', '5c'), 4],
    ['brelan', m('9c', '9d', '9h', 'Ks', '2c'), 3],
    ['double paire', m('9c', '9d', '2h', '2s', 'Kc'), 2],
    ['paire', m('9c', '9d', 'Kh', '7s', '2c'), 1],
    ['carte haute', m('Ac', 'Jd', '9h', '7s', '2c'), 0],
  ];
  let ko2 = 0;
  const details = [];
  for (const [titre, main, categorieAttendue] of reperes) {
    const r = cur.evaluate5(main);
    if (r[0] !== categorieAttendue) {
      ko2++;
      details.push(`${titre} → categorie ${r[0]} au lieu de ${categorieAttendue}`);
    }
  }
  // La roue culmine au 5, pas à l'as : sinon elle battrait 6-7-8-9-10.
  const roue = cur.evaluate5(m('Ac', '2d', '3h', '4s', '5c'));
  if (roue[1] !== 5) {
    ko2++;
    details.push(`la roue culmine a ${roue[1]} au lieu de 5`);
  }
  cas('11 repères de poker + la roue qui culmine au 5', ko2 === 0, details.join(' · '));
}

console.log(ko === 0 ? '\nTous les cas passent.' : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
