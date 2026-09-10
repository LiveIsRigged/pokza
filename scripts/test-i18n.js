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
//   7. une phrase dont un bout est un lien reste ENTIÈRE dans le catalogue : le traducteur peut
//      déplacer le lien où sa langue l'exige, y compris en inversant deux repères ;
//   8. « Bob et Chloé » vient d'`Intl.ListFormat` : l'anglais met la virgule d'Oxford
//      (« Bob, Chloé, and Ali »), le français non — écrite à la main, elle se serait perdue ;
//   6. la langue de démarrage suit l'ORDRE DE PRÉFÉRENCE de l'appareil : un Suisse réglé sur
//      [de, fr] reçoit du français, pas de l'anglais — et une liste sans aucune langue servie
//      donne l'anglais (décision du 10/09/2026).
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/i18n/traduire.ts pokza-app/src/utils/enumerer.ts \
//     --outDir scripts/i18n --module commonjs --target es2021 --rootDir pokza-app/src \
//     --resolveJsonModule --skipLibCheck
// (es2021 et pas es2020 : `Intl.ListFormat` n'existe pas dans la lib es2020.)
// puis : node scripts/test-i18n.js

const { t, rendre, interpoler, categorie, poserLangue, choisirLangue, segmenter } = require('./i18n/i18n/traduire');

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

// 8. phrases a trous — celles dont un morceau est un lien ou un mot en couleur
const seg = (g) => JSON.stringify(segmenter(g));
verifier(
  'deux reperes dans une phrase',
  seg("j'accepte les {cgu} et la {conf}."),
  JSON.stringify([{ texte: "j'accepte les " }, { repere: 'cgu' }, { texte: ' et la ' }, { repere: 'conf' }, { texte: '.' }])
);
verifier('repere en tete', seg('{lien} pour commencer'), JSON.stringify([{ repere: 'lien' }, { texte: ' pour commencer' }]));
verifier('repere en fin', seg('Pas de compte ? {lien}'), JSON.stringify([{ texte: 'Pas de compte ? ' }, { repere: 'lien' }]));
verifier('reperes colles', seg('{a}{b}'), JSON.stringify([{ repere: 'a' }, { repere: 'b' }]));
verifier('aucun repere', seg('Se connecter'), JSON.stringify([{ texte: 'Se connecter' }]));
verifier('gabarit vide', seg(''), JSON.stringify([]));
// L'ORDRE des reperes doit pouvoir changer : c'est tout l'interet de garder la phrase entiere.
verifier(
  'ordre inverse par la traduction',
  seg('the {conf} and the {cgu}'),
  JSON.stringify([{ texte: 'the ' }, { repere: 'conf' }, { texte: ' and the ' }, { repere: 'cgu' }])
);

// 9. l'enumeration « Bob et Chloe » — deleguee a `Intl.ListFormat`
const { enumerer } = require('./i18n/utils/enumerer');
poserLangue('fr');
verifier('fr : un seul nom', enumerer(['Bob']), 'Bob');
verifier('fr : deux noms', enumerer(['Bob', 'Chloé']), 'Bob et Chloé');
verifier('fr : trois noms', enumerer(['Bob', 'Chloé', 'Ali']), 'Bob, Chloé et Ali');
verifier('liste vide', enumerer([]), '');
poserLangue('en');
verifier('en : deux noms', enumerer(['Bob', 'Chloé']), 'Bob and Chloé');
// La virgule d'Oxford : l'anglais la met, le francais non. Ecrite a la main, elle se serait perdue.
verifier('en : virgule d’Oxford', enumerer(['Bob', 'Chloé', 'Ali']), 'Bob, Chloé, and Ali');
poserLangue('fr');

console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
