// Reprendre les joueurs de la dernière table.
// ──────────────────────────────────────────
// La contrainte de Victor (01/09/2026) : la reprise n'est JAMAIS automatique, parce qu'un nom faux
// est plausible et ne se corrige jamais. Ce script tient les quatre endroits où cette promesse peut
// se perdre sans qu'aucun écran ne change d'apparence :
//
//   1. ON NE MÉMORISE QUE CE QU'ON AFFICHE. Un nom vide, un nom à une place qui n'existe pas sur
//      cette table, un nom caché sous le héros : aucun des trois n'a de joueur derrière lui. Les
//      garder ferait ressortir, une main plus tard, quelqu'un que l'auteur croyait effacé.
//   2. LA REPRISE EST UN TOUT. Les gens ET la place du héros reviennent ensemble ; ne reprendre que
//      les noms rangerait quelqu'un sous le héros, stocké mais invisible.
//   3. CE QUI NE RENTRE PAS EST DIT. Une table plus courte perd des sièges — les joueurs qui s'y
//      trouvaient doivent ressortir dans `oublies`, jamais s'évaporer.
//   4. UN STOCKAGE DOUTEUX REND `null`, jamais un formulaire à moitié rempli.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/derniereTable.ts pokza-app/src/creator/positions.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-derniere-table.js

const {
  joueursNommes,
  tableDepuisContexte,
  resumeDesJoueurs,
  reprendreTable,
  validerTable,
} = require('./cm/creator/derniereTable.js');
const { buildSeats } = require('./cm/creator/positions.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const QUAND = '2026-09-01T18:00:00.000Z';

const ctx = (patch) => ({
  gameType: 'cash',
  variant: 'nlhe',
  bombPot: false,
  bombAnte: 0,
  doubleBoard: false,
  sb: 2,
  bb: 5,
  effectiveStack: 500,
  numPlayers: 6,
  heroPosition: 'CO',
  anteType: 'none',
  ante: 0,
  straddleCount: 0,
  straddleAmounts: [],
  straddleBouton: false,
  straddleBoutonMontant: 0,
  currency: 'EUR',
  ...patch,
});

const table = (c) =>
  buildSeats(c.numPlayers, c.heroPosition, c.effectiveStack, c.opponentNames, c.seatStacks, c.heroName).map(
    (s) => `${s.position}=${s.playerName ?? (s.isHero ? 'Hero' : '·')}/${s.startingStack}`
  );

const BASE = ctx({
  location: '  Aviation Club  ',
  heroName: 'Victor',
  opponentNames: { UTG: 'Anne', HJ: 'Marc', BTN: 'Léa' },
  seatStacks: { CO: 900, BTN: 250 },
});

console.log('\n── 1. Ce qu\'on mémorise, et ce qu\'on laisse ──');

const memo = tableDepuisContexte(BASE, QUAND);
cas('Les trois adversaires nommés', memo.opponentNames, { UTG: 'Anne', HJ: 'Marc', BTN: 'Léa' });
cas('Les tapis, celui du héros compris', memo.seatStacks, { CO: 900, BTN: 250 });
cas('Le lieu, débarrassé de ses espaces', memo.lieu, 'Aviation Club');
cas('La place du héros et la taille de table', [memo.heroPosition, memo.numPlayers], ['CO', 6]);

cas('Aucun adversaire nommé → rien à mémoriser', tableDepuisContexte(ctx({ heroName: 'Victor' }), QUAND), null);
cas(
  'Que des noms vides → rien à mémoriser',
  tableDepuisContexte(ctx({ opponentNames: { UTG: '', HJ: '   ' } }), QUAND),
  null
);
cas(
  'Le nom caché sous le héros n\'est pas mémorisé',
  tableDepuisContexte(ctx({ heroPosition: 'CO', opponentNames: { CO: 'Tom', HJ: 'Marc' } }), QUAND).opponentNames,
  { HJ: 'Marc' }
);
cas(
  'Un nom à une place absente de la table n\'est pas mémorisé',
  tableDepuisContexte(ctx({ numPlayers: 6, opponentNames: { LJ: 'Zoé', HJ: 'Marc' } }), QUAND).opponentNames,
  { HJ: 'Marc' }
);
cas('Pas de lieu → pas de champ lieu', tableDepuisContexte(ctx({ opponentNames: { HJ: 'Marc' } }), QUAND).lieu, undefined);

console.log('\n── 2. Ce que la pastille annonce ──');

cas('Trois joueurs tiennent en entier', resumeDesJoueurs(memo), 'Anne, Marc, Léa');
cas(
  'Six joueurs : trois noms et un compte',
  resumeDesJoueurs(
    tableDepuisContexte(
      ctx({ numPlayers: 7, heroPosition: 'CO', opponentNames: { UTG: 'Anne', UTG1: 'Marc', HJ: 'Léa', BTN: 'Tom', SB: 'Zoé', BB: 'Paul' } }),
      QUAND
    )
  ),
  'Anne, Marc, Léa +3'
);
cas('Les noms sont dans l\'ordre des sièges', resumeDesJoueurs(memo, 1), 'Anne +2');

console.log('\n── 3. La reprise ──');

// LE CAS QUI COMPTE : on repart d'un formulaire vierge, on reprend, et la table rendue doit être
// exactement celle qu'on avait quittée. C'est l'aller-retour complet, pas une comparaison de champs.
const vierge = ctx({ heroPosition: 'UTG', heroName: 'Victor' });
const reprise = reprendreTable(vierge, memo);
cas('Aller-retour : la table reprise est celle qu\'on avait quittée', table(reprise.context), table(BASE));
cas('Personne n\'est resté sur le carreau', reprise.oublies, []);
cas('La place du héros est revenue avec les gens', reprise.context.heroPosition, 'CO');

// Le nombre de joueurs choisi par l'auteur l'emporte : c'est un choix structurel qu'il vient
// peut-être de faire exprès, et la reprise parle des gens.
const grande = ctx({ numPlayers: 9, heroPosition: 'BTN' });
const surGrande = reprendreTable(grande, memo);
cas('Le nombre de joueurs de l\'auteur n\'est pas écrasé', surGrande.context.numPlayers, 9);
cas('6 → 9 : tout le monde retrouve un siège', surGrande.oublies, []);
cas(
  '6 → 9 : les places conservent leurs occupants',
  table(surGrande.context).filter((l) => !l.includes('=·/')),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=Hero/900', 'BTN=Léa/250']
);

// Table de 8 vers table de 6 : UTG1 et LJ n'existent plus.
const memo8 = tableDepuisContexte(
  ctx({
    numPlayers: 8,
    heroPosition: 'CO',
    opponentNames: { UTG: 'Anne', UTG1: 'Bob', LJ: 'Chloé', HJ: 'Marc', BTN: 'Léa' },
  }),
  QUAND
);
const versSix = reprendreTable(ctx({ numPlayers: 6, heroPosition: 'UTG' }), memo8);
cas('8 → 6 : les deux sièges perdus sont NOMMÉS, pas évaporés', versSix.oublies, ['Bob', 'Chloé']);
cas('8 → 6 : les autres sont bien assis', versSix.context.opponentNames, { UTG: 'Anne', HJ: 'Marc', BTN: 'Léa' });

// La place du héros n'existe pas sur la table courante (il était en LJ à 8) : elle ne revient pas,
// et celui qui aurait atterri sous lui est signalé au lieu d'être caché.
const memoLJ = tableDepuisContexte(
  ctx({ numPlayers: 8, heroPosition: 'LJ', opponentNames: { HJ: 'Marc', CO: 'Léa' } }),
  QUAND
);
const sousLeHeros = reprendreTable(ctx({ numPlayers: 6, heroPosition: 'CO' }), memoLJ);
cas('La place du héros ne rentre pas : il ne bouge pas', sousLeHeros.context.heroPosition, 'CO');
cas('… et celui qui tomberait sous lui est signalé', sousLeHeros.oublies, ['Léa']);
cas('… et n\'est pas rangé en douce', sousLeHeros.context.opponentNames, { HJ: 'Marc' });

console.log('\n── 4. Un stockage douteux ──');

cas('null', validerTable(null), null);
cas('Un tableau', validerTable([]), null);
cas('Sans date', validerTable({ numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: 'Marc' } }), null);
cas('Date illisible', validerTable({ quand: 'hier', numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: 'M' } }), null);
cas('Table de 11 joueurs', validerTable({ quand: QUAND, numPlayers: 11, heroPosition: 'CO', opponentNames: { HJ: 'M' } }), null);
cas(
  'Place du héros absente de la table',
  validerTable({ quand: QUAND, numPlayers: 6, heroPosition: 'LJ', opponentNames: { HJ: 'M' } }),
  null
);
cas('Aucun nom exploitable', validerTable({ quand: QUAND, numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: '  ' } }), null);
cas(
  'Un tapis absurde est jeté, la table reste bonne',
  validerTable({ quand: QUAND, numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: 'Marc' }, seatStacks: { HJ: -3, BTN: 250 } })
    .seatStacks,
  { BTN: 250 }
);
cas('Une table saine se relit à l\'identique', validerTable(JSON.parse(JSON.stringify(memo))), memo);

console.log('\n── 5. Le filtre, isolé ──');

cas(
  'joueursNommes rend les places dans l\'ordre de parole',
  joueursNommes(6, 'CO', { BB: 'Zoé', UTG: 'Anne', HJ: 'Marc' }).map((j) => j.place),
  ['UTG', 'HJ', 'BB']
);
cas('joueursNommes ignore la place du héros', joueursNommes(6, 'HJ', { HJ: 'Tom' }), []);

console.log(ko === 0 ? '\n✅ Tout passe.\n' : `\n❌ ${ko} cas en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
