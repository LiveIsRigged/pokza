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

const sortie = [entete.map(cellule).join(',')];
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
    vides.push(cle);
  }
  sortie.push(champs.map(cellule).join(','));
}

fs.writeFileSync(csvChemin, '﻿' + sortie.join('\n') + '\n', 'utf8');

const orphelines = Object.keys(traductions).filter((c) => !servies.has(c));

console.log(`✓ ${remplies} cellule(s) remplie(s) dans ${path.relative(path.join(__dirname, '..'), csvChemin)}`);
if (orphelines.length > 0) {
  console.log(`\n⚠️ ${orphelines.length} clé(s) du JSON ne correspondent à AUCUNE ligne du CSV —`);
  console.log(`   leur traduction serait perdue. Faute de frappe, ou clé disparue du français :`);
  for (const c of orphelines.slice(0, 30)) console.log(`      ${c}`);
  if (orphelines.length > 30) console.log(`      … et ${orphelines.length - 30} de plus`);
}
if (vides.length > 0) {
  console.log(`\n${vides.length} ligne(s) encore vide(s) — elles retomberont sur l'anglais :`);
  for (const c of vides.slice(0, 30)) console.log(`      ${c}`);
  if (vides.length > 30) console.log(`      … et ${vides.length - 30} de plus`);
}
console.log(`\nAu retour : node scripts/i18n-import.js ${langue} scripts/i18n-${langue}.csv`);
