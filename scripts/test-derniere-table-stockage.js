// Le rangement sur disque des tables mémorisées.
// ─────────────────────────────────────────────
// C'est le maillon qu'aucun autre test ne touchait, et c'est celui qui alimente tout le reste : si
// l'écriture échoue en silence, la pastille de reprise n'apparaît jamais et personne ne saura
// pourquoi. Quatre choses à tenir :
//
//   1. UNE MAIN SANS ADVERSAIRE NOMMÉ N'ÉCRIT RIEN. Sinon la pastille proposerait de « reprendre »
//      une table vide, c'est-à-dire une promesse en l'air.
//   2. LA PLUS RÉCENTE EST EN TÊTE, et la liste est plafonnée. On range une liste là où l'écran n'en
//      lit qu'une, pour ne pas perdre ce qui y est déjà le jour d'une banque de tables par lieu.
//   3. UN STOCKAGE ABÎMÉ NE CASSE RIEN : ni JSON illisible, ni entrée corrompue en tête de liste.
//      La première entrée VALIDE est rendue, pas la première tout court.
//   4. UN DISQUE MUET N'INTERROMPT JAMAIS UNE PUBLICATION. C'est du pur confort : mieux vaut perdre
//      la mémoire d'une table que la main qu'on vient de raconter.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/derniereTableStockage.ts \
//     pokza-app/src/creator/derniereTable.ts pokza-app/src/creator/positions.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-derniere-table-stockage.js

const path = require('path');
const Module = require('module');

// Le module natif n'existe pas ici : on détourne sa résolution vers le faux disque, avant tout
// `require` du code testé. Rien d'autre n'est touché.
const FAUX = path.join(__dirname, 'faux-async-storage.js');
const resoudre = Module._resolveFilename;
Module._resolveFilename = function (demande, ...reste) {
  if (demande === '@react-native-async-storage/async-storage') return FAUX;
  return resoudre.call(this, demande, ...reste);
};

const disque = require(FAUX);
const { memoriserTable, chargerDerniereTable } = require('./cm/creator/derniereTableStockage.js');

const CLE = 'pokza.creator.dernieresTables.v1';

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const ctx = (patch) => ({
  gameType: 'cash', variant: 'nlhe', bombPot: false, bombAnte: 0, doubleBoard: false,
  sb: 2, bb: 5, effectiveStack: 500, numPlayers: 6, heroPosition: 'CO',
  anteType: 'none', ante: 0, straddleCount: 0, straddleAmounts: [],
  straddleBouton: false, straddleBoutonMontant: 0, currency: 'EUR',
  ...patch,
});

const liste = () => JSON.parse(disque.brut(CLE) ?? 'null');

(async () => {
  console.log('\n── 1. Ce qui s\'écrit, et ce qui ne s\'écrit pas ──');

  disque.vider();
  cas('Disque vierge : rien à reprendre', await chargerDerniereTable(), null);

  await memoriserTable(ctx({ heroName: 'Victor' }));
  cas('Aucun adversaire nommé : rien n\'est écrit', disque.brut(CLE), null);

  await memoriserTable(ctx({ opponentNames: { HJ: '   ', BTN: '' } }));
  cas('Que des noms vides : rien n\'est écrit non plus', disque.brut(CLE), null);

  disque.vider();
  await memoriserTable(ctx({ location: 'Aviation Club', opponentNames: { UTG: 'Anne', HJ: 'Marc' }, seatStacks: { CO: 900 } }));
  const t = await chargerDerniereTable();
  cas('Une table nommée fait un aller-retour complet', [t.lieu, t.numPlayers, t.heroPosition, t.opponentNames, t.seatStacks],
    ['Aviation Club', 6, 'CO', { UTG: 'Anne', HJ: 'Marc' }, { CO: 900 }]);
  cas('… avec une date relisible', Number.isFinite(new Date(t.quand).getTime()), true);

  console.log('\n── 2. La liste : la plus récente en tête, et plafonnée ──');

  disque.vider();
  for (const nom of ['Un', 'Deux', 'Trois']) await memoriserTable(ctx({ opponentNames: { HJ: nom } }));
  cas('Trois mains, trois entrées', liste().length, 3);
  cas('La plus récente est en tête', (await chargerDerniereTable()).opponentNames, { HJ: 'Trois' });
  cas('Les précédentes sont conservées dessous', liste().map((e) => e.opponentNames.HJ), ['Trois', 'Deux', 'Un']);

  disque.vider();
  for (let i = 1; i <= 8; i++) await memoriserTable(ctx({ opponentNames: { HJ: `J${i}` } }));
  cas('Huit mains : la liste est plafonnée à cinq', liste().map((e) => e.opponentNames.HJ), ['J8', 'J7', 'J6', 'J5', 'J4']);

  console.log('\n── 3. Un stockage abîmé ──');

  disque.vider();
  disque.poser(CLE, 'ceci n\'est pas du JSON');
  cas('JSON illisible : null, pas une exception', await chargerDerniereTable(), null);

  disque.poser(CLE, JSON.stringify({ pas: 'une liste' }));
  cas('Un objet là où on attend une liste : null', await chargerDerniereTable(), null);

  disque.poser(CLE, JSON.stringify([]));
  cas('Une liste vide : null', await chargerDerniereTable(), null);

  // LA PREMIÈRE VALIDE, pas la première tout court : une entrée écrite par une version antérieure ne
  // doit pas condamner celles qui la suivent.
  disque.poser(CLE, JSON.stringify([
    { quand: 'hier', numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: 'Fantôme' } },
    { quand: '2026-09-01T18:00:00.000Z', numPlayers: 6, heroPosition: 'CO', opponentNames: { HJ: 'Marc' } },
  ]));
  cas('Une entrée corrompue en tête : on prend la suivante', (await chargerDerniereTable()).opponentNames, { HJ: 'Marc' });

  disque.poser(CLE, JSON.stringify([{ quand: 'hier' }, null, 42]));
  cas('Aucune entrée valide : null', await chargerDerniereTable(), null);

  console.log('\n── 4. Un disque muet n\'interrompt pas une publication ──');

  disque.vider();
  disque.panne = 'ecriture';
  let explosion = null;
  try { await memoriserTable(ctx({ opponentNames: { HJ: 'Marc' } })); } catch (e) { explosion = e.message; }
  cas('Écriture impossible : aucune exception ne remonte', explosion, null);
  cas('… et rien n\'a été écrit', disque.brut(CLE), null);

  disque.panne = null;
  await memoriserTable(ctx({ opponentNames: { HJ: 'Marc' } }));
  disque.panne = 'lecture';
  cas('Lecture impossible : null, pas une exception', await chargerDerniereTable(), null);

  // Une lecture en panne au MOMENT D'ÉCRIRE ne doit pas perdre la publication non plus : le module
  // relit la liste avant d'y ajouter, et ce `getItem` peut échouer comme un autre.
  disque.panne = 'lecture';
  explosion = null;
  try { await memoriserTable(ctx({ opponentNames: { HJ: 'Léa' } })); } catch (e) { explosion = e.message; }
  cas('Relecture impossible pendant l\'écriture : rien n\'explose', explosion, null);

  console.log(ko === 0 ? '\n✅ Tout passe.\n' : `\n❌ ${ko} cas en échec.\n`);
  process.exit(ko === 0 ? 0 : 1);
})();
