// La date du fil, une fois traduisible : "il y a 10 mn", "Hier", "Lundi", "10 septembre 2026".
// ──────────────────────────────────────────────────────────────────────────────
// Ce que ce script protège :
//   1. les trois premiers paliers changent bien de langue ;
//   2. le basculement en jours CALENDAIRES n'a pas bougé : 23 h reste « il y a 23h » même si on a
//      franchi minuit, et « Hier » veut dire la veille, pas « il y a 24 à 48 h » ;
//   3. les jours de la semaine et la date longue viennent d'`Intl` et suivent réellement la langue
//      — le test compare français et anglais et EXIGE qu'ils diffèrent, sinon la langue est ignorée ;
//   4. la MAJUSCULE initiale du jour est conservée : `Intl` rend « lundi », l'app a toujours
//      affiché « Lundi ». Sans cette retouche, traduire ferait régresser le français.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/relativeDate.ts \
//     --outDir scripts/i18n --module commonjs --target es2020 --rootDir pokza-app/src \
//     --resolveJsonModule --skipLibCheck
// puis : node scripts/test-date-relative.js

const { formatRelativeDate } = require('./i18n/utils/relativeDate');
const { poserLangue } = require('./i18n/i18n/traduire');

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
}
function affirmer(nom, condition, detail) {
  if (!condition) echecs++;
  console.log(`${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) console.log(`    ${detail}`);
}

const ilYA = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60000, H = 3600000;

poserLangue('fr');
verifier('fr : 30 s', formatRelativeDate(ilYA(30 * 1000)), "à l'instant");
verifier('fr : 10 mn', formatRelativeDate(ilYA(10 * MIN)), 'il y a 10 mn');
verifier('fr : 2 h', formatRelativeDate(ilYA(2 * H)), 'il y a 2h');

poserLangue('en');
verifier('en : 30 s', formatRelativeDate(ilYA(30 * 1000)), 'just now');
verifier('en : 10 mn', formatRelativeDate(ilYA(10 * MIN)), '10 min ago');
verifier('en : 2 h', formatRelativeDate(ilYA(2 * H)), '2h ago');

// Le palier des heures va jusqu'à 24 h RÉVOLUES, franchissement de minuit compris : c'est la règle
// d'origine, et c'est elle qui fait que « Hier » désigne la veille et pas un intervalle glissant.
poserLangue('fr');
verifier('fr : 23 h reste en heures', formatRelativeDate(ilYA(23 * H)), 'il y a 23h');

// « Hier » = le jour calendaire précédent. On vise midi de la veille pour ne dépendre ni de l'heure
// du test ni du fuseau — sauf si l'on est soi-même avant midi, auquel cas midi hier fait moins de
// 24 h et tombe (correctement) dans le palier des heures.
const hierMidi = new Date();
hierMidi.setDate(hierMidi.getDate() - 1);
hierMidi.setHours(12, 0, 0, 0);
const attenduHier = Date.now() - hierMidi.getTime() < 24 * H ? null : 'Hier';
if (attenduHier) verifier('fr : hier midi', formatRelativeDate(hierMidi.toISOString()), 'Hier');
else console.log('· fr : hier midi — non testable avant midi (moins de 24 h), palier des heures');

// Jour de la semaine : 3 jours en arrière, à midi.
const troisJours = new Date();
troisJours.setDate(troisJours.getDate() - 3);
troisJours.setHours(12, 0, 0, 0);
poserLangue('fr');
const jourFr = formatRelativeDate(troisJours.toISOString());
poserLangue('en');
const jourEn = formatRelativeDate(troisJours.toISOString());
affirmer('jour de semaine : le français a une majuscule', /^[A-ZÀ-Þ]/.test(jourFr), `obtenu : ${jourFr}`);
affirmer('jour de semaine : l’anglais aussi', /^[A-Z]/.test(jourEn), `obtenu : ${jourEn}`);
affirmer(
  'jour de semaine : la langue est réellement suivie',
  jourFr !== jourEn,
  `français et anglais rendent la même chose (${jourFr}) — la langue est ignorée`
);

// Date longue : au-delà d'une semaine.
const vieux = new Date();
vieux.setDate(vieux.getDate() - 40);
vieux.setHours(12, 0, 0, 0);
poserLangue('fr');
const longueFr = formatRelativeDate(vieux.toISOString());
poserLangue('en');
const longueEn = formatRelativeDate(vieux.toISOString());
affirmer('date longue : la langue est réellement suivie', longueFr !== longueEn, `${longueFr} / ${longueEn}`);
affirmer('date longue : contient l’année', longueFr.includes(String(vieux.getFullYear())), longueFr);
console.log(`    (${longueFr}  ·  ${longueEn})`);

poserLangue('fr');
console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
