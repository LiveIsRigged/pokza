// Le tableur qu'on envoie au relecteur d'une nouvelle langue.
// ──────────────────────────────────────────────────────────────────────────────
// Ce que ce script existe pour éviter : envoyer 733 lignes de JSON à quelqu'un qui n'est pas
// développeur. Il abandonne à la ligne 300, et il a raison.
//
// Ce qu'il produit : un CSV à cinq colonnes — clé, français, anglais, contexte, et une colonne
// VIDE à remplir. Le français ET l'anglais sont là exprès : deux formulations valent mieux qu'une
// pour deviner l'intention, surtout sur un mot isolé.
//
//   node scripts/i18n-export.js de            → scripts/i18n-de.csv (colonne « de » vide)
//   node scripts/i18n-export.js de --reprend  → pré-remplie avec de.json s'il existe déjà
//
// LES PLURIELS SONT ÉCLATÉS EN UNE LIGNE PAR FORME (`cle#one`, `cle#other`) : une cellule qui
// contiendrait `{"one":…,"other":…}` serait recopiée telle quelle par un humain, et le russe a
// besoin de formes que le français n'a pas. `i18n-import.js` les recolle.
//
// UTF-8 avec BOM : sans lui, Excel ouvre « Réglages » en « RÃ©glages ». Séparateur virgule, lu tel
// quel par Numbers et Google Sheets.

const fs = require('fs');
const path = require('path');

const CATALOGUES = path.join(__dirname, '..', 'pokza-app', 'src', 'i18n', 'catalogues');
const CONTEXTE = path.join(__dirname, '..', 'pokza-app', 'src', 'i18n', 'contexte.json');

const langue = process.argv[2];
const reprend = process.argv.includes('--reprend');
if (!langue || langue.startsWith('--')) {
  console.error('Usage : node scripts/i18n-export.js <langue> [--reprend]');
  process.exit(2);
}

const lire = (f, defaut = null) => {
  const p = path.join(CATALOGUES, f);
  if (!fs.existsSync(p)) {
    if (defaut !== null) return defaut;
    console.error(`✗ ${f} introuvable`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const fr = lire('fr.json');
const en = lire('en.json');
const contexte = JSON.parse(fs.readFileSync(CONTEXTE, 'utf8'));
const deja = reprend ? lire(`${langue}.json`, {}) : {};

/** Échappement CSV : guillemets doublés, et tout champ cité — un texte peut contenir `,` `"` ou \n. */
const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// L'ordre est celui de fr.json, c'est-à-dire par écran : le relecteur traduit un écran à la fois
// au lieu de sauter d'un bout à l'autre de l'app.
const lignes = [['cle', 'francais', 'anglais', 'contexte', langue].map(cellule).join(',')];
let compte = 0;

for (const [cle, valeurFr] of Object.entries(fr)) {
  const note = contexte[cle] ?? '';
  if (typeof valeurFr === 'string') {
    lignes.push([cle, valeurFr, en[cle] ?? '', note, typeof deja[cle] === 'string' ? deja[cle] : ''].map(cellule).join(','));
    compte++;
    continue;
  }
  // Formes plurielles : une ligne par forme. On propose les formes du FRANÇAIS comme point de
  // départ ; le relecteur en ajoute (`cle#few`, `cle#many`) si sa langue en réclame — c'est écrit
  // dans la colonne contexte, sinon personne ne devine qu'il en a le droit.
  const formes = Object.keys(valeurFr);
  for (const forme of formes) {
    const noteForme = `FORME PLURIELLE « ${forme} ». ${note}`.trim()
      + ` — ta langue peut en demander d'autres : ajoute une ligne « ${cle}#few » ou « ${cle}#many » si besoin.`;
    const valeurDeja = deja[cle] && typeof deja[cle] === 'object' ? deja[cle][forme] ?? '' : '';
    lignes.push([`${cle}#${forme}`, valeurFr[forme], (en[cle] ?? {})[forme] ?? '', noteForme, valeurDeja].map(cellule).join(','));
    compte++;
  }
}

const sortie = path.join(__dirname, `i18n-${langue}.csv`);
fs.writeFileSync(sortie, '﻿' + lignes.join('\n') + '\n', 'utf8');
console.log(`✓ ${compte} lignes → ${path.relative(path.join(__dirname, '..'), sortie)}`);
console.log(`  À envoyer avec docs/dev/glossaire-traduction.md : il dit ce qui ne se traduit pas.`);
console.log(`  Au retour : node scripts/i18n-import.js ${langue} <le fichier rempli>`);
