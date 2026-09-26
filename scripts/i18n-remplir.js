// Remplir le tableur d'une langue sans tableur.
// ──────────────────────────────────────────────────────────────────────────────
// Le tunnel de traduction a été écrit pour un HUMAIN : `i18n-export.js` produit un CSV, la personne
// le remplit dans Numbers, `i18n-import.js` le réinjecte en refusant tout repère perdu. Ce script
// n'ajoute qu'un chemin d'entrée : il verse un JSON de traductions dans la colonne du CSV, pour
// qu'une traduction produite autrement qu'à la main PASSE PAR LE MÊME IMPORTATEUR VALIDÉ.
//
// C'est le seul point qui compte. Écrire `it.json` directement serait plus court et contournerait
// la seule vérification qui attrape la faute la plus coûteuse — une phrase qui a perdu son `{nom}`
// s'affiche amputée pour toujours, sans rien casser. On ne se donne pas le droit de sauter ça.
//
//   node scripts/i18n-export.js it                    → scripts/i18n-it.csv (colonne vide)
//   node scripts/i18n-remplir.js it traductions.json  → la colonne est remplie
//   node scripts/i18n-import.js it scripts/i18n-it.csv
//
// Le JSON emploie les mêmes clés que le CSV, formes plurielles comprises : « import.n_mains#one ».
//
// ⚠️ IL REND COMPTE DES DEUX SENS D'ÉCART, et c'est voulu : une clé du JSON qui ne correspond à
// aucune ligne (faute de frappe, clé disparue) serait sinon perdue sans un mot, et une ligne restée
// vide retomberait sur l'anglais sans qu'on sache laquelle. Les deux sont affichés ; ni l'un ni
// l'autre n'est bloquant, parce qu'une traduction partielle est légale et qu'on réinjecte plusieurs
// fois — mais un écart silencieux, non.
//
//
// LES FORMES PLURIELLES QUE L'EXPORT N'A PAS PRODUITES — ajouté le 26/09/2026
// ---------------------------------------------------------------------------
// `i18n-export.js` sort une ligne par forme du FRANÇAIS, donc `#one` et `#other`, et le glossaire
// dit au relecteur humain d'AJOUTER des lignes `#few` / `#many` si sa langue en réclame. Ce script
// ne savait pas le faire : il ne remplissait que des lignes existantes, donc une traduction de
// `import.n_mains#few` était declarée orpheline et jetée.
//
// Ça n'avait jamais eu d'importance : les treize premières langues n'ont que `one`/`other`. Le russe,
// le polonais, l'ukrainien et le tchèque en ont QUATRE, le roumain TROIS. Sans ce chemin, « 3 хвилини »
// s'afficherait avec le cas de « 5 хвилин » — une faute que rien ne signale, dans la moitié des
// nombres. Le script insère donc la ligne manquante, à sa place dans le groupe de sa clé.
//
// Trois contrôles l'encadrent, et le premier est BLOQUANT :
//   1. une forme que la langue n'a PAS (`#many` en bulgare) est refusée — `Intl.PluralRules` dit
//      lesquelles existent, et `rendre()` ne sélectionnerait jamais cette forme : elle serait du
//      poids mort invisible ;
//   2. une forme que la langue RÉCLAME et que le JSON ne donne pas est signalée — elle retombe sur
//      `other` à l'exécution, silencieusement et avec le mauvais cas ;
//   3. les lignes ajoutées sont COMPTÉES à part de celles remplies : ajouter une ligne au tableur
//      n'est pas le même geste que remplir une cellule, et ça se voit.

const fs = require('fs');
const path = require('path');

const [langue, fichierJson] = process.argv.slice(2);
if (!langue || !fichierJson) {
  console.error('Usage : node scripts/i18n-remplir.js <langue> <traductions.json>');
  process.exit(2);
}

const csvChemin = path.join(__dirname, `i18n-${langue}.csv`);
if (!fs.existsSync(csvChemin)) {
  console.error(`✗ ${path.relative(process.cwd(), csvChemin)} introuvable — lancer d'abord :`);
  console.error(`    node scripts/i18n-export.js ${langue}`);
  process.exit(2);
}

const traductions = JSON.parse(fs.readFileSync(fichierJson, 'utf8'));

/** Lecture CSV complète — même dialecte que `i18n-import.js` : champs cités, guillemets doublés. */
function lireCsv(texte) {
  const t = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lignes = [];
  let champs = [];
  let champ = '';
  let cite = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (cite) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') cite = false;
      else champ += c;
    } else if (c === '"') cite = true;
    else if (c === ',') { champs.push(champ); champ = ''; }
    else if (c === '\n') { champs.push(champ); lignes.push(champs); champs = []; champ = ''; }
    else champ += c;
  }
  if (champ !== '' || champs.length > 0) { champs.push(champ); lignes.push(champs); }
  return lignes;
}

const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const lignes = lireCsv(fs.readFileSync(csvChemin, 'utf8'));
const entete = lignes[0];
if (!entete || entete[0] !== 'cle') {
  console.error('✗ en-tête inattendu — le CSV ne vient pas de i18n-export.js');
  process.exit(2);
}
const colonne = entete.length - 1;

const servies = new Set();
let remplies = 0;
const vides = [];
/** Lignes vides dont la forme n'existe pas dans cette langue : sans conséquence (voir plus bas). */
const videsHorsLangue = [];

// Les formes plurielles que CETTE langue possède — la référence, et non une liste écrite à la main.
// Une entrée qui porterait une forme absente d'ici serait du poids mort : `rendre()` ne la choisit jamais.
let formesValides;
try {
  formesValides = new Set(new Intl.PluralRules(langue).resolvedOptions().pluralCategories);
} catch {
  console.error(`\u2717 \u00ab ${langue} \u00bb n'est pas une langue qu'Intl connaît \u2014 vérifier le code.`);
  process.exit(2);
}

// Les lignes sont montées en TABLEAU et non concaténées : il faut pouvoir insérer une forme plurielle
// AU MILIEU, dans le groupe de sa clé, et non l'accrocher en fin de fichier.
const corps = [];
/** Dernier index de `corps` occupé par une clé de base, pour y coller les formes ajoutées. */
const dernierIndex = new Map();
/** La ligne `#other` d'une clé : les formes ajoutées en héritent français, anglais et contexte. */
const ligneOther = new Map();

for (const ligne of lignes.slice(1)) {
  if (ligne.length === 1 && ligne[0] === '') continue; // ligne vide de fin de fichier
  const cle = ligne[0];
  const champs = [...ligne];
  while (champs.length <= colonne) champs.push('');
  const traduction = traductions[cle];
  if (typeof traduction === 'string' && traduction.trim() !== '') {
    champs[colonne] = traduction;
    servies.add(cle);
    remplies++;
  } else if (champs[colonne].trim() === '') {
    // ⚠️ DEUX SORTES DE LIGNE VIDE, et les confondre fait mentir le rapport. Une forme que la langue
    // N'A PAS (« #one » en chinois) ne retombera pas sur l'anglais : `Intl.PluralRules` ne la
    // sélectionnera jamais, donc elle ne sera jamais consultée. C'est normal et sans conséquence.
    // Une forme que la langue A et qu'on n'a pas remplie, elle, s'affichera en anglais.
    const forme = cle.includes('#') ? cle.split('#')[1] : null;
    (forme !== null && !formesValides.has(forme) ? videsHorsLangue : vides).push(cle);
  }
  corps.push(champs);
  const base = cle.split('#')[0];
  dernierIndex.set(base, corps.length - 1);
  if (cle.endsWith('#other')) ligneOther.set(base, champs);
}

// \u2500\u2500 LES FORMES PLURIELLES QUE L'EXPORT N'A PAS PRODUITES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Une clé du JSON en `base#forme` dont la ligne n'existe pas, mais dont la clé de base en a : c'est
// une forme que le français n'a pas et que cette langue réclame. On l'ajoute, à sa place.
const aAjouter = [];
const formesRefusees = [];
for (const cle of Object.keys(traductions)) {
  if (servies.has(cle) || !cle.includes('#')) continue;
  const [base, forme] = cle.split('#');
  if (!dernierIndex.has(base) || !ligneOther.has(base)) continue; // vraie orpheline, signalée plus bas
  const valeur = traductions[cle];
  if (typeof valeur !== 'string' || valeur.trim() === '') continue;
  if (!formesValides.has(forme)) {
    formesRefusees.push(`${cle} \u2014 \u00ab ${forme} \u00bb n'existe pas en ${langue} (formes : ${[...formesValides].sort().join(', ')})`);
    continue;
  }
  aAjouter.push({ base, forme, cle, valeur });
}

// BLOQUANT : écrire une forme que la langue n'a pas produirait une entrée que rien ne lit jamais.
if (formesRefusees.length > 0) {
  console.error(`\u2717 ${formesRefusees.length} forme(s) plurielle(s) que cette langue ne possède pas \u2014`);
  console.error("  Intl.PluralRules ne les sélectionnerait JAMAIS, donc elles seraient invisibles :");
  for (const f of formesRefusees) console.error(`      ${f}`);
  console.error("\n  Rien n'a été écrit.");
  process.exit(1);
}

// Insertion en ordre DÉCROISSANT d'index, pour que les index déjà calculés restent valides.
aAjouter.sort((a, b) => dernierIndex.get(b.base) - dernierIndex.get(a.base));
for (const { base, forme, cle, valeur } of aAjouter) {
  const champs = [...ligneOther.get(base)];
  champs[0] = cle;
  // Le français et l'anglais restent ceux de `other` : c'est exactement ce que fait l'importateur
  // pour vérifier les repères (`fr[cle]?.[forme] ?? fr[cle]?.other`), donc la colonne dit la vérité.
  if (entete.length > 3) {
    champs[3] = `FORME PLURIELLE \u00ab ${forme} \u00bb, AJOUTÉE : le français ne l'a pas, ${langue} la réclame. `
      + "Le français et l'anglais de cette ligne sont ceux de \u00ab other \u00bb.";
  }
  champs[colonne] = valeur;
  corps.splice(dernierIndex.get(base) + 1, 0, champs);
  servies.add(cle);
}

const sortie = [entete.map(cellule).join(','), ...corps.map((c) => c.map(cellule).join(','))];

fs.writeFileSync(csvChemin, '﻿' + sortie.join('\n') + '\n', 'utf8');

const orphelines = Object.keys(traductions).filter((c) => !servies.has(c));

console.log(`✓ ${remplies} cellule(s) remplie(s) dans ${path.relative(path.join(__dirname, '..'), csvChemin)}`);

// Le sens inverse, et c'est le plus dangereux : une forme que la langue RÉCLAME et que le JSON ne
// donne pas. Elle retombe sur \u00ab other \u00bb à l'exécution \u2014 sans erreur, avec le mauvais accord, et sur
// une partie des nombres seulement. « 3 хвилини » aurait le cas de « 5 хвилин ».
const formesManquantes = [];
for (const base of [...ligneOther.keys()].sort()) {
  const absentes = [...formesValides].filter(
    (f) => !(`${base}#${f}` in traductions)
      && !corps.some((c) => c[0] === `${base}#${f}` && c[colonne].trim() !== '')
  );
  if (absentes.length > 0) formesManquantes.push(`${base} \u2014 manque ${absentes.sort().join(', ')}`);
}

if (aAjouter.length > 0) {
  const parForme = {};
  for (const a of aAjouter) parForme[a.forme] = (parForme[a.forme] ?? 0) + 1;
  console.log(`+ ${aAjouter.length} ligne(s) AJOUTÉE(S) au tableur \u2014 formes que le français n'a pas :`);
  for (const [f, n] of Object.entries(parForme).sort()) console.log(`      #${f} : ${n}`);
}
if (formesManquantes.length > 0) {
  console.log(`\n\u26a0\ufe0f ${formesManquantes.length} pluriel(s) auxquels manque une forme que ${langue} réclame \u2014`);
  console.log('   ils retomberont sur \u00ab other \u00bb, donc avec le mauvais accord sur une partie des nombres :');
  for (const m of formesManquantes.slice(0, 30)) console.log(`      ${m}`);
  if (formesManquantes.length > 30) console.log(`      \u2026 et ${formesManquantes.length - 30} de plus`);
}
if (orphelines.length > 0) {
  console.log(`\n⚠️ ${orphelines.length} clé(s) du JSON ne correspondent à AUCUNE ligne du CSV —`);
  console.log(`   leur traduction serait perdue. Faute de frappe, ou clé disparue du français :`);
  for (const c of orphelines.slice(0, 30)) console.log(`      ${c}`);
  if (orphelines.length > 30) console.log(`      … et ${orphelines.length - 30} de plus`);
}
if (videsHorsLangue.length > 0) {
  console.log(`\n${videsHorsLangue.length} ligne(s) laissée(s) vide(s) parce que ${langue} n'a pas cette forme —`);
  console.log('   normal et sans conséquence : Intl ne les sélectionnera jamais.');
}
if (vides.length > 0) {
  console.log(`\n${vides.length} ligne(s) encore vide(s) — elles retomberont sur l'anglais :`);
  for (const c of vides.slice(0, 30)) console.log(`      ${c}`);
  if (vides.length > 30) console.log(`      … et ${vides.length - 30} de plus`);
}
console.log(`\nAu retour : node scripts/i18n-import.js ${langue} scripts/i18n-${langue}.csv`);
