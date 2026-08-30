// « Arrêter la main ici » — une main sans fin.
// ───────────────────────────────────────────
// L'auteur coupe son récit sur une décision (« Hero check, vilain mise 200, à toi de voir »). Trois
// choses doivent alors tenir, et aucune ne se voit à la relecture du code :
//
//   1. LE PIÈGE DE LA RIVER. `determinePotAwards` traite un joueur non couché SANS cartes saisies
//      comme mucké, donc perdant. C'est juste sur une main finie, et faux ici : sur une main
//      arrêtée à la river — board complet, cartes de Hero connues, celles du vilain jamais
//      demandées — Hero restait seul « contendant » et raflait tout le pot. Coupée plus tôt le
//      board est incomplet et la fonction renonçait d'elle-même : le piège ne se voyait donc QUE
//      là. Chaque cas a ici son témoin sans la marque, sans quoi le test ne prouverait rien.
//   2. L'ÉQUITÉ NE DOIT PAS RÉPONDRE À LA QUESTION. « Hero 62 % » sous une main qui demande « je
//      paye ou pas ? », c'est donner la réponse à la place des lecteurs.
//   3. LE RETOUR EN ARRIÈRE REND LA MAIN. La marque ne vit que sur l'état complet ; tout instantané
//      d'étape est « main en cours ». Sans ça, un auteur qui s'arrête, se ravise et joue la main
//      jusqu'au bout publierait quand même une main marquée comme arrêtée.
//   Et par-dessus : pas d'abattage sur une main arrêtée — personne n'a montré, le coup n'y est pas
//   allé. La feuille « Corriger cette main » ne doit donc pas proposer cette ligne.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/handEngine.ts pokza-app/src/creator/rehydrate.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-arret-main.js

const { determinePotAwards, computeHandState, totalReplaySteps } = require('./cm/engine/handEngine.js');
const { postToSeed, seedHistory, seedStart, etapesCorrigibles } = require('./cm/creator/rehydrate.js');

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

// Table de 6, Hero au bouton. Les cartes du vilain sont laissées de côté par défaut : c'est
// exactement ce que produit l'assistant sur une main arrêtée, puisqu'il en saute l'abattage.
const sieges = (cartesVilain) => [
  { id: 's-utg', position: 'UTG', isHero: false, startingStack: 800 },
  { id: 's-hj', position: 'HJ', isHero: false, startingStack: 800 },
  { id: 's-co', position: 'CO', isHero: false, startingStack: 800 },
  { id: 's-btn', position: 'BTN', isHero: true, startingStack: 800, holeCards: [c('Qs'), c('Qh')] },
  { id: 's-sb', position: 'SB', isHero: false, startingStack: 800 },
  { id: 's-bb', position: 'BB', isHero: false, startingStack: 800,
    ...(cartesVilain ? { holeCards: [c('Ad'), c('Kd')] } : {}) },
];

// Préflop + flop + turn joués normalement ; la river s'ouvre sur une mise du vilain, et s'arrête là.
const jusquALaRiver = () => {
  reset();
  return [
    a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
    a('preflop', 's-utg', 'fold'), a('preflop', 's-hj', 'fold'), a('preflop', 's-co', 'fold'),
    a('preflop', 's-btn', 'raise', 15), a('preflop', 's-sb', 'fold'), a('preflop', 's-bb', 'call', 15),
    a('flop', 's-bb', 'check'), a('flop', 's-btn', 'bet', 20), a('flop', 's-bb', 'call', 20),
    a('turn', 's-bb', 'check'), a('turn', 's-btn', 'bet', 55), a('turn', 's-bb', 'call', 55),
    a('river', 's-bb', 'bet', 200),
  ];
};

// La même chose coupée un cran plus tôt : le turn s'ouvre sur une mise, et la river n'existe pas.
const jusquAuTurn = () => {
  reset();
  return [
    a('preflop', 's-sb', 'post-sb', 2), a('preflop', 's-bb', 'post-bb', 5),
    a('preflop', 's-utg', 'fold'), a('preflop', 's-hj', 'fold'), a('preflop', 's-co', 'fold'),
    a('preflop', 's-btn', 'raise', 15), a('preflop', 's-sb', 'fold'), a('preflop', 's-bb', 'call', 15),
    a('flop', 's-bb', 'check'), a('flop', 's-btn', 'bet', 20), a('flop', 's-bb', 'call', 20),
    a('turn', 's-bb', 'bet', 60),
  ];
};

const mainRiver = (extra = {}, cartesVilain = false) => ({
  id: 'h', variant: 'nlhe', gameType: 'cash', blinds: { sb: 2, bb: 5 },
  effectiveStack: 800, visibility: 'public', seats: sieges(cartesVilain),
  board: { flop: [c('Qd'), c('7h'), c('2s')], turn: c('Kc'), river: c('3d') },
  actions: jusquALaRiver(), ...extra,
});

const mainTurn = (extra = {}, cartesVilain = false) => ({
  id: 'h', variant: 'nlhe', gameType: 'cash', blinds: { sb: 2, bb: 5 },
  effectiveStack: 800, visibility: 'public', seats: sieges(cartesVilain),
  board: { flop: [c('Qd'), c('7h'), c('2s')], turn: c('Kc') },
  actions: jusquAuTurn(), ...extra,
});

const post = (hand) => ({
  id: 'p', authorId: 'u', authorName: 'Victor', createdAt: '2026-08-30T12:00:00Z',
  title: 'Je paye ?', hand, likeCount: 0, commentCount: 0, visibility: 'public',
});

// ── 1. Le piège de la river : sans la marque, Hero rafle un pot qu'il a peut-être jeté ──────────
{
  const temoin = determinePotAwards(mainRiver());
  cas('TÉMOIN — sans la marque, la river désigne un vainqueur', temoin.length > 0, true);
  cas('TÉMOIN — et ce vainqueur est Hero, seul « contendant »', temoin.map((x) => x.seatId), ['s-btn']);
  cas('TÉMOIN — à qui elle donne TOUT le pot', temoin[0] && temoin[0].fraction, 1);

  cas('arrêtée à la river : aucun vainqueur', determinePotAwards(mainRiver({ stoppedAtSeatId: 's-btn' })), []);
}

// ── 2. Les autres streets : déjà sans vainqueur, elles doivent le rester ────────────────────────
{
  cas('TÉMOIN — sans la marque, le turn ne conclut rien (board incomplet)', determinePotAwards(mainTurn()), []);
  cas('arrêtée au turn : aucun vainqueur', determinePotAwards(mainTurn({ stoppedAtSeatId: 's-btn' })), []);
}

// ── 3. Une main normale n'est pas touchée ───────────────────────────────────────────────────────
{
  // Le vilain suit la mise de la river : abattage classique, cartes des deux côtés, Hero a le set.
  reset();
  const finie = {
    ...mainRiver({}, true),
    actions: [...jusquALaRiver(), a('river', 's-btn', 'call', 200)],
  };
  const awards = determinePotAwards(finie);
  cas('main finie normalement : Hero gagne toujours', awards.map((x) => x.seatId), ['s-btn']);
  cas('main finie : et il prend tout le pot', awards[0] && awards[0].fraction, 1);
}

// ── 4. L'équité ne doit jamais répondre à la question ───────────────────────────────────────────
{
  // Situation artificielle — l'assistant ne saisit pas les cartes du vilain sur une main arrêtée
  // (l'abattage est sauté). Mais rien dans le type ne l'interdit, et une correction pourrait un
  // jour l'y remettre : le garde-fou doit tenir même dans ce cas.
  const ouverte = mainTurn({}, true);
  const etatOuvert = computeHandState(ouverte, totalReplaySteps(ouverte));
  cas('TÉMOIN — sans la marque, l\'équité se calcule (ou se met en attente)',
      etatOuvert.equities !== null || etatOuvert.equityPending !== null, true);

  const arretee = mainTurn({ stoppedAtSeatId: 's-btn' }, true);
  const etat = computeHandState(arretee, totalReplaySteps(arretee));
  cas('arrêtée : aucune équité affichée', etat.equities, null);
  cas('arrêtée : et aucune équité en attente non plus', etat.equityPending, null);
  cas('arrêtée : toujours aucun vainqueur au dernier cran', etat.winningSeatIds, []);
  // Ce que le lecteur voit : le pot entier au centre, et la mise du vilain devant lui.
  // 2 de petite blinde couchée (jetons morts, mais au pot), 15+15 préflop, 20+20 au flop, 60 au turn.
  cas('arrêtée : le pot reste au centre', etat.potTotal, 2 + 15 + 15 + 20 + 20 + 60);
  cas('arrêtée : la mise du vilain reste affichée devant lui', etat.streetContribution['s-bb'], 60);
}

// ── 5. Pas d'abattage sur une main arrêtée ──────────────────────────────────────────────────────
{
  const libelles = (hand) => etapesCorrigibles(post(hand)).map((e) => e.label);
  cas('TÉMOIN — une main non arrêtée où le vilain est debout propose l\'abattage',
      libelles(mainRiver()), ['La table', 'Tes cartes', 'Préflop', 'Flop', 'Turn', 'River', "L'abattage"]);
  cas('arrêtée : la feuille de correction ne propose pas l\'abattage',
      libelles(mainRiver({ stoppedAtSeatId: 's-btn' })),
      ['La table', 'Tes cartes', 'Préflop', 'Flop', 'Turn', 'River']);
  cas('arrêtée au turn : la feuille s\'arrête au turn',
      libelles(mainTurn({ stoppedAtSeatId: 's-btn' })),
      ['La table', 'Tes cartes', 'Préflop', 'Flop', 'Turn']);
}

// ── 6. L'aller-retour de la correction ──────────────────────────────────────────────────────────
{
  const seed = postToSeed(post(mainRiver({ stoppedAtSeatId: 's-btn' })));
  cas('postToSeed relit la marque', seed.stoppedAtSeatId, 's-btn');
  cas('une main finie revient sans marque', postToSeed(post(mainRiver())).stoppedAtSeatId, null);

  // LE point : chaque instantané d'étape est « main en cours ». C'est ce qui rend la main à son
  // déroulé normal dès qu'on revient sur ses pas.
  cas('aucun instantané d\'étape ne porte la marque',
      seedHistory(seed).map((s) => s.stoppedAtSeatId), [null, null, null, null, null, null]);

  // L'état COMPLET, lui, la porte : entrer dans une étape pour corriger un nom ne « débloque » pas
  // la main, elle reste arrêtée si on republie tel quel.
  cas('l\'état complet garde la marque', seedStart(seed).etat.stoppedAtSeatId, 's-btn');
  const depuisTurn = seedStart(seed, 'street-turn');
  cas('reprise au turn : l\'état posé garde la marque', depuisTurn.etat.stoppedAtSeatId, 's-btn');
  cas('reprise au turn : mais « refaire les mises » la rend', depuisTurn.instantane.stoppedAtSeatId, null);
}

console.log(ko === 0 ? '\n🎉 tout passe' : `\n${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
