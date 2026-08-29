// Le straddle au bouton (« BTN straddle »).
// ────────────────────────────────────────
// La règle tranchée avec Victor le 29/08 : `straddleCount` compte les straddles de la MAIN, et le
// straddle du bouton PREND LA PLACE du dernier maillon de la chaîne. « Double » + bouton, ce sont
// donc deux straddles (UTG puis le bouton), jamais trois.
//
// Ce script mesure les quatre endroits où une erreur ne se verrait pas à l'œil :
//   1. qui poste quoi, pour chaque combinaison chip × bouton ;
//   2. le garde-fou des tables courtes — le bouton ne peut pas straddler s'il est déjà premier
//      parleur (2-3 joueurs) ni si la chaîne le touche (sinon deux réglages donneraient la même
//      main, et on ne saurait plus la relire) ;
//   3. les LIBELLÉS : un straddle au bouton ne doit pas décaler les noms UTG des sièges du milieu ;
//   4. l'aller-retour d'une main publiée — c'est le seul endroit où la distinction chaîne/bouton
//      doit se redéduire des seules actions, et une erreur y déplace les straddles de siège.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/rehydrate.ts pokza-app/src/creator/positions.ts \
//     pokza-app/src/creator/straddle.ts pokza-app/src/engine/handEngine.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-straddle-btn.js

const {
  straddlesAPoster,
  boutonPossible,
  longueurChaine,
  montantBoutonPropose,
  montantsChaineProposes,
  cascadeChaine,
  recalerStraddle,
} = require('./cm/creator/straddle.js');
const { straddleSeatLabel, chainStraddleCount } = require('./cm/engine/handEngine.js');
const { postToSeed } = require('./cm/creator/rehydrate.js');
const { buildSeats, getActingOrder, getActingOrderAfter } = require('./cm/creator/positions.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const ctx = (patch) => ({
  gameType: 'cash',
  bombPot: false,
  numPlayers: 6,
  straddleCount: 0,
  straddleAmounts: [],
  straddleBouton: false,
  straddleBoutonMontant: 0,
  bb: 4,
  ...patch,
});
// Forme lisible d'un slot : « UTG@8 », « BTN*16 » pour celui du bouton.
const resume = (slots) => slots.map((s) => `${s.position}${s.bouton ? '*' : '@'}${s.montant}`);

console.log('\n── 1. Qui poste quoi (table de 6, blindes 2/4) ──');

cas('Aucun straddle', resume(straddlesAPoster(ctx({ straddleCount: 0 }))), []);
cas(
  'Simple sans bouton → UTG seul',
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmounts: [8] }))),
  ['UTG@8']
);
cas(
  'Simple AVEC bouton → le bouton seul, la chaîne est vide',
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmounts: [], straddleBouton: true, straddleBoutonMontant: 8 }))),
  ['BTN*8']
);
cas(
  'Double sans bouton → UTG puis HJ, montant doublé',
  resume(straddlesAPoster(ctx({ straddleCount: 2, straddleAmounts: [8, 16] }))),
  ['UTG@8', 'HJ@16']
);
// L'EXEMPLE DE VICTOR : 2/4, straddle UTG 8, straddle BTN 16.
cas(
  "Double AVEC bouton → UTG puis le bouton (l'exemple 2/4 · UTG 8 · BTN 16)",
  resume(straddlesAPoster(ctx({ straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 16 }))),
  ['UTG@8', 'BTN*16']
);
cas(
  'Triple sans bouton → UTG, HJ, CO',
  resume(straddlesAPoster(ctx({ straddleCount: 3, straddleAmounts: [8, 16, 32] }))),
  ['UTG@8', 'HJ@16', 'CO@32']
);
cas(
  'Triple AVEC bouton → UTG, HJ, puis le bouton (toujours TROIS straddles)',
  resume(straddlesAPoster(ctx({ straddleCount: 3, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 32 }))),
  ['UTG@8', 'HJ@16', 'BTN*32']
);
// Le bouton est posté EN DERNIER : c'est ce qui fait que la parole reprend après lui, donc à la SB.
cas(
  'Le straddle du bouton est toujours le dernier posté',
  straddlesAPoster(ctx({ straddleCount: 3, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 32 })).at(-1).bouton,
  true
);
cas('Pas de straddle en tournoi', resume(straddlesAPoster(ctx({ gameType: 'tournament', straddleCount: 2, straddleAmounts: [8, 16] }))), []);
cas('Pas de straddle en bomb pot', resume(straddlesAPoster(ctx({ bombPot: true, straddleCount: 2, straddleAmounts: [8, 16] }))), []);
cas(
  'Un montant à 0 ne poste rien',
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmounts: [0], straddleBouton: true, straddleBoutonMontant: 0 }))),
  []
);

console.log('\n── 2. Le garde-fou des tables courtes ──');

// À 2 et 3 joueurs le bouton EST le premier parleur : y straddler, c'est le straddle simple
// ordinaire, pas un straddle « au bouton ».
cas('2 joueurs : jamais', [1, 2, 3].map((n) => boutonPossible(2, n)), [false, false, false]);
cas('3 joueurs : jamais', [1, 2, 3].map((n) => boutonPossible(3, n)), [false, false, false]);
// À 4 joueurs [CO, BTN, SB, BB] : « Double » mettrait la chaîne sur CO puis BTN, indistinguable
// d'un CO + bouton une fois publiée.
cas('4 joueurs : Simple seulement', [1, 2, 3].map((n) => boutonPossible(4, n)), [true, false, false]);
cas('5 joueurs : jusqu\'à Double', [1, 2, 3].map((n) => boutonPossible(5, n)), [true, true, false]);
cas('6 joueurs : tout', [1, 2, 3].map((n) => boutonPossible(6, n)), [true, true, true]);
cas('9 joueurs : tout', [1, 2, 3].map((n) => boutonPossible(9, n)), [true, true, true]);
// Coché mais impossible : on retombe silencieusement sur la chaîne entière, jamais sur une main
// bancale (le formulaire, lui, décoche pour de bon — cf. `update` dans ContextStep).
cas(
  'Coché sur une table où c\'est impossible → chaîne entière',
  resume(straddlesAPoster(ctx({ numPlayers: 4, straddleCount: 2, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 16 }))),
  ['CO@8', 'BTN@16']
);
cas('Longueur de chaîne, Double + bouton', longueurChaine(ctx({ straddleCount: 2, straddleBouton: true })), 1);
cas('Longueur de chaîne, Double sans bouton', longueurChaine(ctx({ straddleCount: 2 })), 2);

console.log('\n── 3. Le montant proposé au bouton ──');

// 2x le dernier straddle de la chaîne QUI LE PRÉCÈDE (donc raccourcie d'un cran), 2x la BB si elle
// est vide.
cas('Chaîne vide → 2x la BB', montantBoutonPropose([], 4), 8);
cas('Chaîne [8] → 16', montantBoutonPropose([8], 4), 16);
cas('Chaîne [8, 16] → 32', montantBoutonPropose([8, 16], 4), 32);

console.log('\n── 3 bis. Montants proposés et cascade ──');

// Choisir un nombre de straddles complète les manquants par doublement, et garde les saisis.
cas('Chaîne vide → doublement depuis 2x la BB', montantsChaineProposes([], 3, 4), [8, 16, 32]);
cas('Un montant déjà saisi est gardé, la suite se déduit', montantsChaineProposes([10], 3, 4), [10, 20, 40]);
cas('Raccourcir la chaîne tronque', montantsChaineProposes([8, 16, 32], 1, 4), [8]);
cas('Chaîne à zéro', montantsChaineProposes([8, 16], 0, 4), []);

// Modifier un montant redescend le doublement sur les SUIVANTS, jamais sur les précédents — même
// geste que la SB qui repose la BB au double, juste au-dessus dans le formulaire.
cas('Corriger le premier réaligne la suite', cascadeChaine([8, 16, 32], 0, 10), [10, 20, 40]);
cas('Corriger celui du milieu laisse le premier', cascadeChaine([8, 16, 32], 1, 30), [8, 30, 60]);
cas('Corriger le dernier ne touche à rien d\'autre', cascadeChaine([8, 16, 32], 2, 50), [8, 16, 50]);

// Chaque straddle porte son propre montant : une chaîne qui ne double pas doit se poster telle quelle.
cas(
  'Une chaîne saisie à la main se poste telle quelle',
  resume(straddlesAPoster(ctx({ straddleCount: 3, straddleAmounts: [10, 30, 100] }))),
  ['UTG@10', 'HJ@30', 'CO@100']
);

console.log('\n── 3 ter. Le recalage, seul juge de la cohérence ──');

// `recalerStraddle` applique les trois règles après CHAQUE changement du formulaire. On lui donne
// l'avant et l'après, il rend les trois réglages corrigés.
const recale = (avant, apres) => {
  const a = ctx(avant);
  return recalerStraddle(a, ctx({ ...avant, ...apres }));
};

// LE RETOUR DE VICTOR : le bouton suit la cascade comme le reste. Corriger l'UTG réaligne tout ce
// qui vient après lui, le bouton compris — il EST le dernier straddle.
cas(
  'Corriger la chaîne repropose le bouton',
  recale(
    { straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 16 },
    { straddleAmounts: cascadeChaine([8], 0, 10) }
  ),
  { straddleBouton: true, straddleAmounts: [10], straddleBoutonMontant: 20 }
);
cas(
  'Chaîne de 2 : la cascade descend jusqu\'au bouton',
  recale(
    { straddleCount: 3, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 32 },
    { straddleAmounts: cascadeChaine([8, 16], 0, 10) }
  ),
  { straddleBouton: true, straddleAmounts: [10, 20], straddleBoutonMontant: 40 }
);
// Modifier le bouton lui-même ne déclenche rien : la chaîne n'a pas bougé.
cas(
  'Modifier le bouton seul le fige',
  recale(
    { straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 16 },
    { straddleBoutonMontant: 50 }
  ),
  { straddleBouton: true, straddleAmounts: [8], straddleBoutonMontant: 50 }
);
// ...jusqu'au prochain changement de la chaîne, qui le réaligne. C'est le prix assumé.
cas(
  'Et la chaîne le défige au coup d\'après',
  recale(
    { straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 50 },
    { straddleAmounts: [10] }
  ),
  { straddleBouton: true, straddleAmounts: [10], straddleBoutonMontant: 20 }
);
// Changer le nombre déplace le bouton d'un rang : son ancien montant ne veut plus rien dire.
cas(
  'Triple → Double repropose le bouton',
  recale(
    { straddleCount: 3, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 32 },
    { straddleCount: 2 }
  ),
  { straddleBouton: true, straddleAmounts: [8], straddleBoutonMontant: 16 }
);
// Allumer l'interrupteur prend le dernier maillon à la chaîne et repropose depuis ce qui reste.
cas(
  'Allumer le bouton raccourcit la chaîne et propose',
  recale({ straddleCount: 2, straddleAmounts: [8, 16] }, { straddleBouton: true }),
  { straddleBouton: true, straddleAmounts: [8], straddleBoutonMontant: 16 }
);
cas(
  'L\'éteindre rend son maillon à la chaîne',
  recale({ straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 16 }, { straddleBouton: false }),
  { straddleBouton: false, straddleAmounts: [8, 16], straddleBoutonMontant: 16 }
);
// Une table trop courte éteint le bouton POUR DE BON, et la chaîne reprend son maillon.
cas(
  'Passer à 4 joueurs en Triple éteint le bouton',
  recale(
    { straddleCount: 3, straddleAmounts: [8, 16], straddleBouton: true, straddleBoutonMontant: 32 },
    { numPlayers: 4 }
  ),
  { straddleBouton: false, straddleAmounts: [8, 16, 32], straddleBoutonMontant: 32 }
);
// Un changement étranger au straddle ne doit RIEN toucher — sans quoi corriger une main déclarerait
// le straddle modifié pour un lieu ou un tapis.
cas(
  'Un changement sans rapport ne bouge rien',
  recale(
    { straddleCount: 2, straddleAmounts: [8], straddleBouton: true, straddleBoutonMontant: 50 },
    { numPlayers: 9 }
  ),
  { straddleBouton: true, straddleAmounts: [8], straddleBoutonMontant: 50 }
);

console.log('\n── 4. Les libellés de siège ──');

const seats6 = buildSeats(6, 'BTN', 800);
const act = (seatId, amount, order) => ({ id: `s${order}`, street: 'preflop', seatId, type: 'post-straddle', amount, order });
const libelles = (actions) => seats6.map((s) => straddleSeatLabel(seats6, actions, s.id));

cas(
  'Sans straddle : les positions ne bougent pas',
  libelles([]),
  ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
);
cas(
  'Straddle UTG seul : UTG devient « Straddle », le reste ne bouge pas',
  libelles([act('s-utg', 8, 1)]),
  ['Straddle', 'HJ', 'CO', 'BTN', 'SB', 'BB']
);
// LE CŒUR DU CORRECTIF : le bouton ne fait pas partie de la chaîne, donc le HJ reste HJ.
cas(
  'UTG + bouton : le bouton se nomme à part, sans décaler le HJ',
  libelles([act('s-utg', 8, 1), act('s-btn', 16, 2)]),
  ['Straddle', 'HJ', 'CO', 'BTN straddle', 'SB', 'BB']
);
cas(
  'Bouton seul : personne d\'autre ne change de nom',
  libelles([act('s-btn', 16, 1)]),
  ['UTG', 'HJ', 'CO', 'BTN straddle', 'SB', 'BB']
);
cas(
  'Chaîne de 2 + bouton',
  libelles([act('s-utg', 8, 1), act('s-hj', 16, 2), act('s-btn', 32, 3)]),
  ['Straddle', 'Double straddle', 'CO', 'BTN straddle', 'SB', 'BB']
);
// Non-régression : une chaîne pure garde exactement les libellés d'avant le BTN straddle.
const seats9 = buildSeats(9, 'BTN', 800);
cas(
  'Table de 9, chaîne de 2 : les noms UTG se décalent comme avant',
  seats9.map((s) => straddleSeatLabel(seats9, [act('s-utg', 8, 1), act('s-utg1', 16, 2)], s.id)),
  ['Straddle', 'Double straddle', 'UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
);
cas('chainStraddleCount ignore le bouton', chainStraddleCount(seats6, [act('s-utg', 8, 1), act('s-btn', 16, 2)]), 1);

console.log('\n── 5. Aller-retour d\'une main publiée ──');

// Une main réellement postée par le créateur : blindes 2/4, straddle UTG 8, BTN straddle 16.
const handAvecBouton = {
  id: 'h1',
  variant: 'nlhe',
  gameType: 'cash',
  blinds: { sb: 2, bb: 4 },
  effectiveStack: 800,
  visibility: 'public',
  seats: seats6,
  board: {},
  actions: [
    { id: 'blind-sb', street: 'preflop', seatId: 's-sb', type: 'post-sb', amount: 2, order: 1 },
    { id: 'blind-bb', street: 'preflop', seatId: 's-bb', type: 'post-bb', amount: 4, order: 2 },
    { id: 'straddle-utg', street: 'preflop', seatId: 's-utg', type: 'post-straddle', amount: 8, order: 3 },
    { id: 'straddle-btn', street: 'preflop', seatId: 's-btn', type: 'post-straddle', amount: 16, order: 4 },
    { id: 'preflop-5', street: 'preflop', seatId: 's-sb', type: 'fold', order: 5 },
    { id: 'preflop-6', street: 'preflop', seatId: 's-bb', type: 'fold', order: 6 },
    { id: 'preflop-7', street: 'preflop', seatId: 's-hj', type: 'fold', order: 7 },
    { id: 'preflop-8', street: 'preflop', seatId: 's-co', type: 'fold', order: 8 },
    { id: 'preflop-9', street: 'preflop', seatId: 's-utg', type: 'fold', order: 9 },
  ],
};
const post = (hand) => ({ id: 'p1', authorId: 'u1', authorName: 'V', createdAt: '', title: 't', visibility: 'public', hand });

const relu = postToSeed(post(handAvecBouton)).context;
cas('straddleCount compte TOUS les straddles', relu.straddleCount, 2);
cas('les montants relus ne sont que ceux de la chaîne', relu.straddleAmounts, [8]);
cas('straddleBouton retrouvé', relu.straddleBouton, true);
cas('Montant du bouton retrouvé', relu.straddleBoutonMontant, 16);
// Et le réglage relu doit reposter EXACTEMENT les mêmes straddles, sinon corriger une main la
// déplacerait de siège en silence.
cas(
  'Reposter le réglage relu redonne la même main',
  resume(straddlesAPoster({ ...relu, numPlayers: 6 })),
  ['UTG@8', 'BTN*16']
);

// Non-régression : une main d'AVANT le BTN straddle (double straddle classique) se relit à
// l'identique, sans jamais activer le bouton.
const handChainePure = {
  ...handAvecBouton,
  actions: [
    handAvecBouton.actions[0],
    handAvecBouton.actions[1],
    { id: 'straddle-utg', street: 'preflop', seatId: 's-utg', type: 'post-straddle', amount: 8, order: 3 },
    { id: 'straddle-hj', street: 'preflop', seatId: 's-hj', type: 'post-straddle', amount: 16, order: 4 },
    { id: 'preflop-5', street: 'preflop', seatId: 's-co', type: 'fold', order: 5 },
  ],
};
const reluChaine = postToSeed(post(handChainePure)).context;
cas(
  'Main d\'avant le BTN straddle : chaîne pure, bouton éteint',
  [reluChaine.straddleCount, reluChaine.straddleAmounts, reluChaine.straddleBouton],
  [2, [8, 16], false]
);
cas(
  'Reposter une chaîne pure redonne la chaîne',
  resume(straddlesAPoster({ ...reluChaine, numPlayers: 6 })),
  ['UTG@8', 'HJ@16']
);

console.log('\n── 6. L\'ordre de parole préflop ──');

// Rien n'a été écrit pour ça : le créateur passe le DERNIER straddleur à `firstToActAfterSeatId`,
// et la rotation existante fait repartir la parole juste après lui. Un straddle au bouton ouvre
// donc à la SB et fait parler le bouton en dernier, sans une ligne de code d'ordre.
const ordre = (afterSeatId) =>
  (afterSeatId ? getActingOrderAfter(seats6, 'preflop', afterSeatId) : getActingOrder(seats6, 'preflop')).map((s) => s.position);

cas('Sans straddle : on ouvre à l\'UTG', ordre(null), ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
cas('Straddle UTG : on ouvre au HJ, l\'UTG parle en dernier', ordre('s-utg'), ['HJ', 'CO', 'BTN', 'SB', 'BB', 'UTG']);
cas(
  'BTN straddle : on ouvre à la SB, le bouton parle en dernier',
  ordre('s-btn'),
  ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']
);

console.log(ko === 0 ? '\n✅ Tout passe.\n' : `\n❌ ${ko} cas en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
