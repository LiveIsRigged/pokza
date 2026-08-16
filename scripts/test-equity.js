// Non-régression de l'équité : déterminisme et coût.
// ──────────────────────────────────────────────────
// Deux bugs corrigés le 16/08/2026, tous deux vérifiés ici :
//   1. le pourcentage bougeait d'un calcul à l'autre (Monte-Carlo sans graine), alors que le
//      replayer recalcule à CHAQUE step — reculer puis avancer changeait le chiffre affiché ;
//   2. le calcul coûtait ~560 ms en PLO5 à 4 joueurs, en synchrone pendant le rendu, et il était
//      repayé intégralement à chaque passage sur le même step.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/equity.ts \
//     --outDir scripts/b3 --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-equity.js

const { computeEquity } = require('./b3/engine/equity.js');

const C = (t) => ({ rank: t[0], suit: t[1] });
const cards = (...t) => t.map(C);

let ko = 0;
function cas(titre, ok, detail) {
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (detail) console.log(`   ${detail}\n`);
}

const AAvsKK = [
  { seatId: 'a', holeCards: cards('As', 'Ah') },
  { seatId: 'b', holeCards: cards('Kd', 'Kc') },
];

// ── 1. Déterminisme : c'est LE bug. 20 appels doivent rendre 20 fois le même chiffre.
{
  const vus = new Set();
  for (let i = 0; i < 20; i++) vus.add(computeEquity(AAvsKK, [], 'nlhe').a.toFixed(6));
  cas(
    'préflop : 20 calculs de la même situation rendent le même pourcentage',
    vus.size === 1,
    `valeurs distinctes obtenues : ${vus.size} → ${[...vus].join(', ')}`,
  );
}

// ── 2. Le déterminisme ne doit pas venir du seul cache : même graine ⇒ même résultat même après
// éviction. On sature le cache (201 situations bidon) puis on redemande la situation de départ.
{
  const avant = computeEquity(AAvsKK, [], 'nlhe').a;
  const rangs = '23456789TJQKA'.split('');
  let n = 0;
  for (const r1 of rangs) {
    for (const r2 of rangs) {
      if (n++ >= 210) break;
      computeEquity(
        [
          { seatId: 'x', holeCards: [C(r1 + 's'), C(r2 + 'h')] },
          { seatId: 'y', holeCards: cards('2c', '3d') },
        ],
        [],
        'nlhe',
      );
    }
  }
  const apres = computeEquity(AAvsKK, [], 'nlhe').a;
  cas(
    'après éviction du cache, la même situation rend toujours la même valeur',
    avant === apres,
    `avant ${avant.toFixed(4)} · après ${apres.toFixed(4)}`,
  );
}

// ── 3. L'ordre des sièges dans le tableau ne doit rien changer (clé canonique).
{
  const direct = computeEquity(AAvsKK, [], 'nlhe');
  const inverse = computeEquity([AAvsKK[1], AAvsKK[0]], [], 'nlhe');
  cas(
    "l'ordre des contendants n'influe pas sur le résultat",
    direct.a === inverse.a && direct.b === inverse.b,
    `a: ${direct.a.toFixed(4)} / ${inverse.a.toFixed(4)} · b: ${direct.b.toFixed(4)} / ${inverse.b.toFixed(4)}`,
  );
}

// ── 4. Justesse. Valeur de référence de As Ah contre Kd Kc préflop : **81,36 %**, obtenue ici même
// par un tirage de 200 000 (erreur type 0,09 point). Ce n'est PAS le 82,4 % que tout le monde cite :
// ce chiffre-là vaut pour un AA qui partage une couleur avec le KK et lui bloque ses tirages. Ici
// les quatre cartes sont de couleurs différentes, ce qui est le cas le moins favorable à AA.
// La tolérance de 1,5 point est celle d'un affichage arrondi à l'entier : au-delà, le pourcentage
// montré n'est plus celui qu'un joueur attend, et comme la graine est fixe, l'écart est DÉFINITIF
// pour cette situation-là — d'où un test, et pas une simple remarque.
{
  const e = computeEquity(AAvsKK, [], 'nlhe');
  cas(
    'AA contre KK préflop : à moins de 1,5 point de la référence 81,36 %',
    Math.abs(e.a - 81.36) < 1.5,
    `obtenu ${e.a.toFixed(2)} % / ${e.b.toFixed(2)} % · écart ${(e.a - 81.36).toFixed(2)} pt · somme ${(e.a + e.b).toFixed(2)}`,
  );
}

// ── 5. Justesse sur un cas énuméré exactement (river à venir seule) : AA contre KK sur un board
// sans aide, seuls les deux rois restants sauvent KK. 2 outs sur 44 cartes = 42/44 ≈ 95,45 %.
{
  const e = computeEquity(AAvsKK, cards('2c', '7d', '9s', 'Jh'), 'nlhe');
  cas(
    'énumération exacte à la river : 42/44 pour AA',
    Math.abs(e.a - (42 / 44) * 100) < 1e-9,
    `obtenu ${e.a.toFixed(4)} % (attendu ${((42 / 44) * 100).toFixed(4)} %)`,
  );
}

// ── 6. Coût : premier calcul PLO5 à 4 joueurs, puis rappel de la MÊME situation. Le second doit
// être quasi instantané — c'est tout l'objet du cache, puisque le replayer repasse par le même step
// à chaque aller-retour et à chaque relecture.
{
  const plo5 = [
    { seatId: 'a', holeCards: cards('As', 'Ah', 'Kd', 'Qc', 'Jh') },
    { seatId: 'b', holeCards: cards('Ts', '9h', '8d', '7c', '6h') },
    { seatId: 'c', holeCards: cards('2s', '3h', '4d', '5c', '6s') },
    { seatId: 'd', holeCards: cards('Kh', 'Qd', 'Jc', 'Th', '9d') },
  ];
  const t0 = Date.now();
  computeEquity(plo5, [], 'plo5');
  const froid = Date.now() - t0;
  const t1 = Date.now();
  computeEquity(plo5, [], 'plo5');
  const chaud = Date.now() - t1;
  cas(
    'seconde visite du même step : servie par le cache',
    chaud <= 2,
    `premier calcul ${froid} ms · rappel ${chaud} ms`,
  );
}

// ── 7. Le cache ne doit pas confondre deux situations voisines (même sièges, board différent).
{
  const sansBoard = computeEquity(AAvsKK, [], 'nlhe').a;
  const avecFlop = computeEquity(AAvsKK, cards('Kh', '7d', '2s'), 'nlhe').a;
  cas(
    'un board différent est bien une situation différente',
    Math.abs(sansBoard - avecFlop) > 5,
    `préflop ${sansBoard.toFixed(2)} % · flop donnant un brelan de rois à KK ${avecFlop.toFixed(2)} %`,
  );
}

console.log(ko === 0 ? '\nTous les cas passent.' : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
