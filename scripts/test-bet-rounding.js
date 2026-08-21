// Non-régression de l'arrondi des raccourcis de mise.
// ──────────────────────────────────────────────────
// Ce que ce script protège, et qui a coûté cher à établir :
//   1. le pas ne doit JAMAIS sortir de l'échelle des jetons — la règle intuitive « le pas = la SB »
//      donnait 6 en 6-12 (mises à 24/30/36) et 200 en 200-400 ;
//   2. la granularité doit grossir avec le montant — un second palier FIXE à 25 en 5-10 sortait
//      525, 1075 puis 2675, que personne n'annonce ;
//   3. les cinq limites de référence, validées une par une, ne doivent pas bouger ;
//   4. « Pot » ne dépasse jamais le pot (illégal en PLO, où le pot est le maximum).
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/betRounding.ts \
//     --outDir scripts/b3 --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-bet-rounding.js

const { tableStep, betStep, roundBet, nextBetAbove, CHIP_LADDER } = require('./b3/utils/betRounding.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)} · obtenu ${JSON.stringify(obtenu)}`);
}
const cash = (sb, bb) => ({ gameType: 'cash', sb, bb });

// ── 1. Les cinq limites validées : leur pas plancher est figé, il ne se redécouvre pas ──────────
cas('pas plancher des limites de référence',
  [[1,2],[1,3],[2,5],[5,10],[2,4]].map(([sb,bb]) => tableStep(sb,bb)),
  [2, 5, 5, 5, 2]);

// ── 2. Le pas reste un jeton réel, même sur des blindes exotiques ────────────────────────────────
cas('6-12 → 5 et non 6 (personne ne mise par multiples de 6)', tableStep(6, 12), 5);
cas('200-400 → 100 et non 200 (le jeton de travail est le 100)', tableStep(200, 400), 100);
cas('tout pas plancher appartient à l’échelle des jetons',
  [[1,2],[1,3],[2,3],[2,5],[3,6],[5,10],[2,4],[6,12],[10,20],[10,25],[25,50],[50,100],[100,200],[200,400],[500,1000]]
    .every(([sb,bb]) => CHIP_LADDER.includes(tableStep(sb,bb))),
  true);

// ── 3. Le cas d'origine, et la famille de montants qui a fait rejeter le palier fixe ─────────────
cas('5-10 : le 1/3 de 84 passe de 28 à 30', roundBet(28, cash(5,10)), 30);
cas('5-10 : ni 525 ni 532 sur un tiers de 1600', roundBet(1600/3, cash(5,10)), 550);
cas('5-10 : plus aucun montant « en quarts » dans les gros pots',
  [1067, 1333, 2667].map((m) => roundBet(m, cash(5,10))),
  [1100, 1300, 2750]);

// ── 4. Le plancher garde la finesse là où les jetons circulent ───────────────────────────────────
cas('2-4-8 : 24 € dans un pot de 72 reste 24', roundBet(72/3, cash(2,4)), 24);
cas('2-5 : le même tiers de 72 remonte à 25 (pas de jeton de 2)', roundBet(72/3, cash(2,5)), 25);

// ── 5. Tournoi : 3 chiffres significatifs, sans logique de jetons ────────────────────────────────
const tour = { gameType: 'tournament', sb: 500, bb: 1000 };
cas('tournoi : 3 chiffres significatifs',
  [16777, 4250, 1417, 433, 87, 137500].map((m) => roundBet(m, tour)),
  [16800, 4250, 1420, 433, 87, 138000]);

// ── 6. « Pot » ne dépasse jamais le pot ──────────────────────────────────────────────────────────
cas('« Pot » arrondi vers le bas ne dépasse pas le pot',
  [84, 155, 1600].every((pot) => roundBet(pot, cash(5,10), 'down') <= pot),
  true);
cas('5-10 : « Pot » sur 84 descend à 80 au lieu de monter à 85', roundBet(84, cash(5,10), 'down'), 80);

// ── 7. Remontée au-dessus de la mise à suivre (sinon bouton mort à la validation) ────────────────
cas('nextBetAbove donne toujours un montant strictement supérieur',
  [10, 25, 30, 145, 533, 1000].every((v) => nextBetAbove(v, cash(5,10)) > v),
  true);
cas('5-10 : au-dessus d’une mise de 30, le premier montant proposable est 35', nextBetAbove(30, cash(5,10)), 35);

// ── 8. Invariants généraux, balayés ──────────────────────────────────────────────────────────────
const limites = [[1,2],[1,3],[2,5],[5,10],[2,4],[6,12],[25,50],[200,400]];
let derives = [], horsPas = [];
for (const [sb, bb] of limites) {
  for (let pot = 4*bb; pot <= 400*bb; pot += bb) {
    for (const f of [1/3, 1/2, 2/3]) {
      const brut = pot * f, arrondi = roundBet(brut, cash(sb,bb));
      const pas = betStep(brut, cash(sb,bb));
      if (Math.abs(arrondi - brut) > pas / 2 + 1e-9) derives.push([sb,bb,brut,arrondi]);
      if (Math.abs(arrondi / pas - Math.round(arrondi / pas)) > 1e-9) horsPas.push([sb,bb,brut,arrondi,pas]);
    }
  }
}
cas('aucun arrondi ne s’écarte de plus d’un demi-pas', derives.length, 0);
cas('tout montant arrondi est un multiple exact de son pas', horsPas.length, 0);

console.log(ko === 0 ? '\nTout est vert.' : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
