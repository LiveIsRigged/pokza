// Le garde-fou de la traduction : ce qui empêche l'anglais de mentir en silence.
// ──────────────────────────────────────────────────────────────────────────────
// `tsc` attrape déjà deux fautes sur trois : une clé qui n'existe pas dans `fr.json` ne compile
// pas, et `en.json` est typé COMPLET, donc oublier l'anglais d'une clé casse la compilation.
//
// Reste le cas que ni le type ni les tests ne voient, et c'est le seul dangereux : on retouche un
// mot FRANÇAIS sans retoucher sa traduction. Rien ne casse, l'app tourne, l'anglais affiche
// l'ancienne phrase — indéfiniment, jusqu'à ce qu'un anglophone la lise et ne dise rien.
//
// La parade : chaque langue traduite porte une empreinte `<langue>.source.json`, qui garde le texte
// français dont la traduction est issue. Si le français a bougé depuis, la traduction est PÉRIMÉE
// et ce script le dit.
//
//   node scripts/i18n-audit.js                      → l'état des lieux (sort en erreur si trou)
//   node scripts/i18n-audit.js --sceller en cle...  → « c'est traduit », après avoir traduit
//
// À lancer avant tout commit qui touche un texte.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'pokza-app');
const CATALOGUES = path.join(RACINE, 'src', 'i18n', 'catalogues');
const SOURCE = 'fr';

const lire = (f) => JSON.parse(fs.readFileSync(path.join(CATALOGUES, f), 'utf8'));
const ecrire = (f, o) =>
  fs.writeFileSync(path.join(CATALOGUES, f), JSON.stringify(o, null, 2) + '\n', 'utf8');

/** Un texte peut être une chaîne ou ses formes plurielles : on compare les deux pareil. */
const empreinte = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

const langues = fs
  .readdirSync(CATALOGUES)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.source.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((l) => l !== SOURCE);

const fr = lire(`${SOURCE}.json`);

// ── Mode « sceller » : après avoir traduit, on date la traduction sur le français actuel ────────
const args = process.argv.slice(2);
if (args[0] === '--sceller') {
  const langue = args[1];
  const cles = args.slice(2);
  if (!langue || cles.length === 0) {
    console.error('Usage : node scripts/i18n-audit.js --sceller <langue> <cle> [<cle>...]');
    process.exit(2);
  }
  const traduit = lire(`${langue}.json`);
  const source = lire(`${langue}.source.json`);
  for (const cle of cles) {
    if (!(cle in fr)) {
      console.error(`✗ « ${cle} » n'existe pas dans ${SOURCE}.json`);
      process.exit(2);
    }
    if (!(cle in traduit)) {
      console.error(`✗ « ${cle} » n'est pas traduit dans ${langue}.json — traduire d'abord`);
      process.exit(2);
    }
    source[cle] = fr[cle];
  }
  // On garde l'ordre du français : les deux fichiers se lisent côte à côte, et les diffs restent
  // lisibles au lieu de bouger à chaque ajout.
  ecrire(`${langue}.source.json`, Object.fromEntries(Object.keys(fr).filter((c) => c in source).map((c) => [c, source[c]])));
  console.log(`✓ ${cles.length} clé(s) scellée(s) en ${langue}`);
  process.exit(0);
}

// ── Mode audit ──────────────────────────────────────────────────────────────────────────────────
let trous = 0;
console.log(`${Object.keys(fr).length} clés en ${SOURCE}\n`);

for (const langue of langues) {
  const traduit = lire(`${langue}.json`);
  const source = lire(`${langue}.source.json`);

  const manquantes = Object.keys(fr).filter((c) => !(c in traduit));
  const perimees = Object.keys(fr).filter(
    (c) => c in traduit && empreinte(source[c]) !== empreinte(fr[c])
  );
  const orphelines = Object.keys(traduit).filter((c) => !(c in fr));

  console.log(`── ${langue} ──`);
  const dire = (titre, liste, explication) => {
    if (liste.length === 0) return;
    trous += liste.length;
    console.log(`  ${titre} (${liste.length}) — ${explication}`);
    for (const c of liste) {
      console.log(`      ${c}`);
      if (titre.startsWith('PÉRIMÉ')) {
        console.log(`        ${SOURCE} était : ${JSON.stringify(source[c] ?? null)}`);
        console.log(`        ${SOURCE} est   : ${JSON.stringify(fr[c])}`);
      }
    }
  };
  dire('MANQUANTES', manquantes, 'jamais traduites — repli sur l’anglais');
  dire('PÉRIMÉES', perimees, 'le français a bougé depuis la traduction');
  dire('ORPHELINES', orphelines, 'la clé n’existe plus en français — à supprimer');
  if (manquantes.length + perimees.length + orphelines.length === 0) console.log('  ✓ à jour');
  console.log('');
}

// ── Clés jamais appelées : pas une erreur, mais du texte mort qu'on traduit pour rien ────────────
const fichiers = [];
(function balayer(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'i18n') balayer(p);
    } else if (/\.tsx?$/.test(e.name)) fichiers.push(p);
  }
})(path.join(RACINE, 'src'));
fichiers.push(path.join(RACINE, 'App.tsx'));

const code = fichiers.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
// On relève TOUTE chaîne littérale, pas seulement ce qui suit `t(` : une clé passe aussi par un
// ternaire (`t(x ? 'a' : 'b')`) ou par une table de correspondance. Chercher `t('...')` seul
// déclarait neuf clés mortes qui étaient bien vivantes — un garde-fou qui crie à tort finit ignoré.
// Les clés sont préfixées et pointées, une collision fortuite avec une autre chaîne est exclue.
// DEUX lectures réunies, parce que chacune rate ce que l'autre attrape :
//  · `t('clé')` explicitement — l'appariement naïf des guillemets se décale dès qu'une ligne
//    contient une chaîne vide ou une apostrophe, et avale alors le guillemet ouvrant de la clé
//    (vu sur ` ${t('admin.levee_expiree')}` précédé d'un `''`) ;
//  · toute chaîne littérale — pour les clés qui passent par un ternaire ou une table.
const litterales = new Set();
for (const m of code.matchAll(/\bt\(\s*'([^'\n]+)'/g)) litterales.add(m[1]);
for (const m of code.matchAll(/'([^'\n]+)'/g)) litterales.add(m[1]);
for (const m of code.matchAll(/"([^"\n]+)"/g)) litterales.add(m[1]);
const jamais = Object.keys(fr).filter((c) => !litterales.has(c));
if (jamais.length > 0) {
  console.log(`Clés jamais appelées (${jamais.length}) — informatif, pas bloquant :`);
  for (const c of jamais) console.log(`      ${c}`);
  console.log('');
}

// ── Le français resté dans le code : le trou que rien ne voyait ─────────────────────────────────
// Une clé inutilisée se voit, une clé périmée se voit — mais un écran à MOITIÉ traduit, non : il
// compile, il s'affiche, et la moitié française passe sous le nez de tous les autres contrôles.
// C'est arrivé sur l'écran des statistiques : trois libellés en texte JSX nu ont survécu à une
// passe qui ne cherchait que des chaînes entre guillemets.
//
// Informatif et non bloquant : trois familles restent en français EXPRÈS (cf. le glossaire), et
// les commentaires du code le sont tous.
const HORS_PERIMETRE = [
  'src/legal/legalContent.ts',      // des documents, pas des étiquettes — traduits à part
  'src/legal/legalContent.en.ts',   // la traduction de ces mêmes documents (cf. scripts/test-legal.js)
  'src/data/lieux.ts',              // des noms PROPRES : « Casino Barrière de Lille » ne se traduit pas
  'src/import/verification.ts',     // diagnostics affichés sous un refus, écrits pour diagnostiquer
  'src/import/montage.ts',
  'src/import/dialectes/',          // motifs de lecture des rooms : les traduire casserait l'import
  // Ces deux-là ne sont PAS des oublis, et c'est pour ça qu'ils sont nommés ici plutôt que tolérés
  // en silence :
  'src/engine/handEngine.ts',       // porte DÉJÀ ses deux langues en clair (`en ? … : …`) — la
                                    // branche française n'est pas du texte non traduit
  'src/lib/supabase.ts',            // message de démarrage adressé au développeur (.env manquant),
                                    // jamais vu par un joueur
];
const accent = /[éèêàçùôîûëïÉÈÀÇÊÎÔÛ]/;
const commentaire = /^\s*(\*|\/\/|\/\*)/;
const restant = [];
for (const f of fichiers) {
  const relatif = path.relative(RACINE, f).split(path.sep).join('/');
  if (HORS_PERIMETRE.some((h) => relatif.startsWith(h))) continue;
  // Les commentaires de ce dépôt sont en français et pleins d'apostrophes — sans les retirer
  // D'ABORD, chaque « qu'il » ouvre une fausse chaîne et le rapport se noie sous ses propres
  // faux positifs. Même piège que le comptage naïf qui annonçait 1700 chaînes au lieu de 450.
  const lignes = fs.readFileSync(f, 'utf8').split('\n');
  let dansBloc = false;
  lignes.forEach((ligneBrute, i) => {
    let ligne = ligneBrute;
    if (dansBloc) {
      const fin = ligne.indexOf('*/');
      if (fin === -1) return;
      ligne = ligne.slice(fin + 2);
      dansBloc = false;
    }
    const debut = ligne.indexOf('/*');
    if (debut !== -1) {
      const fin = ligne.indexOf('*/', debut + 2);
      if (fin === -1) {
        dansBloc = true;
        ligne = ligne.slice(0, debut);
      } else {
        ligne = ligne.slice(0, debut) + ligne.slice(fin + 2);
      }
    }
    const deuxSlashs = ligne.indexOf('//');
    if (deuxSlashs !== -1) ligne = ligne.slice(0, deuxSlashs);
    if (commentaire.test(ligne) || ligne.trim() === '') return;
    // Texte JSX nu (`>Par variante<`) et littéraux de plus de trois caractères accentués.
    const nu = ligne.match(/>\s*([^<>{}\n]*[éèêàçùôîûëïÉÈÀÇÊÎÔÛ][^<>{}\n]*?)\s*</);
    const litteral = ligne.match(/['"`]([^'"`\n]{4,}[éèêàçùôîûëïÉÈÀÇÊÎÔÛ][^'"`\n]*)['"`]/);
    const trouve = (nu && nu[1]) || (litteral && litteral[1]);
    if (trouve && accent.test(trouve)) restant.push(`${relatif}:${i + 1}  ${trouve.trim()}`);
  });
}
if (restant.length > 0) {
  console.log(`Français restant dans le code (${restant.length}) — informatif :`);
  // `--tout` : la liste entière, pour s'en servir comme d'une liste de travail.
  const plafond = process.argv.includes('--tout') ? restant.length : 40;
  for (const l of restant.slice(0, plafond)) console.log(`      ${l}`);
  if (restant.length > plafond) console.log(`      … et ${restant.length - plafond} de plus (--tout)`);
  console.log('');
}

// ── Texte littéral encore dans le code, quelle que soit la langue ───────────────────────────────
// Trois versions de ce contrôle ont echoué avant celle-ci, et chaque fois Victor a trouvé ce que je
// n'avais pas vu :
//   1. la recherche par ACCENTS ratait « Installer », « Publier », « Groupes », « Tournoi » ;
//   2. la recherche de texte JSX ne regardait que les `.tsx` — un `.ts` qui fabrique de l'affichage
//      (`denomination.ts`, `invalidation.ts`, `rehydrate.ts`) y échappait entièrement ;
//   3. elle ne voyait pas les valeurs par DÉFAUT de paramètre (`cancelLabel = 'Annuler'`), qui sont
//      pourtant du texte affiché — et en plus figé au chargement du module.
// Celle-ci ne regarde ni la langue ni la forme syntaxique : toute chaîne littérale qui RESSEMBLE à
// du texte destiné à un humain (deux mots, ou un mot capitalisé d'au moins quatre lettres) et qui
// n'est pas une clé du catalogue. Elle bruite un peu — chemins d'import, colonnes SQL, constantes —
// d'où le filtre ci-dessous, nommé et pas silencieux.
const BRUIT = [
  /^[a-z0-9_-]+$/,                       // identifiants, enums, valeurs de style
  /^[A-Z_]+$/,                           // constantes
  /^#[0-9a-fA-F]+$|^rgba?\(/,            // couleurs
  /^\.{0,2}\//,                           // chemins d'import
  /^https?:\/\//,
  /^[a-z_]+(?:,\s*[a-z_]+)+$/,           // listes de colonnes SQL
  /^\(.*:.*\)$/,                         // media queries
  /must be used within|requires /,       // messages destinés au développeur
  /^(?:image\/\w+|Fraunces_\w+|System|Enter|MacIntel|PushManager|Notification|top right)$/,
  /^(?:Hero|Pokza|GIF|NLHE|PLO5?|Pot|Check|Fold|Board \d|BB ante|BTN straddle|PRÉFLOP)$/,
];
const MOTS = /[A-Za-zÀ-ÿ]{2,}/g;
const litteralJsx = [];
for (const f of fichiers) {
  const relatif = path.relative(RACINE, f).split(path.sep).join('/');
  if (HORS_PERIMETRE.some((h) => relatif.startsWith(h))) continue;
  const sansBlocs = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  sansBlocs.split('\n').forEach((brute, i) => {
    const ligne = brute.replace(/\/\/.*$/, '');
    if (/^\s*(?:import|\*)/.test(ligne)) return;
    for (const m of ligne.matchAll(/'([^'\n]{3,70})'|"([^"\n]{3,70})"|`([^`\n$]{3,70})`/g)) {
      const v = m[1] ?? m[2] ?? m[3];
      if (v in fr || BRUIT.some((b) => b.test(v))) continue;
      const mots = v.match(MOTS) ?? [];
      const humain = mots.length >= 2 || (mots.length === 1 && mots[0].length >= 4 && /^[A-ZÀ-Þ]/.test(mots[0]));
      if (humain) litteralJsx.push(`${relatif}:${i + 1}  ${v}`);
    }
  });
}
if (litteralJsx.length > 0) {
  const plafondJsx = process.argv.includes('--tout') ? litteralJsx.length : 25;
  console.log(`Texte littéral encore dans le code (${litteralJsx.length}) — informatif :`);
  for (const l of litteralJsx.slice(0, plafondJsx)) console.log(`      ${l}`);
  if (litteralJsx.length > plafondJsx) console.log(`      … et ${litteralJsx.length - plafondJsx} de plus (--tout)`);
  console.log('');
}

// ── Les textes du push, qui vivent hors du bundle ───────────────────────────────────────────────
// `supabase/functions/send-push/textes.json` est GÉNÉRÉ depuis ce catalogue par
// `scripts/i18n-push.js` : la fonction Deno ne peut pas importer `fr.json`. Si le fichier dérive,
// le push dit autre chose que l'historique in-app — exactement le défaut qu'on vient de supprimer.
{
  const generateur = path.join(__dirname, 'i18n-push.js');
  if (fs.existsSync(generateur)) {
    const { status } = require('child_process').spawnSync(
      process.execPath, [generateur, '--verifier'], { encoding: 'utf8' }
    );
    if (status !== 0) {
      trous += 1;
      console.log("Les textes du push ont dérivé du catalogue — `node scripts/i18n-push.js`,");
      console.log('puis redéployer la fonction `send-push`.\n');
    }
  }
}

// ── `t()` appelé au CHARGEMENT du module — le piège le plus silencieux du lot ────────────────────
// Une table calculée au niveau module (`const NOM_STREET = { preflop: t('…') }`) résout ses textes
// UNE FOIS, au démarrage, et les garde dans cette langue-là pour toute la session. Rien ne casse :
// pas d'erreur, pas de trou à l'écran, juste un écran qui reste en français après un changement de
// langue. Six tables sont tombées dans ce piège pendant le chantier — dont une que j'ai écrite
// moi-même en croyant traduire. Toutes portent des CLÉS désormais, résolues à l'affichage.
//
// La détection compte les accolades pour de vrai (chaînes ignorées) : profondeur 0 = niveau module.
// Un `t()` dans une fonction fléchée passe, et c'est voulu — elle n'est évaluée qu'à l'appel.
function tAuChargement(source) {
  const sansBloc = source
    .replace(/\/\*[\s\S]*?\*\//g, (b) => '\n'.repeat((b.match(/\n/g) || []).length))
    .replace(/\/\/[^\n]*/g, '');
  const sorties = [];
  // Ce qui compte n'est PAS la profondeur d'accolades — le cas dangereux est justement un `t()`
  // DANS un objet de niveau module, donc à profondeur 1. Ce qui compte, c'est d'être ou non dans un
  // corps de FONCTION : là, le texte est résolu à l'appel, donc dans la bonne langue. On empile donc
  // pour chaque accolade ouvrante si elle ouvre une fonction, et un `t()` est sûr dès qu'une seule
  // fonction se trouve sous lui.
  const pile = [];
  let flecheEnCours = false;
  let ligne = 1;
  for (let i = 0; i < sansBloc.length; i++) {
    const c = sansBloc[i];
    if (c === '\n') ligne++;
    else if (c === ';') flecheEnCours = false;
    else if (c === '=' && sansBloc[i + 1] === '>') flecheEnCours = true;
    else if (c === '{') {
      const avant = sansBloc.slice(Math.max(0, i - 120), i);
      // `): string {` compte aussi : une annotation de type de retour sépare la parenthèse de
      // l'accolade, et sans elle le corps de la fonction passait pour du niveau module.
      pile.push(/=>\s*$|\)\s*(?::\s*[^={};]+)?\s*$|\bfunction\b[^{]*$/.test(avant));
      flecheEnCours = false;
    } else if (c === '}') {
      pile.pop();
      flecheEnCours = false;
    }
    else if (c === '"' || c === "'" || c === '`') {
      const guillemet = c;
      i++;
      while (i < sansBloc.length && sansBloc[i] !== guillemet) {
        if (sansBloc[i] === '\\') i++;
        else if (sansBloc[i] === '\n') ligne++;
        i++;
      }
    } else if (
      sansBloc.startsWith('t(', i) &&
      (i === 0 || !/[\w.$]/.test(sansBloc[i - 1])) &&
      !pile.some(Boolean) &&
      // …et pas non plus dans une flèche SANS accolades (`const f = (k) => t('…')`), qui n'ouvre
      // aucun bloc mais reste une fonction : on regarde si l'instruction courante contient `=>`.
      !flecheEnCours
    ) {
      sorties.push(ligne);
    }
  }
  return sorties;
}
const figes = [];
for (const f of fichiers) {
  const relatif = path.relative(RACINE, f).split(path.sep).join('/');
  for (const ligne of tAuChargement(fs.readFileSync(f, 'utf8'))) figes.push(`${relatif}:${ligne}`);
}
if (figes.length > 0) {
  trous += figes.length;
  console.log(`« t() » résolu au chargement du module (${figes.length}) — le texte restera dans la`);
  console.log(`langue du démarrage. Porter des CLÉS et les résoudre à l'affichage :`);
  for (const l of figes) console.log(`      ${l}`);
  console.log('');
}

// ── Notes de contexte devenues orphelines ────────────────────────────────────────────────────────
// `contexte.json` explique les clés qu'on ne peut pas traduire en lisant seulement leur texte. Il
// ne sert qu'à l'export vers le relecteur d'une nouvelle langue — donc personne ne le regarde au
// quotidien, donc il pourrit en silence si rien ne le surveille.
const cheminContexte = path.join(RACINE, 'src', 'i18n', 'contexte.json');
if (fs.existsSync(cheminContexte)) {
  const contexte = JSON.parse(fs.readFileSync(cheminContexte, 'utf8'));
  const orphelines = Object.keys(contexte).filter((c) => !c.startsWith('_') && !(c in fr));
  if (orphelines.length > 0) {
    trous += orphelines.length;
    console.log(`Notes de contexte orphelines (${orphelines.length}) — la clé n'existe plus :`);
    for (const c of orphelines) console.log(`      ${c}`);
    console.log('');
  }
}

// ── `t` nu dans un composant : le texte resterait dans l'ancienne langue après un changement ─────
// Le seul piège du module. `t` nu est LÉGITIME hors React et dans un gestionnaire d'événement (le
// texte y est fabriqué au clic, pas affiché en continu) — d'où l'avertissement plutôt que l'échec.
const sansAbonnement = [];
for (const f of fichiers) {
  if (!f.endsWith('.tsx')) continue;
  const contenu = fs.readFileSync(f, 'utf8');
  const importeT = /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*i18n'/.test(contenu);
  if (importeT && !contenu.includes('useT(')) sansAbonnement.push(path.relative(RACINE, f));
}
if (sansAbonnement.length > 0) {
  console.log(`Composants qui importent « t » sans « useT » (${sansAbonnement.length}) — vérifier :`);
  for (const f of sansAbonnement) console.log(`      ${f}`);
  console.log('');
}

if (trous > 0) {
  console.log(`✗ ${trous} trou(s) — traduire, puis « --sceller »`);
  process.exit(1);
}
console.log('✓ toutes les langues sont à jour');
