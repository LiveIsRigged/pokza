// Le retour du tableur : on réinjecte ce que le relecteur a rempli.
// ──────────────────────────────────────────────────────────────────────────────
//   node scripts/i18n-import.js de scripts/i18n-de.csv
//
// Ce qu'il refuse, et pourquoi c'est le cœur du script plutôt qu'un détail :
//
//  · UN REPÈRE PERDU. Si le français dit « {nom} a aimé ta main » et que la traduction dit
//    « hat deine Hand geliked », le nom DISPARAÎT à l'écran. Rien ne casse, rien ne s'affiche en
//    rouge : la phrase est simplement amputée, pour toujours. C'est la faute de traduction la plus
//    fréquente et la plus invisible — un relecteur ne voit qu'un mot bizarre entre accolades et le
//    supprime de bonne foi. Le script sort en erreur.
//  · UNE CLÉ QUI N'EXISTE PLUS : le tableur a vieilli pendant la relecture, ou une faute de frappe.
//
// Une traduction PARTIELLE est en revanche parfaitement légale : ce qui manque retombe sur
// l'anglais, clé par clé. On peut donc réinjecter un tableur à moitié rempli et recommencer.

const fs = require('fs');
const path = require('path');

const CATALOGUES = path.join(__dirname, '..', 'pokza-app', 'src', 'i18n', 'catalogues');
const [langue, fichier] = process.argv.slice(2);
if (!langue || !fichier) {
  console.error('Usage : node scripts/i18n-import.js <langue> <fichier.csv>');
  process.exit(2);
}

const fr = JSON.parse(fs.readFileSync(path.join(CATALOGUES, 'fr.json'), 'utf8'));

/** Lecture CSV complète : champs cités, guillemets doublés, retours à la ligne DANS une cellule. */
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
  return lignes.filter((l) => l.some((c) => c.trim() !== ''));
}

const lignes = lireCsv(fs.readFileSync(fichier, 'utf8'));
const entete = lignes.shift();
const colonne = entete.findIndex((c) => c.trim() === langue);
if (colonne === -1) {
  console.error(`✗ pas de colonne « ${langue} » dans ce fichier (colonnes : ${entete.join(', ')})`);
  process.exit(2);
}

const REPERES = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const traduit = {};
const source = {};
const inconnues = [];
const amputees = [];
let vides = 0;

for (const ligne of lignes) {
  const brut = (ligne[0] ?? '').trim();
  const valeur = (ligne[colonne] ?? '').trim();
  if (!brut) continue;
  const [cle, forme] = brut.split('#');
  if (!(cle in fr)) { inconnues.push(brut); continue; }
  if (!valeur) { vides++; continue; }

  const attendu = forme ? fr[cle]?.[forme] ?? fr[cle]?.other : fr[cle];
  const manquants = REPERES(attendu).filter((r) => !REPERES(valeur).includes(r));
  if (manquants.length > 0) {
    amputees.push(`${brut} — perd ${manquants.map((r) => `{${r}}`).join(', ')}\n      fr : ${attendu}\n      ${langue} : ${valeur}`);
    continue;
  }

  if (forme) {
    traduit[cle] = { ...(traduit[cle] || {}), [forme]: valeur };
    source[cle] = fr[cle];
  } else {
    traduit[cle] = valeur;
    source[cle] = fr[cle];
  }
}

// `other` est la forme de repli : une entrée plurielle sans elle afficherait du vide sur les
// nombres que la langue range ailleurs.
const sansOther = Object.entries(traduit)
  .filter(([, v]) => typeof v === 'object' && !('other' in v))
  .map(([k]) => k);

if (inconnues.length > 0) {
  console.error(`✗ ${inconnues.length} clé(s) qui n'existent plus en français :`);
  for (const c of inconnues) console.error(`      ${c}`);
}
if (amputees.length > 0) {
  console.error(`✗ ${amputees.length} traduction(s) qui PERDENT un repère — la phrase serait amputée à l'écran :`);
  for (const a of amputees) console.error(`      ${a}`);
}
if (sansOther.length > 0) {
  console.error(`✗ ${sansOther.length} pluriel(s) sans forme « other » (le repli) :`);
  for (const c of sansOther) console.error(`      ${c}`);
}
if (inconnues.length + amputees.length + sansOther.length > 0) {
  console.error('\nRien n’a été écrit. Corriger le tableur et relancer.');
  process.exit(1);
}

const ordonner = (o) => Object.fromEntries(Object.keys(fr).filter((k) => k in o).map((k) => [k, o[k]]));
const ecrire = (f, o) =>
  fs.writeFileSync(path.join(CATALOGUES, f), JSON.stringify(ordonner(o), null, 2) + '\n', 'utf8');
ecrire(`${langue}.json`, traduit);
ecrire(`${langue}.source.json`, source);

const total = Object.keys(fr).length;
const faits = Object.keys(traduit).length;
console.log(`✓ ${faits}/${total} clés en ${langue} (${vides} cellules laissées vides → repli sur l'anglais)`);
console.log(`\nPour que l'app la propose, trois lignes à ajouter :`);
console.log(`  src/i18n/langues.ts     → « ${langue}: '<nom dans cette langue>' » dans LANGUES`);
console.log(`  src/i18n/traduire.ts    → l'import du catalogue, et son entrée dans CATALOGUES`);
console.log(`                            (typée Partial<Record<Cle, Message>> : elle peut être incomplète)`);
console.log(`\nPuis : node scripts/i18n-audit.js`);
