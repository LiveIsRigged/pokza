// La saisie d'un montant au pavé numérique.
// ────────────────────────────────────────
// Depuis le 03/09/2026, l'étape 3 n'appelle plus le clavier d'iOS : il prenait 386 px pour quatre
// chiffres, et le champ finissait derrière lui. On dessine nos propres touches — et on hérite du
// coup des petites règles que le `TextInput` appliquait sans qu'on y pense.
//
// Ce que ce test protège, et qui ne se verrait pas à la relecture :
//
//   1. UNE SEULE VIRGULE. Deux virgules donnent un montant que `parseFloat` lit comme NaN, et
//      `confirmAmount` refuserait la mise avec un message que personne ne saurait corriger. Le
//      clavier système n'empêchait rien non plus, mais l'utilisateur voyait ce qu'il tapait.
//   2. PAS DE ZÉRO QUI TRAÎNE. « 05 » se lit mal et ne veut rien dire.
//   3. « 0, » ET NON « , ». Un montant qui commence par une virgule n'est pas lisible ; et c'est
//      ce que fait tout pavé de téléphone.
//   4. AUCUN PLAFOND, NI DE LONGUEUR NI DE DÉCIMALES. Le champ n'en avait pas avant, et en poser
//      un serait trancher à la place de Victor une valeur produit qu'il n'a jamais décidée.
//      TÉMOIN explicite plus bas : si quelqu'un ajoute une limite, ce test le dit.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/saisieMontant.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-saisie-montant.js

const { ajouterAuMontant, effacerDernier, SEPARATEUR } = require('./cm/creator/saisieMontant.js');

let ok = 0;
const echecs = [];
function eq(nom, obtenu, attendu) {
  if (obtenu === attendu) ok++;
  else echecs.push(`${nom}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
}
/** Tape une suite de touches depuis un champ vide. */
const taper = (suite) => [...suite].reduce((acc, c) => ajouterAuMontant(acc, c), '');

// ── 1. Le cas courant ──────────────────────────────────────────────────────────────────────────
eq('on tape 265', taper('265'), '265');
eq('on tape 2,5', taper('2,5'), '2,5');
eq('un champ vide plus un chiffre', ajouterAuMontant('', '7'), '7');

// ── 2. Une seule virgule ───────────────────────────────────────────────────────────────────────
eq('deuxième virgule ignorée', ajouterAuMontant('2,5', ','), '2,5');
eq('virgule sur une virgule finale', ajouterAuMontant('2,', ','), '2,');
eq('deux virgules à la suite', taper('2,,5'), '2,5');

// ── 3. Le zéro ─────────────────────────────────────────────────────────────────────────────────
eq('« 0 » puis « 5 » donne 5, pas 05', ajouterAuMontant('0', '5'), '5');
eq('« 0, » puis « 5 » donne bien 0,5', ajouterAuMontant('0,', '5'), '0,5');
eq('la virgule seule ouvre sur 0,', ajouterAuMontant('', ','), `0${SEPARATEUR}`);
eq('blindes à 0,25 : la suite complète', taper(',25'), '0,25');
eq('un zéro reste tapable après un chiffre', taper('10'), '10');
eq('« 0 » puis « 0 » ne fait pas 00', ajouterAuMontant('0', '0'), '0');

// ── 4. Ce qui n'est pas une touche du pavé ─────────────────────────────────────────────────────
// TÉMOIN : le pavé n'envoie que des chiffres et la virgule, mais rien n'oblige un futur appelant à
// s'y tenir. Un point, un « k », une lettre ne doivent pas entrer dans un montant que `parseFloat`
// devra lire.
for (const parasite of ['.', 'k', 'M', '€', ' ', '-', '']) {
  eq(`« ${parasite || '(vide)'} » est refusé`, ajouterAuMontant('26', parasite), '26');
}

// ── 5. La correction ───────────────────────────────────────────────────────────────────────────
eq('effacer le dernier chiffre', effacerDernier('265'), '26');
eq('effacer une virgule', effacerDernier('2,'), '2');
eq('effacer sur un champ vide ne casse rien', effacerDernier(''), '');
eq('effacer puis retaper', ajouterAuMontant(effacerDernier('265'), '9'), '269');
// Une virgule effacée redevient tapable — sinon on ne peut plus jamais corriger une décimale.
eq('virgule effacée, virgule à nouveau permise', ajouterAuMontant(effacerDernier('2,'), ','), '2,');

// ── 6. Aucun plafond ───────────────────────────────────────────────────────────────────────────
// TÉMOIN. Ces deux-là échoueront le jour où quelqu'un ajoutera une limite « pour faire propre ».
// Ce sera peut-être une bonne idée — mais c'est une valeur produit, elle se décide avec Victor,
// pas dans un correctif de passage.
eq('aucune limite de longueur', taper('123456789012'), '123456789012');
eq('aucune limite de décimales', taper('2,5555'), '2,5555');

// ── 7. Ce qui sort doit être lisible par `confirmAmount` ───────────────────────────────────────
// Il fait `parseFloat(saisie.replace(',', '.'))`. Toute saisie possible au pavé doit donner un
// nombre fini — sinon on retombe sur le défaut du 01/09 : « Valider » sans effet ni explication.
const suites = ['265', '2,5', ',25', '0,5', '1000', ',', '0'];
for (const suite of suites) {
  const saisi = taper(suite);
  const lu = parseFloat(saisi.replace(',', '.'));
  eq(`« ${suite} » → « ${saisi} » se lit comme un nombre`, Number.isFinite(lu), true);
}

// ── Résultat ───────────────────────────────────────────────────────────────────────────────────
console.log(`\n${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
