// Ce qui décide qu'une main du fil est LUE — la branche « 8 secondes à l'écran ».
// ──────────────────────────────────────────────────────────────────────────────
// Ce que ce script protège :
//   1. une carte PLUS HAUTE que l'écran est comptée — le cas NORMAL (≈942 px pour ≈700 px) passe
//      par la 1re branche, et c'est au-delà de DEUX écrans que la 2e devient indispensable ;
//   2. une carte à peine entamée en bas d'écran n'est PAS comptée ;
//   3. il faut vraiment 8 s, pas 7 ;
//   4. le temps ne s'accumule QUE tant que la carte reste visible… mais ce qui est acquis ne se
//      perd pas : sortir puis revenir reprend là où on en était (sinon une main lue en deux fois
//      ne serait jamais lue) ;
//   5. une carte de hauteur nulle (mesurée avant sa mise en page) ne compte jamais.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/lectureVisibilite.ts \
//     --outDir scripts/lv --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-lecture-visibilite.js

const {
  partVisible,
  estAssezVisible,
  avancerLecture,
  READ_DWELL_MS,
} = require('./lv/utils/lectureVisibilite.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)} · obtenu ${JSON.stringify(obtenu)}`);
}

// Les mesures réelles du fil : une carte de main, une fenêtre de téléphone.
const CARTE = 942;
const ECRAN = 700;
const ecran = (offset) => ({ offset, height: ECRAN });

// ── 1. Le cas normal : la carte est plus haute que l'écran.
cas(
  'carte plus haute que l’écran, cadrée dessus → lue',
  estAssezVisible({ y: 0, h: CARTE }, ecran(0)),
  true
);
cas(
  'part visible plafonnée par la fenêtre, pas par la carte',
  partVisible({ y: 0, h: CARTE }, ecran(0)),
  ECRAN
);
// LA FRONTIÈRE des deux branches, mesurée et non supposée : la première suffit tant que la carte
// fait moins de DEUX écrans de haut. Au-delà, seule la seconde attrape la carte — et une main
// longue, description dépliée et commentaires ouverts, y arrive.
cas('carte d’un écran et demi → la 1re branche suffit', ECRAN >= 1050 * 0.5, true);
cas('carte de deux écrans et demi → la 1re branche ne suffit plus', ECRAN >= 1750 * 0.5, false);
cas(
  'et la 2e branche la rattrape : carte de 1750 px cadrée → lue',
  estAssezVisible({ y: 0, h: 1750 }, ecran(0)),
  true
);

// ── 2. Une carte à peine entamée en bas d'écran.
cas(
  'carte affleurant le bas de l’écran (300 px sur 942) → pas lue',
  estAssezVisible({ y: 400, h: CARTE }, ecran(0)),
  false
);
cas(
  'carte à moitié entrée (350 px = la moitié de l’écran) → lue',
  estAssezVisible({ y: 350, h: CARTE }, ecran(0)),
  true
);

// ── 3. Une carte COURTE, plus petite que l'écran : c'est la 1re branche qui sert.
cas('carte courte entièrement visible → lue', estAssezVisible({ y: 100, h: 200 }, ecran(0)), true);
cas(
  'carte courte visible à 40 % → pas lue',
  estAssezVisible({ y: 620, h: 200 }, ecran(0)),
  false
);

// ── 4. Le minuteur.
const boites = new Map([['a', { y: 0, h: CARTE }]]);
let cumul = new Map();
const tours = [];
for (let i = 1; i <= 9; i++) {
  tours.push(avancerLecture(['a'], boites, ecran(0), cumul, 1000).length);
}
cas('8 tours d’une seconde → lue au 8e, pas avant', tours, [0, 0, 0, 0, 0, 0, 0, 1, 0]);
cas('le seuil est bien 8 000 ms', READ_DWELL_MS, 8000);

// ── 5. Ce qui est acquis ne se perd pas.
cumul = new Map();
avancerLecture(['a'], boites, ecran(0), cumul, 1000);
avancerLecture(['a'], boites, ecran(0), cumul, 1000);
avancerLecture(['a'], boites, ecran(5000), cumul, 1000); // la carte est sortie de l’écran
cas('hors écran : rien ne s’ajoute', cumul.get('a'), 2000);
const reprise = [];
for (let i = 0; i < 6; i++) {
  reprise.push(avancerLecture(['a'], boites, ecran(0), cumul, 1000).length);
}
cas('de retour à l’écran, on reprend à 2 s → lue au 6e tour', reprise, [0, 0, 0, 0, 0, 1]);

// ── 6. Une carte pas encore mise en page.
cas('hauteur nulle → jamais lue', estAssezVisible({ y: 0, h: 0 }, ecran(0)), false);
cas(
  'fenêtre nulle (écran pas encore mesuré) → jamais lue',
  estAssezVisible({ y: 0, h: CARTE }, { offset: 0, height: 0 }),
  false
);
cas(
  'main absente des mesures → ignorée sans planter',
  avancerLecture(['inconnue'], boites, ecran(0), new Map(), 9000),
  []
);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
