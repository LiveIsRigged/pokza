const { determinePotAwards } = require('./b3/engine/handEngine.js');

const seat = (id, stack, cards) => ({ id, position: id.toUpperCase(), isHero: false, startingStack: stack, ...(cards ? { holeCards: cards } : {}) });
const act = (seatId, type, street, amount) => ({ seatId, type, street, ...(amount != null ? { amount } : {}) });
const C = (t) => ({ rank: t[0], suit: t[1] });
const cards = (...t) => t.map(C);
const board = { flop: cards('2c','7d','9s'), turn: C('Jh'), river: C('4c') };

let ko = 0;
function cas(titre, hand, attendu) {
  const awards = determinePotAwards(hand);
  const total = Object.values(require('./b3/engine/handEngine.js').committedBySeat(hand.actions)).reduce((a,b)=>a+b,0);
  const obtenu = {};
  for (const a of awards) obtenu[a.seatId] = Math.round(a.fraction * total);
  const somme = awards.reduce((s,a)=>s+a.fraction,0);
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu) && Math.abs(somme - 1) < 1e-9;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  console.log(`   pot ${total} · attendu ${JSON.stringify(attendu)} · obtenu ${JSON.stringify(obtenu)} · Σfractions=${somme.toFixed(6)}\n`);
}

// LE BUG D'ORIGINE : BTN tapis 100, SB relance 400, BB suit 400. BTN gagne l'abattage.
// Il ne peut gagner que 100 de chacun = 300. Le reste (600) se dispute entre SB et BB.
cas('tapis court gagnant : ne rafle que ce qu il a couvert', {
  variant: 'nlhe', board, seats: [
    seat('btn', 100, cards('As','Ah')),   // meilleure main
    seat('sb', 1000, cards('Kd','Kc')),   // 2e
    seat('bb', 1000, cards('Qd','Qc')),   // 3e
  ],
  actions: [act('btn','bet','flop',100), act('sb','raise','flop',400), act('bb','call','flop',400)],
}, { btn: 300, sb: 600 });

// Même pot, mais c'est SB qui gagne : il rafle tout (il couvre tout le monde).
cas('gros stack gagnant : rafle la totalite', {
  variant: 'nlhe', board, seats: [
    seat('btn', 100, cards('Qd','Qc')),
    seat('sb', 1000, cards('As','Ah')),
    seat('bb', 1000, cards('Kd','Kc')),
  ],
  actions: [act('btn','bet','flop',100), act('sb','raise','flop',400), act('bb','call','flop',400)],
}, { sb: 900 });

// Mise non suivie : A mise 500, B suit 100 a tapis. L excedent revient a A.
cas('mise non suivie rendue a son auteur', {
  variant: 'nlhe', board, seats: [
    seat('a', 500, cards('3d','3h')),
    seat('b', 100, cards('As','Ah')),   // B gagne l abattage
  ],
  actions: [act('a','bet','flop',500), act('b','call','flop',100)],
}, { b: 200, a: 400 });

// NON-REGRESSION : tout le monde a mise pareil, un seul gagnant -> comportement inchange.
cas('non-regression : mises egales, un gagnant', {
  variant: 'nlhe', board, seats: [
    seat('a', 500, cards('As','Ah')),
    seat('b', 500, cards('Kd','Kc')),
  ],
  actions: [act('a','bet','flop',200), act('b','call','flop',200)],
}, { a: 400 });

// NON-REGRESSION : partage a egalite.
cas('non-regression : pot partage', {
  variant: 'nlhe', board, seats: [
    seat('a', 500, cards('As','Ad')),
    seat('b', 500, cards('Ac','Ah')),
  ],
  actions: [act('a','bet','flop',200), act('b','call','flop',200)],
}, { a: 200, b: 200 });

// Un couche alimente le pot sans pouvoir le gagner.
cas('l argent d un joueur couche reste au pot', {
  variant: 'nlhe', board, seats: [
    seat('a', 500, cards('As','Ah')),
    seat('b', 500, cards('Kd','Kc')),
    seat('c', 500, null),
  ],
  actions: [act('c','bet','flop',50), act('a','raise','flop',200), act('b','call','flop',200), act('c','fold','flop')],
}, { a: 450 });

console.log(ko === 0 ? '✅ TOUS LES CAS PASSENT' : `❌ ${ko} cas en echec`);
