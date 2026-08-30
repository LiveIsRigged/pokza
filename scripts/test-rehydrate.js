// Non-régression de la reprise d'une main publiée (« Corriger la main »).
// ─────────────────────────────────────────────────────────────────────
// `postToSeed` fait l'INVERSE de `finalize()` : il redémonte un `Hand` en réglages d'étapes. Un
// aller-retour approximatif ne se voit pas à l'œil — la main se rouvre, l'écran a l'air juste, et
// c'est le pot de départ ou le tapis affiché qui est faux. Ce script mesure les endroits où
// l'inverse n'est PAS déductible du seul `Hand` :
//   1. les sièges reconstruits doivent être IDENTIQUES aux sièges stockés — c'est ce qui rend les
//      `seatId` des actions encore valides après un retour jusqu'à l'étape 1 ;
//   2. l'ante : `blinds.ante` vaut pareil qu'il soit posté par la seule BB ou par tout le monde ;
//      seul le NOMBRE de `post-ante` tranche, et se tromper double le pot de départ ;
//   3. le straddle ne vit que dans les actions, jamais dans `blinds` ;
//   4. un tapis égal au stack effectif ne doit pas devenir un « stack personnalisé » ;
//   5. les cartes du hero ne doivent pas atterrir dans les cartes révélées à l'abattage ;
//   6. la pile d'historique : l'instantané d'une street ne contient PAS le board de cette street.
//      C'est le piège central — poser le board « en avance » afficherait un tapis faux au retour,
//      et laisserait ressaisir une carte déjà distribuée.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/rehydrate.ts pokza-app/src/creator/positions.ts \
//     pokza-app/src/creator/straddle.ts pokza-app/src/engine/handEngine.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-rehydrate.js

const { postToSeed, seedHistory, seedStart, etapesCorrigibles } = require('./cm/creator/rehydrate.js');
const { buildSeats } = require('./cm/creator/positions.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const c = (s) => ({ rank: s[0], suit: s[1] });
let n = 0;
const a = (street, seatId, type, amount) => ({ id: `a${++n}`, street, seatId, type, amount, order: n });
const reset = () => { n = 0; };

// Table de 6, hero au bouton, un adversaire nommé et un tapis court : de quoi éprouver
// `opponentNames` et `seatStacks` en même temps.
const seats = [
  { id: 's-utg', position: 'UTG', isHero: false, startingStack: 800 },
  { id: 's-hj', position: 'HJ', isHero: false, startingStack: 800 },
  { id: 's-co', position: 'CO', isHero: false, startingStack: 320, playerName: 'Marc' },
  { id: 's-btn', position: 'BTN', isHero: true, startingStack: 800, playerName: 'Victor', holeCards: [c('Qs'), c('Qh')] },
  { id: 's-sb', position: 'SB', isHero: false, startingStack: 800 },
  { id: 's-bb', position: 'BB', isHero: false, startingStack: 800, holeCards: [c('Ad'), c('Kd')] },
];

const actionsCompletes = () => {
  reset();
  return [
    a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
    a('preflop', 's-utg', 'fold'), a('preflop', 's-hj', 'fold'), a('preflop', 's-co', 'fold'),
    a('preflop', 's-btn', 'raise', 15), a('preflop', 's-sb', 'fold'), a('preflop', 's-bb', 'call', 15),
    a('flop', 's-bb', 'check'), a('flop', 's-btn', 'bet', 20), a('flop', 's-bb', 'call', 20),
    a('turn', 's-bb', 'check'), a('turn', 's-btn', 'bet', 55), a('turn', 's-bb', 'call', 55),
    a('river', 's-bb', 'bet', 730), a('river', 's-btn', 'call', 730),
  ];
};

const main = (extra = {}) => ({
  id: 'h', variant: 'nlhe', gameType: 'cash', blinds: { sb: 2, bb: 5 },
  effectiveStack: 800, visibility: 'public', seats,
  board: { flop: [c('Qd'), c('7h'), c('2s')], turn: c('Kc'), river: c('3d') },
  actions: actionsCompletes(),
  ...extra,
});

const post = (hand, extra = {}) => ({
  id: 'p', authorId: 'u', authorName: 'Victor', createdAt: '2026-08-21T12:00:00Z',
  title: 'Set de dames', hand, likeCount: 0, commentCount: 0, visibility: 'public',
  location: 'Aviation Club', buyIn: '500€', ...extra,
});

// ── 1. Les sièges refaits depuis le contexte sont les sièges d'origine ───────────────────────────
{
  const s = postToSeed(post(main()));
  const refaits = buildSeats(
    s.context.numPlayers, s.context.heroPosition, s.context.effectiveStack,
    s.context.opponentNames, s.context.seatStacks, s.context.heroName
  );
  // Les cartes fermées ne font pas partie de la table : elles se saisissent à l'étape suivante.
  cas('les sieges reconstruits sont identiques aux sieges stockes',
    refaits, seats.map(({ holeCards, ...reste }) => reste));
  cas('seul le tapis court passe en stack personnalise', s.context.seatStacks, { CO: 320 });
  cas('le nom du hero ne fuit pas dans les noms d adversaires', s.context.opponentNames, { CO: 'Marc' });
  cas('le nom du hero est repris a part', s.context.heroName, 'Victor');
  cas('les cartes du hero sont dans heroCards', s.heroCards, [c('Qs'), c('Qh')]);
  cas('et PAS dans les cartes revelees', Object.keys(s.revealedCards), ['s-bb']);
  cas('les couches sortent des sieges actifs', s.activeSeatIds, ['s-btn', 's-bb']);
  cas('le contexte du post remonte dans l etape 1',
    [s.context.location, s.context.buyIn], ['Aviation Club', '500€']);
  cas('le texte du post remonte dans l etape « Publier »', s.review.title, 'Set de dames');
}

// ── 2. L'ante : un seul poste = BB ante, plusieurs = ante par joueur ─────────────────────────────
{
  const bbAnte = main({
    blinds: { sb: 2, bb: 5, ante: 5 },
    actions: [{ id: 'x', street: 'preflop', seatId: 's-bb', type: 'post-ante', amount: 5, order: 0 },
              ...actionsCompletes()],
  });
  cas('un seul post-ante sur la BB = « BB ante »', postToSeed(post(bbAnte)).context.anteType, 'bb');

  const parJoueur = main({
    blinds: { sb: 2, bb: 5, ante: 1 },
    actions: [...seats.map((s, i) => ({ id: `x${i}`, street: 'preflop', seatId: s.id, type: 'post-ante', amount: 1, order: 0 })),
              ...actionsCompletes()],
  });
  const seed = postToSeed(post(parJoueur));
  cas('six post-ante = un ante par joueur', seed.context.anteType, 'per-player');
  cas('et son montant est repris', seed.context.ante, 1);

  cas('aucun post-ante = aucun ante', postToSeed(post(main())).context.anteType, 'none');
}

// ── 3. Le straddle ne vit que dans les actions ───────────────────────────────────────────────────
{
  reset();
  const avecStraddle = main({
    board: {},
    actions: [
      a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
      a('preflop', 's-utg', 'post-straddle', 10), a('preflop', 's-hj', 'post-straddle', 20),
      a('preflop', 's-btn', 'fold'),
    ],
  });
  const s = postToSeed(post(avecStraddle));
  cas('deux straddles comptes', s.context.straddleCount, 2);
  // Depuis que chaque straddle porte son propre montant, on les relit tels quels dans l ordre de
  // postage plutot que d en rededuire un montant de base double.
  cas('chaque straddle garde son montant', s.context.straddleAmounts, [10, 20]);
}

// ── 4. La pile d'historique ──────────────────────────────────────────────────────────────────────
{
  const s = postToSeed(post(main()));
  const h = seedHistory(s);
  cas('les etapes traversees, dans l ordre', h.map((x) => x.phase),
    ['context', 'holeCards', 'street-preflop', 'street-flop', 'street-turn', 'street-river', 'showdown']);

  const flop = h.find((x) => x.phase === 'street-flop');
  cas('l instantane du flop ne contient PAS le flop', flop.board, {});
  cas('mais bien toutes les actions preflop, blindes comprises',
    flop.actions.map((x) => x.id), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
  cas('et les sieges encore en jeu apres le preflop', flop.activeSeatIds, ['s-btn', 's-bb']);

  const turn = h.find((x) => x.phase === 'street-turn');
  cas('l instantane du turn a le flop mais pas le turn',
    [!!turn.board.flop, turn.board.turn ?? null], [true, null]);

  const river = h.find((x) => x.phase === 'street-river');
  cas('l instantane de la river a flop et turn, pas la river',
    [!!river.board.flop, !!river.board.turn, river.board.river ?? null], [true, true, null]);

  cas('l etape 1 n a aucun siege (ils sont construits en la quittant)', h[0].seats, []);
}

// ── 5. Une main qui s'arrête preflop n'a pas d'etape de flop ─────────────────────────────────────
{
  reset();
  const foldPreflop = main({
    board: {},
    actions: [
      a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
      a('preflop', 's-utg', 'fold'), a('preflop', 's-hj', 'fold'), a('preflop', 's-co', 'fold'),
      a('preflop', 's-btn', 'raise', 15), a('preflop', 's-sb', 'fold'), a('preflop', 's-bb', 'fold'),
    ],
  });
  const h = seedHistory(postToSeed(post(foldPreflop)));
  cas('pas d instantane de flop sur une main pliee preflop',
    h.map((x) => x.phase), ['context', 'holeCards', 'street-preflop']);
}

// ── 6. Bomb pot : pas de preflop, et l'ante devient la bombe ─────────────────────────────────────
{
  reset();
  const bomb = main({
    bombPot: true,
    blinds: { sb: 0, bb: 25 },
    board: { flop: [c('Qd'), c('7h'), c('2s')] },
    board2: { flop: [c('9c'), c('4h'), c('2d')] },
    actions: [
      ...seats.map((s, i) => ({ id: `b${i}`, street: 'preflop', seatId: s.id, type: 'post-ante', amount: 25, order: i })),
      // Tout le monde se couche sur la mise du bouton : sans ça, les joueurs qui ont posté la
      // bombe sans jamais agir restent « en jeu » et l'abattage s'ajoute — à raison.
      a('flop', 's-btn', 'bet', 50),
      a('flop', 's-sb', 'fold'), a('flop', 's-bb', 'fold'), a('flop', 's-utg', 'fold'),
      a('flop', 's-hj', 'fold'), a('flop', 's-co', 'fold'),
    ],
  });
  const s = postToSeed(post(bomb));
  cas('la bombe est reprise comme montant d ante', s.context.bombAnte, 25);
  cas('le double board est detecte', s.context.doubleBoard, true);
  cas('et la mecanique d ante classique reste eteinte', s.context.anteType, 'none');
  cas('pas d etape preflop en bomb pot',
    seedHistory(s).map((x) => x.phase), ['context', 'holeCards', 'street-flop']);
}

// ── 7. Reprendre a une etape choisie, plutot qu'a la publication ─────────────────────────────────
// Le createur ne sait AVANCER qu'en reconstruisant : quitter l'etape 1 remplace la liste d'actions
// par les seules blindes. Ouvrir « a l'etape 1 et derouler » reviendrait donc a retaper la main.
// D'ou le choix de l'etape AVANT d'entrer, qui se pose sur son instantane.
{
  // Depuis le chantier « corriger toutes les etapes », la feuille propose TOUTES les etapes jouees
  // et non plus les seules streets — et « Juste le texte » a disparu, redondant avec « Modifier le
  // post ». Le prix d'une correction ne se paie plus a l'entree mais a la SORTIE, selon ce qui a
  // reellement change (cf. `invalidation.ts`).
  cas('les etapes proposees sur une main complete',
    etapesCorrigibles(post(main())).map((e) => e.label),
    ['La table', 'Tes cartes', 'Préflop', 'Flop', 'Turn', 'River', "L'abattage"]);

  reset();
  const plieePreflop = main({
    board: {},
    actions: [
      a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
      a('preflop', 's-utg', 'fold'), a('preflop', 's-hj', 'fold'), a('preflop', 's-co', 'fold'),
      a('preflop', 's-btn', 'raise', 15), a('preflop', 's-sb', 'fold'), a('preflop', 's-bb', 'fold'),
    ],
  });
  cas('une main pliee preflop ne propose pas de flop a corriger',
    etapesCorrigibles(post(plieePreflop)).map((e) => e.label), ['La table', 'Tes cartes', 'Préflop']);

  const seed = postToSeed(post(main()));

  const parDefaut = seedStart(seed);
  cas('sans etape demandee, on ouvre sur la publication', parDefaut.phase, 'review');
  cas('et la main y est entiere', parDefaut.etat.actions.length, seed.actions.length);

  const auTurn = seedStart(seed, 'street-turn');
  cas('reprendre au turn ouvre bien au turn', auTurn.phase, 'street-turn');
  // DEUX ETATS, ET C'EST LE CŒUR DE LA CORRECTION PAR ETAPE. `etat` porte la main ENTIERE : c'est
  // ce qui permet de retoucher la carte du turn et de publier sans ressaisir la river. L'instantane
  // de l'etape, lui, porte l'etat tel qu'il etait AVANT ce que l'etape produit — c'est lui qu'on
  // reprend quand le changement invalide la suite.
  cas('la main ouverte au turn reste entiere', auTurn.etat.actions.length, seed.actions.length);
  cas('mais l instantane du turn s arrete a la fin du flop',
    [!!auTurn.instantane.board.flop, auTurn.instantane.board.turn ?? null], [true, null]);
  cas('et ses actions aussi',
    auTurn.instantane.actions.map((x) => x.id),
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11']);
  cas('et le « ‹ » peut encore redescendre les etapes d avant',
    auTurn.history.map((x) => x.phase),
    ['context', 'holeCards', 'street-preflop', 'street-flop']);

  // Le garde-fou : demander une etape que la main n'a pas jouee ne doit pas ouvrir un ecran vide.
  cas('une etape non jouee retombe sur la publication',
    seedStart(postToSeed(post(plieePreflop)), 'street-river').phase, 'review');
}

console.log(ko === 0 ? '\n🎉 tout passe' : `\n${ko} cas en échec`);
process.exit(ko === 0 ? 0 : 1);
