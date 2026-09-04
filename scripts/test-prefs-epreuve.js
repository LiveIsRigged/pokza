// La mémorisation du NOM DU TOURNOI et de son BUY-IN, d'une main à l'autre.
// ────────────────────────────────────────────────────────────────────────
// Ce sont les deux SEULS champs de `contextPrefs` qui PÉRIMENT (12 h, tranché par Victor le
// 04/09/2026). La raison est asymétrique et vaut d'être rappelée : des blindes périmées se
// corrigent d'elles-mêmes (on voit 500/1000 en étant à 2000/4000), un « Main Event » périmé ne se
// voit pas — et la main se publie avec le mauvais nom d'épreuve.
//
// Ce que ce script surveille, et qui ne se voit pas à la relecture :
//   1. LA PÉREMPTION EXISTE VRAIMENT. Un horodatage vieux de plus de 12 h ne propose rien. C'est
//      tout l'intérêt du chantier : sans elle, autant mémoriser comme le lieu.
//   2. UNE SOIRÉE DE CASH GAME NE RÉARME PAS LE COMPTE À REBOURS. C'est le piège central : le
//      compte à rebours glisse, mais seule une main de TOURNOI le repousse. Sans cette règle,
//      continuer à publier n'importe quoi rendrait un nom d'épreuve increvable.
//   3. LE NIVEAU N'EST JAMAIS MÉMORISÉ, lui. Il change tous les vingt minutes ; le nom et le
//      buy-in de l'épreuve, non. C'est ce qui justifie de traiter les trois différemment.
//   4. UN HORODATAGE DANS LE FUTUR NE PROPOSE RIEN. Une horloge qui recule rendrait sinon la
//      valeur increvable — et ici le mode de défaillance souhaitable est d'OUBLIER.
//   5. LE DISQUE PEUT ÊTRE MUET sans que rien ne casse : la mémorisation est un pur confort.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/contextPrefs.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-prefs-epreuve.js

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
const {
  saveContextPrefs,
  loadContextPrefs,
  PEREMPTION_EPREUVE_MS,
} = require('./cm/creator/contextPrefs.js');
const { DEFAULT_CONTEXT } = require('./cm/creator/types.js');

const CLE = 'pokza.creator.contextPrefs.v1';
const HEURE = 60 * 60 * 1000;

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const tournoi = (extra = {}) => ({
  ...DEFAULT_CONTEXT,
  gameType: 'tournament',
  sb: 700,
  bb: 1400,
  tournamentName: 'Main Event',
  buyIn: '250€',
  level: 'Niveau 12',
  ...extra,
});

/** Recule l'horodatage stocké, pour simuler le temps passé sans attendre. */
function vieillirDe(ms) {
  const p = JSON.parse(disque.brut(CLE));
  p.tournamentSavedAt -= ms;
  disque.poser(CLE, JSON.stringify(p));
}
const lu = async () => loadContextPrefs(DEFAULT_CONTEXT);

(async () => {
  console.log('\n── L’ALLER-RETOUR ──────────────────────────────────────────────────────────');

  disque.vider();
  await saveContextPrefs(tournoi());
  let p = await lu();
  cas('le nom de l’épreuve revient', p.tournamentName, 'Main Event');
  cas('le buy-in aussi — ils sont indissociables', p.buyIn, '250€');
  cas('le NIVEAU, lui, n’est jamais mémorisé', p.level, undefined);
  cas('les blindes reviennent comme avant', [p.sb, p.bb], [700, 1400]);

  console.log('\n── LA PÉREMPTION ───────────────────────────────────────────────────────────');

  disque.vider();
  await saveContextPrefs(tournoi());
  vieillirDe(11.5 * HEURE);
  p = await lu();
  cas('à 11 h 30, encore proposé', [p.tournamentName, p.buyIn], ['Main Event', '250€']);

  vieillirDe(HEURE); // → 12 h 30 au total
  p = await lu();
  cas('à 12 h 30, plus rien', [p.tournamentName, p.buyIn], [undefined, undefined]);
  cas('mais les autres réglages survivent, eux', [p.sb, p.bb], [700, 1400]);

  disque.vider();
  await saveContextPrefs(tournoi());
  vieillirDe(-2 * HEURE); // horodatage dans le futur : horloge qui a reculé
  p = await lu();
  cas('un horodatage dans le futur ne propose rien', p.tournamentName, undefined);

  console.log('\n── LE PIÈGE : QUI RÉARME LE COMPTE À REBOURS ───────────────────────────────');

  // Une main de tournoi le repousse : c'est le cas utile, plusieurs mains d'une même soirée.
  disque.vider();
  await saveContextPrefs(tournoi());
  vieillirDe(11 * HEURE);
  await saveContextPrefs(tournoi());
  vieillirDe(11 * HEURE);
  p = await lu();
  cas('22 h après la première main, mais 11 h après la dernière : proposé', p.tournamentName, 'Main Event');

  // Une main de cash game ne le repousse PAS, alors qu'elle réécrit tout le reste du fichier.
  disque.vider();
  await saveContextPrefs(tournoi());
  vieillirDe(11 * HEURE);
  await saveContextPrefs({ ...DEFAULT_CONTEXT, gameType: 'cash', sb: 2, bb: 5 });
  p = await lu();
  cas('le cash game a bien réécrit le reste', [p.gameType, p.sb, p.bb], ['cash', 2, 5]);
  cas('et il a conservé le nom d’épreuve tel quel', p.tournamentName, 'Main Event');
  vieillirDe(2 * HEURE); // → 13 h après la dernière main de TOURNOI
  p = await lu();
  cas('13 h après la dernière main de tournoi : périmé malgré le cash game', p.tournamentName, undefined);

  console.log('\n── LE DISQUE MUET ──────────────────────────────────────────────────────────');

  disque.vider();
  await saveContextPrefs(tournoi());
  disque.panne = 'lecture';
  p = await lu();
  cas('lecture en panne : on retombe sur les valeurs par défaut', p.tournamentName, undefined);
  cas('et sur les blindes par défaut', [p.sb, p.bb], [DEFAULT_CONTEXT.sb, DEFAULT_CONTEXT.bb]);

  // Le cas retors : le cash game doit RELIRE le disque pour conserver l'horodatage. Si la lecture
  // échoue, il ne doit pas pour autant interrompre la publication.
  disque.vider();
  await saveContextPrefs(tournoi());
  disque.panne = 'lecture';
  let leve = null;
  try {
    await saveContextPrefs({ ...DEFAULT_CONTEXT, gameType: 'cash' });
  } catch (e) {
    leve = String(e);
  }
  cas('une lecture en panne pendant une sauvegarde ne lève rien', leve, null);
  disque.panne = null;
  p = await lu();
  cas('le nom d’épreuve est alors oublié, pas corrompu', p.tournamentName, undefined);

  disque.vider();
  disque.panne = 'ecriture';
  leve = null;
  try {
    await saveContextPrefs(tournoi());
  } catch (e) {
    leve = String(e);
  }
  cas('écriture en panne : rien n’est levé non plus', leve, null);

  console.log('\n── LA CONSTANTE ────────────────────────────────────────────────────────────');
  cas('12 h, et pas une autre valeur', PEREMPTION_EPREUVE_MS, 12 * HEURE);

  console.log(ko === 0 ? '\n✅ Tout est vert.' : `\n❌ ${ko} échec(s).`);
  process.exit(ko === 0 ? 0 : 1);
})();
