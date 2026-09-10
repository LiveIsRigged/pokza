// Les 243 pays, nommés et triés par la langue au lieu d'une table figée en français.
// ──────────────────────────────────────────────────────────────────────────────
// Ce que ce script protège :
//   1. les 243 pays sont TOUS là dans chaque langue — un `Intl` qui ne connaîtrait pas un code
//      rendrait `undefined` et le sélecteur perdrait silencieusement une ligne ;
//   2. le français n'a pas bougé : la table remplacée disait « Afrique du Sud », « États-Unis »,
//      « Tchéquie » — mêmes chaînes, apostrophe typographique de « Côte d'Ivoire » comprise ;
//   3. le TRI suit la langue. C'est le piège de fond : « Allemagne » se classe en A et « Germany »
//      en G. Une traduction qui garderait l'ordre français donnerait une liste anglaise
//      inutilisable, sans que rien ne casse ;
//   4. `countryLabel` colle bien le drapeau au nom traduit, et rend '' sur un code inconnu ;
//   5. le drapeau ne dépend PAS de la langue — il vient du code, pas du nom.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/data/countries.ts \
//     --outDir scripts/i18n --module commonjs --target es2020 --rootDir pokza-app/src \
//     --resolveJsonModule --skipLibCheck
// puis : node scripts/test-pays.js

const { listeDesPays, countryByCode, countryLabel, flagEmoji } = require('./i18n/data/countries');
const { poserLangue } = require('./i18n/i18n/traduire');

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
}
function affirmer(nom, condition, detail) {
  if (!condition) echecs++;
  console.log(`${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) console.log(`    ${detail}`);
}

const NOMBRE = 243;

poserLangue('fr');
const fr = listeDesPays();
verifier('français : 243 pays', fr.length, NOMBRE);
affirmer('français : aucun nom vide ni égal au code', !fr.some((p) => !p.name || p.name === p.code),
  JSON.stringify(fr.filter((p) => !p.name || p.name === p.code).slice(0, 5)));

// Les noms exacts de l'ancienne table figée. Sur les 243, `Intl.DisplayNames('fr')` en rendait zéro
// de différent — ces sept-là sont les plus susceptibles de dériver un jour (accents, apostrophe
// typographique, renommages officiels comme Tchéquie).
verifier('français : noms inchangés',
  ['FR', 'DE', 'US', 'GB', 'CZ', 'CI', 'ZA'].map((c) => countryByCode(c).name),
  ['France', 'Allemagne', 'États-Unis', 'Royaume-Uni', 'Tchéquie', 'Côte d’Ivoire', 'Afrique du Sud']);

poserLangue('en');
const en = listeDesPays();
verifier('anglais : 243 pays', en.length, NOMBRE);
verifier('anglais : les noms',
  ['FR', 'DE', 'US', 'GB', 'CZ', 'ZA'].map((c) => countryByCode(c).name),
  ['France', 'Germany', 'United States', 'United Kingdom', 'Czechia', 'South Africa']);

// LE point du chantier : l'ordre n'est pas le même, sinon la liste anglaise est inutilisable.
poserLangue('fr');
const rangFr = listeDesPays().findIndex((p) => p.code === 'DE');
poserLangue('en');
const rangEn = listeDesPays().findIndex((p) => p.code === 'DE');
affirmer("l'Allemagne ne se classe pas au même rang", rangFr !== rangEn,
  `même rang (${rangFr}) en français et en anglais — le tri ignore la langue`);
console.log(`    (Allemagne ${rangFr}e en français, Germany ${rangEn}e en anglais)`);

poserLangue('fr');
affirmer('la liste française est bien triée',
  listeDesPays().every((p, i, l) => i === 0 || new Intl.Collator('fr').compare(l[i - 1].name, p.name) <= 0),
  'ordre non croissant');
poserLangue('en');
affirmer("la liste anglaise est bien triée",
  listeDesPays().every((p, i, l) => i === 0 || new Intl.Collator('en').compare(l[i - 1].name, p.name) <= 0),
  'ordre non croissant');

// Libellé et drapeau
poserLangue('fr');
verifier('libellé français', countryLabel('DE'), '🇩🇪 Allemagne');
poserLangue('en');
verifier('libellé anglais', countryLabel('DE'), '🇩🇪 Germany');
verifier('code minuscule accepté', countryLabel('de'), '🇩🇪 Germany');
verifier('code inconnu → chaîne vide', countryLabel('ZZ'), '');
verifier('code absent → chaîne vide', countryLabel(null), '');
verifier('le drapeau ne dépend pas de la langue', flagEmoji('FR'), '🇫🇷');
verifier('drapeau invalide', flagEmoji('X'), '');

poserLangue('fr');
console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
