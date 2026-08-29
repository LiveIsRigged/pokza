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

const { straddlesAPoster, boutonPossible, longueurChaine, montantBoutonPropose } = require('./cm/creator/straddle.js');
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
  straddleAmount: 0,
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
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmount: 8 }))),
  ['UTG@8']
);
cas(
  'Simple AVEC bouton → le bouton seul, la chaîne est vide',
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmount: 8, straddleBouton: true, straddleBoutonMontant: 8 }))),
  ['BTN*8']
);
cas(
  'Double sans bouton → UTG puis HJ, montant doublé',
  resume(straddlesAPoster(ctx({ straddleCount: 2, straddleAmount: 8 }))),
  ['UTG@8', 'HJ@16']
);
// L'EXEMPLE DE VICTOR : 2/4, straddle UTG 8, straddle BTN 16.
cas(
  "Double AVEC bouton → UTG puis le bouton (l'exemple 2/4 · UTG 8 · BTN 16)",
  resume(straddlesAPoster(ctx({ straddleCount: 2, straddleAmount: 8, straddleBouton: true, straddleBoutonMontant: 16 }))),
  ['UTG@8', 'BTN*16']
);
cas(
  'Triple sans bouton → UTG, HJ, CO',
  resume(straddlesAPoster(ctx({ straddleCount: 3, straddleAmount: 8 }))),
  ['UTG@8', 'HJ@16', 'CO@32']
);
cas(
  'Triple AVEC bouton → UTG, HJ, puis le bouton (toujours TROIS straddles)',
  resume(straddlesAPoster(ctx({ straddleCount: 3, straddleAmount: 8, straddleBouton: true, straddleBoutonMontant: 32 }))),
  ['UTG@8', 'HJ@16', 'BTN*32']
);
// Le bouton est posté EN DERNIER : c'est ce qui fait que la parole reprend après lui, donc à la SB.
cas(
  'Le straddle du bouton est toujours le dernier posté',
  straddlesAPoster(ctx({ straddleCount: 3, straddleAmount: 8, straddleBouton: true, straddleBoutonMontant: 32 })).at(-1).bouton,
  true
);
cas('Pas de straddle en tournoi', resume(straddlesAPoster(ctx({ gameType: 'tournament', straddleCount: 2, straddleAmount: 8 }))), []);
cas('Pas de straddle en bomb pot', resume(straddlesAPoster(ctx({ bombPot: true, straddleCount: 2, straddleAmount: 8 }))), []);
cas(
  'Un montant à 0 ne poste rien',
  resume(straddlesAPoster(ctx({ straddleCount: 1, straddleAmount: 0, straddleBouton: true, straddleBoutonMontant: 0 }))),
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
  resume(straddlesAPoster(ctx({ numPlayers: 4, straddleCount: 2, straddleAmount: 8, straddleBouton: true, straddleBoutonMontant: 16 }))),
  ['CO@8', 'BTN@16']
);
cas('Longueur de chaîne, Double + bouton', longueurChaine(ctx({ straddleCount: 2, straddleBouton: true })), 1);
cas('Longueur de chaîne, Double sans bouton', longueurChaine(ctx({ straddleCount: 2 })), 2);

console.log('\n── 3. Le montant proposé au bouton ──');

// 2x la BB quand la chaîne est vide, 2x le dernier straddle de la chaîne sinon.
cas('Simple + bouton → 2x la BB', montantBoutonPropose(ctx({ straddleCount: 1, bb: 4 })), 8);
cas('Double + bouton → 2x le straddle UTG', montantBoutonPropose(ctx({ straddleCount: 2, straddleAmount: 8 })), 16);
cas('Triple + bouton → 2x le double straddle', montantBoutonPropose(ctx({ straddleCount: 3, straddleAmount: 8 })), 32);

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
cas('straddleAmount ne lit que la chaîne', relu.straddleAmount, 8);
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
  [reluChaine.straddleCount, reluChaine.straddleAmount, reluChaine.straddleBouton],
  [2, 8, false]
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
