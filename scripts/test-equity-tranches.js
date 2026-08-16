// Équité découpée en tranches : preuve d'équivalence avec le calcul d'un seul bloc.
// ─────────────────────────────────────────────────────────────────────────────────
// Le calcul d'équité préflop gelait le fil JS pendant 168 ms sur un Mac (0,4 à 0,8 s sur iPhone) :
// il tournait en synchrone DANS le rendu du replayer, donc pendant tout ce temps ni défilement, ni
// bouton, ni animation. Il avance désormais par tranches, en rendant la main au navigateur entre
// chaque.
//
// LE RISQUE DE CE DÉCOUPAGE, et la raison d'être de ce fichier : l'estimateur tire plusieurs boards
// DISJOINTS par mélange complet, et c'est ce qui divise sa variance par deux. Couper au milieu d'un
// mélange casserait cette propriété SANS QUE RIEN NE LE SIGNALE — le pourcentage resterait juste en
// moyenne, simplement deux fois plus dispersé. Un test qui se contenterait de vérifier que le
// chiffre est "à peu près bon" ne verrait donc rien. D'où l'exigence ici : identité BIT À BIT avec
// l'implémentation précédente, sur exactement les mêmes situations.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/equity.ts \
//     --outDir scripts/b3 --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// et figer la version PRÉCÉDENTE comme référence (depuis un checkout du commit d'avant) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/equity.ts \
//     --outDir scripts/avant --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-equity-tranches.js

const fs = require('fs');
const path = require('path');

// Le nombre de tirages est une valeur produit, il bouge. Ce test ne porte PAS dessus : il porte sur
// le découpage. On aligne donc la référence sur le réglage courant, sinon toute évolution du
// nombre de tirages ferait échouer un test qui n'a rien à voir.
const N_COURANT = (() => {
  const m = fs.readFileSync(path.join(__dirname, 'b3/engine/equity.js'), 'utf8').match(/const MONTE_CARLO_SAMPLES = (\d+);/);
  if (!m) {
    console.error('KO : `MONTE_CARLO_SAMPLES` introuvable dans le build.');
    process.exit(1);
  }
  return m[1];
})();
const REF = path.join(__dirname, 'avant/engine/equityAligne.js');
{
  const src = fs.readFileSync(path.join(__dirname, 'avant/engine/equity.js'), 'utf8');
  fs.writeFileSync(REF, src.replace(/const MONTE_CARLO_SAMPLES = \d+;/, `const MONTE_CARLO_SAMPLES = ${N_COURANT};`));
}
const avant = require(REF);

// Sonde à granularité MAXIMALE : même code, mais une tranche par mélange (budget 0 ms). Si le
// découpage tombait ailleurs que sur les frontières de mélange, c'est ici que ça se verrait — la
// sonde et la version normale ne rendraient pas le même chiffre.
const SONDE = path.join(__dirname, 'b3/engine/equityProbe.js');
{
  const src = fs.readFileSync(path.join(__dirname, 'b3/engine/equity.js'), 'utf8');
  if (!src.includes('const TRANCHE_MS = 8;')) {
    console.error('KO : `const TRANCHE_MS = 8;` introuvable dans le build — sonde non construite.');
    process.exit(1);
  }
  fs.writeFileSync(SONDE, src.replace('const TRANCHE_MS = 8;', 'const TRANCHE_MS = 0;'));
}
const sonde = require(SONDE);

const C = (t) => ({ rank: t[0], suit: t[1] });
const cards = (...t) => t.map(C);
const main = (seatId, ...t) => ({ seatId, holeCards: cards(...t) });

let ko = 0;
function cas(titre, ok, detail) {
  console.log(`${ok ? '  ok  ' : '  KO  '} ${titre}${detail ? ` — ${detail}` : ''}`);
  if (!ok) ko++;
}

// Comparaison EXACTE (pas d'epsilon) : deux implémentations qui tirent la même suite de cartes
// produisent les mêmes sommes de doubles dans le même ordre, donc les mêmes bits.
function identiques(a, b) {
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of cles) if (!Object.is(a[k], b[k])) return false;
  return true;
}
const montre = (e) =>
  Object.keys(e)
    .sort()
    .map((k) => `${k}=${e[k].toFixed(10)}`)
    .join(' ');

const SITUATIONS = [
  {
    titre: "NLHE 2 joueurs, préflop (Monte-Carlo)",
    contenders: [main('a', 'Ah', 'As'), main('b', 'Kh', 'Ks')],
    board: [],
    variant: 'nlhe',
  },
  {
    titre: 'NLHE 3 joueurs, préflop (Monte-Carlo)',
    contenders: [main('a', 'Ah', 'As'), main('b', 'Kh', 'Ks'), main('c', '7c', '8c')],
    board: [],
    variant: 'nlhe',
  },
  {
    titre: 'NLHE 4 joueurs, préflop (Monte-Carlo)',
    contenders: [main('a', 'Ah', 'As'), main('b', 'Kh', 'Ks'), main('c', '7c', '8c'), main('d', 'Jd', 'Td')],
    board: [],
    variant: 'nlhe',
  },
  {
    titre: 'NLHE 2 joueurs, flop (Monte-Carlo, 2 cartes à venir → énumération)',
    contenders: [main('a', 'Ah', 'As'), main('b', 'Kh', 'Ks')],
    board: cards('2c', '7d', '9s'),
    variant: 'nlhe',
  },
  {
    titre: 'NLHE 2 joueurs, turn (énumération exacte)',
    contenders: [main('a', 'Ah', 'As'), main('b', 'Kh', 'Ks')],
    board: cards('2c', '7d', '9s', 'Jh'),
    variant: 'nlhe',
  },
  {
    titre: 'PLO 4 joueurs, préflop (Monte-Carlo)',
    contenders: [
      main('a', 'Ah', 'As', 'Kd', 'Qc'),
      main('b', 'Kh', 'Ks', '9d', '8c'),
      main('c', '7c', '8h', 'Td', 'Jd'),
      main('d', '2s', '3h', '4d', '5c'),
    ],
    board: [],
    variant: 'plo',
  },
  {
    titre: 'PLO5 4 joueurs, préflop (Monte-Carlo — le cas le plus coûteux)',
    contenders: [
      main('a', 'Ah', 'As', 'Kd', 'Qc', '2h'),
      main('b', 'Kh', 'Ks', '9d', '8c', '3h'),
      main('c', '7c', '8h', 'Td', 'Jd', '4h'),
      main('d', '2s', '3d', '4c', '5c', '6h'),
    ],
    board: [],
    variant: 'plo5',
  },
  {
    titre: 'PLO5 3 joueurs, flop (Monte-Carlo, 2 cartes à venir → énumération)',
    contenders: [
      main('a', 'Ah', 'As', 'Kd', 'Qc', '2h'),
      main('b', 'Kh', 'Ks', '9d', '8c', '3h'),
      main('c', '7c', '8h', 'Td', 'Jd', '4h'),
    ],
    board: cards('2c', '7d', '9s'),
    variant: 'plo5',
  },
];

function parTranches(mod, s) {
  return new Promise((resolve, reject) => {
    let appels = 0;
    mod.runEquityInSlices(s.contenders, s.board, s.variant, (equities) => {
      appels++;
      if (appels > 1) reject(new Error(`onDone appelé ${appels} fois`));
      else resolve(equities);
    });
  });
}

async function main_() {
  console.log('\n1. Identité bit à bit avec l\'implémentation précédente\n');

  for (const s of SITUATIONS) {
    const ref = avant.computeEquity(s.contenders, s.board, s.variant);

    // Le cache est partagé au sein d'un module : chaque appel ci-dessous doit donc être fait sur un
    // module fraîchement chargé, sinon le deuxième lirait simplement ce que le premier a écrit et
    // ne prouverait rien. On force le rechargement en vidant le cache de `require`.
    delete require.cache[require.resolve('./b3/engine/equity.js')];
    const modSync = require('./b3/engine/equity.js');
    const sync = modSync.computeEquity(s.contenders, s.board, s.variant);
    cas(`${s.titre} — version synchrone`, identiques(ref, sync), identiques(ref, sync) ? montre(sync) : `attendu ${montre(ref)}, obtenu ${montre(sync)}`);

    delete require.cache[require.resolve('./b3/engine/equity.js')];
    const modTr = require('./b3/engine/equity.js');
    const tr = await parTranches(modTr, s);
    cas(`${s.titre} — par tranches (8 ms)`, identiques(ref, tr), identiques(ref, tr) ? '' : `attendu ${montre(ref)}, obtenu ${montre(tr)}`);
  }

  console.log('\n2. Le résultat ne dépend PAS de la taille des tranches (une tranche = un mélange)\n');

  // Les deux préflops les plus coûteux suffisent : avec un budget de 0 ms, chaque mélange est une
  // tranche, donc ~300 allers-retours par l'ordonnanceur. C'est lent, inutile de le faire sur les
  // huit situations.
  for (const s of [SITUATIONS[2], SITUATIONS[6]]) {
    const ref = avant.computeEquity(s.contenders, s.board, s.variant);
    delete require.cache[require.resolve(SONDE)];
    const modSonde = require(SONDE);
    const fin = await parTranches(modSonde, s);
    cas(`${s.titre} — 1 mélange par tranche`, identiques(ref, fin), identiques(ref, fin) ? '' : `attendu ${montre(ref)}, obtenu ${montre(fin)}`);
  }

  console.log('\n3. Le cache reste servi de façon SYNCHRONE (pas de clignotement au retour en arrière)\n');

  {
    delete require.cache[require.resolve('./b3/engine/equity.js')];
    const mod = require('./b3/engine/equity.js');
    const s = SITUATIONS[2];
    const avantCalcul = mod.equityIfImmediate(s.contenders, s.board, s.variant);
    cas('préflop jamais calculé → rien d\'immédiat', avantCalcul === null, String(avantCalcul));

    const calcule = await parTranches(mod, s);
    const apresCalcul = mod.equityIfImmediate(s.contenders, s.board, s.variant);
    cas(
      'après le calcul par tranches → disponible immédiatement, même valeur',
      apresCalcul !== null && identiques(calcule, apresCalcul),
      apresCalcul === null ? 'null' : montre(apresCalcul)
    );

    const turn = SITUATIONS[4];
    const exact = mod.equityIfImmediate(turn.contenders, turn.board, turn.variant);
    cas('turn (énumération exacte) → disponible immédiatement sans calcul de fond', exact !== null, exact ? montre(exact) : 'null');
  }

  console.log('\n4. Annulation : un calcul dont plus personne n\'attend le résultat s\'arrête\n');

  {
    delete require.cache[require.resolve('./b3/engine/equity.js')];
    const mod = require('./b3/engine/equity.js');
    const s = SITUATIONS[6];
    let appele = false;
    const annuler = mod.runEquityInSlices(s.contenders, s.board, s.variant, () => {
      appele = true;
    });
    annuler();
    await new Promise((r) => setTimeout(r, 400));
    cas('après annulation, onDone n\'est jamais appelé', !appele);
    cas(
      'et rien n\'a été écrit en cache (le calcul n\'est pas allé au bout)',
      mod.equityIfImmediate(s.contenders, s.board, s.variant) === null
    );
  }

  console.log('\n5. Gel du fil : la mesure qui motivait tout le chantier\n');

  // ⚠️ L'horloge doit tourner AVANT et APRÈS le calcul, sinon elle ne bat pas une seule fois et
  // affiche "0 ms de gel", ce qui se lit à tort comme "rien n'a été bloqué" (piège déjà rencontré).
  async function gelMax(lancer) {
    const battements = [];
    let precedent = Date.now();
    const h = setInterval(() => {
      const t = Date.now();
      battements.push(t - precedent);
      precedent = t;
    }, 10);
    await new Promise((r) => setTimeout(r, 120));
    await lancer();
    await new Promise((r) => setTimeout(r, 120));
    clearInterval(h);
    if (battements.length < 20) throw new Error(`horloge muette (${battements.length} battements) : mesure invalide`);
    // Un battement mesure l'écart ENTRE deux tics, période de l'horloge comprise : le blocage réel
    // est le surcroît par rapport au battement normal, pas le battement brut.
    const tries = [...battements].sort((a, b) => a - b);
    const normal = tries[Math.floor(tries.length / 2)];
    const max = Math.max(...battements);
    return { max, normal, blocage: max - normal, battements: battements.length };
  }

  const s = SITUATIONS[6]; // PLO5 4 joueurs préflop

  delete require.cache[require.resolve('./b3/engine/equity.js')];
  const modA = require('./b3/engine/equity.js');
  const gelSync = await gelMax(async () => {
    modA.computeEquity(s.contenders, s.board, s.variant);
  });

  delete require.cache[require.resolve('./b3/engine/equity.js')];
  const modB = require('./b3/engine/equity.js');
  const debut = Date.now();
  const gelTranches = await gelMax(async () => {
    await parTranches(modB, s);
  });
  const totalTranches = Date.now() - debut - 240;

  const ligne = (t, g) =>
    `     ${t} : battement normal ${g.normal} ms, plus long ${g.max} ms → blocage ${g.blocage} ms  (${g.battements} battements)`;
  console.log(ligne('synchrone   ', gelSync));
  console.log(ligne('par tranches', gelTranches) + `, ~${totalTranches} ms au total`);
  cas(
    'aucune tranche ne bloque plus qu\'une frame de 60 Hz (16,6 ms)',
    gelTranches.blocage <= 16,
    `${gelTranches.blocage} ms`
  );
  cas(
    'le blocage est divisé par au moins 5',
    gelTranches.blocage * 5 <= gelSync.blocage,
    `${gelSync.blocage} ms → ${gelTranches.blocage} ms`
  );

  console.log(`\n${ko === 0 ? 'TOUT PASSE' : `${ko} ÉCHEC(S)`}\n`);
  process.exit(ko === 0 ? 0 : 1);
}

main_().catch((e) => {
  console.error(e);
  process.exit(1);
});
