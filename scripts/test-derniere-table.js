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
const { buildSeats, POSITION_SETS } = require('./cm/creator/positions.js');
const { deplacerHero } = require('./cm/creator/deplacements.js');

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

console.log('\n── 3. La reprise : un VOISINAGE, pas des étiquettes ──');

/** Les gens dans l'ordre des sièges EN PARTANT DU HÉROS. Deux tables qui ont le même anneau ont
 *  exactement le même placement — quelles que soient les positions, qui ne sont que des étiquettes
 *  posées par le bouton. C'est la seule forme sous laquelle une reprise se juge. */
const anneau = (c) => {
  const places = POSITION_SETS[c.numPlayers];
  const h = places.indexOf(c.heroPosition);
  return places.map((_, k) => places[(h + k) % places.length])
    .map((p) => (p === c.heroPosition ? 'Hero' : c.opponentNames?.[p] ?? '·'));
};

// LE CAS DE VICTOR (01/09/2026), celui qui a fait réécrire cette fonction : héros au bouton, Éric
// au CO — donc juste à sa droite. Une main plus tard le héros est en BB : Éric doit être en SB,
// toujours juste à sa droite. Reprendre ses ANCIENNES positions le remettrait au CO, à trois sièges
// de là, et remettrait le héros au bouton alors qu'il vient de dire qu'il était en BB.
const memoEric = tableDepuisContexte(
  ctx({ numPlayers: 6, heroPosition: 'BTN', heroName: 'Victor', opponentNames: { CO: 'Eric' } }),
  QUAND
);
const chezEric = reprendreTable(ctx({ numPlayers: 6, heroPosition: 'BB' }), memoEric);
cas('Héros BTN + Éric CO, repris avec le héros en BB → Éric en SB', chezEric.context.opponentNames, { SB: 'Eric' });
cas('… et le héros ne retourne PAS au bouton', chezEric.context.heroPosition, 'BB');
cas('… le voisinage est le même des deux côtés', anneau(chezEric.context), anneau({ ...memoEric, opponentNames: memoEric.opponentNames }));

// Le même énoncé, mais tourné dans l'autre sens et sur trois joueurs nommés : Anne deux sièges
// avant le héros, Marc juste avant, Léa juste après. Ces trois écarts doivent survivre à n'importe
// quelle place de héros.
for (const place of ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']) {
  const r = reprendreTable(ctx({ numPlayers: 6, heroPosition: place }), memo);
  cas(`Héros en ${place} : le voisinage repris est intact`, anneau(r.context), ['Hero', 'Léa', '·', '·', 'Anne', 'Marc']);
}

cas('La place du héros n\'est JAMAIS écrasée', reprendreTable(ctx({ heroPosition: 'SB' }), memo).context.heroPosition, 'SB');
cas('Personne ne reste sur le carreau à taille égale', reprendreTable(ctx({ heroPosition: 'SB' }), memo).oublies, []);

// Les tapis suivent leur propriétaire, celui du héros compris : le sien vaut 900, celui de Léa 250,
// et Léa est toujours le siège juste après le héros.
const avecTapis = reprendreTable(ctx({ numPlayers: 6, heroPosition: 'UTG' }), memo);
cas(
  'Les tapis voyagent avec leur joueur, celui du héros compris',
  table(avecTapis.context).filter((l) => !/\/500$/.test(l)),
  ['UTG=Hero/900', 'HJ=Léa/250']
);

// Le nombre de joueurs choisi par l'auteur l'emporte : c'est un choix structurel qu'il vient
// peut-être de faire exprès, et la reprise parle des gens.
const surGrande = reprendreTable(ctx({ numPlayers: 9, heroPosition: 'BTN' }), memo);
cas('Le nombre de joueurs de l\'auteur n\'est pas écrasé', surGrande.context.numPlayers, 9);
cas('6 → 9 : tout le monde retrouve un siège', surGrande.oublies, []);
cas(
  '6 → 9 : les voisins restent voisins (la table s\'agrandit derrière eux)',
  anneau(surGrande.context),
  ['Hero', 'Léa', '·', '·', '·', '·', '·', 'Anne', 'Marc']
);

// Table de 8 vers table de 6 : deux sièges disparaissent, donc deux anciens voisins peuvent viser
// la même chaise. Le premier à parler s'assoit, l'autre est NOMMÉ.
const memo8 = tableDepuisContexte(
  ctx({
    numPlayers: 8,
    heroPosition: 'CO',
    opponentNames: { UTG: 'Anne', UTG1: 'Bob', LJ: 'Chloé', HJ: 'Marc', BTN: 'Léa' },
  }),
  QUAND
);
const versSix = reprendreTable(ctx({ numPlayers: 6, heroPosition: 'UTG' }), memo8);
cas('8 → 6 : le siège en trop est NOMMÉ, pas évaporé', versSix.oublies, ['Chloé']);
cas('8 → 6 : les voisins immédiats du héros sont préservés', anneau(versSix.context).slice(0, 2), ['Hero', 'Léa']);
cas('8 → 6 : et celui d\'avant aussi', anneau(versSix.context)[5], 'Marc');

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

console.log('\n── 5. L\'ordre des deux gestes ne change rien ──');

// REPRENDRE PUIS ANNONCER SA POSITION, OU L'INVERSE : les deux doivent donner exactement la même
// table. Sinon il existerait un bon ordre et un mauvais, et rien à l'écran ne le dirait — l'auteur
// découvrirait le mauvais en publiant une main où tout le monde est décalé d'un siège.
//
// Ce n'est pas une coïncidence, c'est la conséquence du modèle : la reprise pose chacun à son écart
// au héros, et déplacer le héros fait tourner tout le monde du même nombre de crans. Les deux
// opérations commutent parce qu'elles parlent toutes les deux d'écarts, jamais de positions.
for (const place of ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']) {
  const depart = ctx({ numPlayers: 6, heroPosition: 'BTN', heroName: 'Victor' });
  const placeDAbord = reprendreTable({ ...depart, heroPosition: place }, memo).context;
  const repriseDAbord = deplacerHero(reprendreTable(depart, memo).context, place);
  cas(`Héros en ${place} : les deux ordres donnent la même table`, table(repriseDAbord), table(placeDAbord));
}

console.log('\n── 6. Le filtre, isolé ──');

cas(
  'joueursNommes rend les places dans l\'ordre de parole',
  joueursNommes(6, 'CO', { BB: 'Zoé', UTG: 'Anne', HJ: 'Marc' }).map((j) => j.place),
  ['UTG', 'HJ', 'BB']
);
cas('joueursNommes ignore la place du héros', joueursNommes(6, 'HJ', { HJ: 'Tom' }), []);

console.log(ko === 0 ? '\n✅ Tout passe.\n' : `\n❌ ${ko} cas en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
