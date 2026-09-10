// Le noyau de la traduction : repli, interpolation, pluriels, et le choix de la langue au démarrage.
// ──────────────────────────────────────────────────────────────────────────────
// Ce que ce script protège :
//   1. sans rien faire, l'app est en français — la langue SOURCE, pas la langue de repli ;
//   2. une langue déclarée mais dont le catalogue n'a pas encore la clé retombe sur l'ANGLAIS,
//      jamais sur un trou ni sur le nom de la clé (c'est le cas de toute langue en cours de
//      traduction — l'allemand demain) ;
//   3. un `{nom}` sans variable est laissé TEL QUEL : voir l'accolade vaut mieux qu'« undefined » ;
//   4. les pluriels passent par `Intl.PluralRules`, donc le russe obtient bien ses TROIS formes —
//      c'est ce qui interdit d'écrire soi-même « n > 1 ? 's' : '' », qui est faux hors français ;
//   5. une catégorie que le traducteur n'a pas remplie retombe sur `other`, pas sur du vide ;
//   6. la langue de démarrage suit l'ORDRE DE PRÉFÉRENCE de l'appareil : un Suisse réglé sur
//      [de, fr] reçoit du français, pas de l'anglais — et une liste sans aucune langue servie
//      donne l'anglais (décision du 10/09/2026).
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/i18n/traduire.ts \
//     --outDir scripts/i18n --module commonjs --target es2020 --rootDir pokza-app/src \
//     --resolveJsonModule --skipLibCheck
// puis : node scripts/test-i18n.js

const { t, rendre, interpoler, categorie, poserLangue, choisirLangue } = require('./i18n/i18n/traduire');

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
}

// 1. le défaut est le français
verifier('défaut = français', t('reglages.titre'), 'Réglages');

// 2. bascule explicite
poserLangue('en');
verifier('anglais', t('reglages.titre'), 'Settings');

// 3. une langue sans catalogue retombe sur l'anglais, pas sur la clé
poserLangue('de'); // déclarée nulle part : c'est exactement l'état d'une langue en cours de route
verifier('repli sur anglais', t('reglages.titre'), 'Settings');
poserLangue('fr');

// 4. interpolation
verifier('interpolation', t('reglages.version', { version: '1.4.2' }), 'Pokza 1.4.2');
verifier('variable absente laissée telle quelle', interpoler('Pokza {version}', {}), 'Pokza {version}');
verifier('sans variables du tout', interpoler('Pokza {version}', undefined), 'Pokza {version}');
verifier('variable numérique', interpoler('{n} mains', { n: 3 }), '3 mains');

// 5. pluriels — la raison d'être d'`Intl.PluralRules`
const mains = { one: '{count} main', other: '{count} mains' };
verifier('fr : 1 → singulier', rendre(mains, 'fr', { count: 1 }), '1 main');
verifier('fr : 2 → pluriel', rendre(mains, 'fr', { count: 2 }), '2 mains');
// 0 est SINGULIER en français (« 0 main ») et PLURIEL en anglais (« 0 hands ») : la règle la plus
// facile à écrire de travers à la main, et celle qui se voit tout de suite.
verifier('fr : 0 → singulier', rendre(mains, 'fr', { count: 0 }), '0 main');
const hands = { one: '{count} hand', other: '{count} hands' };
verifier('en : 0 → pluriel', rendre(hands, 'en', { count: 0 }), '0 hands');
verifier('en : 1 → singulier', rendre(hands, 'en', { count: 1 }), '1 hand');

// Le russe a trois formes : 1 → one, 2-4 → few, 5+ → many. Aucun `n > 1 ? 's' : ''` ne sait faire ça.
verifier('ru : 1 → one', categorie('ru', 1), 'one');
verifier('ru : 3 → few', categorie('ru', 3), 'few');
verifier('ru : 7 → many', categorie('ru', 7), 'many');
verifier('de : 2 → other', categorie('de', 2), 'other');

// 6. catégorie non remplie par le traducteur → `other`, jamais du vide
verifier('catégorie manquante → other', rendre({ other: '{count} шт.' }, 'ru', { count: 3 }), '3 шт.');

// 7. langue de démarrage
verifier('appareil en français', choisirLangue(['fr']), 'fr');
verifier('appareil suisse [de, fr] → fr', choisirLangue(['de', 'fr']), 'fr');
verifier('appareil allemand seul → anglais', choisirLangue(['de']), 'en');
verifier('aucune préférence → anglais', choisirLangue([]), 'en');
verifier('codes nuls ignorés', choisirLangue([null, undefined, 'fr']), 'fr');

console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
