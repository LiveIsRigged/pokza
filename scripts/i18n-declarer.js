// Déclarer une langue dans l'app — le dernier maillon qui restait écrit à la main.
// ──────────────────────────────────────────────────────────────────────────────
// Tout le reste de la chaîne est mécanique : `i18n-export.js`, `i18n-remplir.js`, `i18n-import.js`,
// `carte-apercu.py`, `i18n-push.js` et `i18n-apercu.js` PARCOURENT le dossier des catalogues et
// n'ont donc rien à apprendre d'une langue de plus. Deux fichiers seulement la nomment :
//
//   src/i18n/langues.ts   → son entrée dans LANGUES (le code ET le nom montré dans le sélecteur)
//   src/i18n/traduire.ts  → l'import du JSON, et son entrée dans CATALOGUES (typée Partial)
//
// Les faire à la main coûtait quatre retouches par langue, dont deux dans un type. En ajouter sept
// d'affilée, c'est vingt-huit occasions d'en oublier une — et l'oubli ne casse RIEN : la langue
// n'apparaît simplement pas dans les réglages, ou elle apparaît et affiche de l'anglais. Le
// `tsc` attrape le second cas, pas le premier.
//
//   node scripts/i18n-declarer.js nl Nederlands
//   node scripts/i18n-declarer.js --verifier        → ne réécrit rien ; sort en erreur si un
//                                                     catalogue existe sans être déclaré
//
// IDEMPOTENT : relancé sur une langue déjà déclarée, il le dit et ne touche à rien.
//
// ⚠️ CE QU'IL NE FAIT PAS, exprès : inventer le nom de la langue. `Intl.DisplayNames` le connaît,
// mais il le rend dans la casse de la langue (« magyar », « svenska », « dansk ») alors que le
// sélecteur est une liste d'items capitalisés — et surtout, le nom affiché est une VALEUR PRODUIT.
// Il se donne donc en argument, et le script refuse de deviner.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const I18N = path.join(RACINE, 'pokza-app', 'src', 'i18n');
const LANGUES_TS = path.join(I18N, 'langues.ts');
const TRADUIRE_TS = path.join(I18N, 'traduire.ts');
const CATALOGUES = path.join(I18N, 'catalogues');

const rel = (p) => path.relative(RACINE, p);

/** Les codes déjà déclarés dans LANGUES, dans l'ordre du fichier. */
function languesDeclarees(source) {
  const bloc = source.match(/export const LANGUES = \{([\s\S]*?)\n\} as const;/);
  if (!bloc) throw new Error(`${rel(LANGUES_TS)} : bloc LANGUES introuvable`);
  // Les clés à tiret sont CITÉES (`'zh-Hant':`), les autres non : le motif accepte les deux.
  return [...bloc[1].matchAll(/^\s*'?([a-z]{2,3}(?:-[A-Za-z0-9]+)?)'?:/gim)].map((m) => m[1]);
}

/** Les catalogues présents sur le disque (les empreintes `.source.json` ne comptent pas). */
function cataloguesPresents() {
  return fs
    .readdirSync(CATALOGUES)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.source.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

// ── CONTRÔLE ───────────────────────────────────────────────────────────────────
// Le seul écart qui ne casse rien et ne se voit pas : un catalogue traduit, importé, commité… et
// jamais déclaré. La langue n'existe alors pour personne, et rien ne le signale.
if (process.argv.includes('--verifier')) {
  const declarees = languesDeclarees(fs.readFileSync(LANGUES_TS, 'utf8'));
  const traduire = fs.readFileSync(TRADUIRE_TS, 'utf8');
  const manquantes = [];
  for (const code of cataloguesPresents()) {
    const dansLangues = declarees.includes(code);
    const id = code.replace(/-(.)/g, (_, x) => x.toUpperCase());
    const k = /^[a-z]{2,3}$/.test(code) ? code : `'${code}'`;
    const importee = new RegExp(`^import ${id} from '\\./catalogues/${code}\\.json';$`, 'm').test(traduire);
    const dansCatalogues = new RegExp(`${k}: Partial<Record<Cle, Message>>;`).test(traduire)
      || new RegExp(`${k}: Record<Cle, Message>;`).test(traduire);
    if (!dansLangues || !importee || !dansCatalogues) {
      manquantes.push(
        `${code} : ${[!dansLangues && 'absent de LANGUES', !importee && "pas d'import", !dansCatalogues && 'absent du type CATALOGUES']
          .filter(Boolean)
          .join(', ')}`
      );
    }
  }
  if (manquantes.length > 0) {
    console.error('✗ catalogue(s) présent(s) mais non déclaré(s) — la langue n\'existe pour personne :');
    for (const m of manquantes) console.error(`      ${m}`);
    console.error('\n  Réparer : node scripts/i18n-declarer.js <code> <nom dans cette langue>');
    process.exit(1);
  }
  console.log(`✓ ${cataloguesPresents().length} catalogue(s), tous déclarés dans langues.ts et traduire.ts`);
  process.exit(0);
}

// ── DÉCLARATION ────────────────────────────────────────────────────────────────
const [code, ...reste] = process.argv.slice(2);
const nom = reste.join(' ');
if (!code || !nom) {
  console.error('Usage : node scripts/i18n-declarer.js <code> <nom dans cette langue>');
  console.error('   ex : node scripts/i18n-declarer.js nl Nederlands');
  console.error('        node scripts/i18n-declarer.js --verifier');
  process.exit(2);
}
if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(code)) {
  console.error(`✗ « ${code} » n'a pas la forme d'un code de langue (fr, pt-BR…)`);
  process.exit(2);
}
if (!fs.existsSync(path.join(CATALOGUES, `${code}.json`))) {
  console.error(`✗ ${rel(path.join(CATALOGUES, `${code}.json`))} n'existe pas — importer d'abord :`);
  console.error(`    node scripts/i18n-export.js ${code}   puis   node scripts/i18n-import.js ${code} <csv>`);
  process.exit(2);
}

// ⚠️ UN CODE À TIRET N'EST NI UNE CLÉ NI UN IDENTIFIANT VALIDES. `zh-Hant:` ne compile pas comme
// clé d'objet TypeScript, et `import zh-Hant from …` est une erreur de syntaxe — le tiret y est lu
// comme une soustraction. Tant qu'aucune langue n'en avait, le script écrivait le code tel quel ;
// le chinois traditionnel a levé les deux d'un coup. Deux formes distinctes, donc :
//   clé d'objet  → citée si elle porte un tiret  (`'zh-Hant'`)
//   identifiant  → chameau sans tiret            (`zhHant`)
const cle = (c) => (/^[a-z]{2,3}$/.test(c) ? c : `'${c}'`);
const identifiant = (c) => c.replace(/-(.)/g, (_, x) => x.toUpperCase());

let langues = fs.readFileSync(LANGUES_TS, 'utf8');
let traduire = fs.readFileSync(TRADUIRE_TS, 'utf8');
const faits = [];
const deja = [];

// 1. LANGUES — insérée en DERNIÈRE position, après la dernière entrée existante. L'ordre du
//    sélecteur suit celui de ce bloc : une langue nouvelle arrive donc en bas de liste, à sa date.
if (languesDeclarees(langues).includes(code)) {
  deja.push('LANGUES');
} else {
  const avant = langues;
  langues = langues.replace(
    /(export const LANGUES = \{[\s\S]*?\n)(\} as const;)/,
    (_, debut, fin) => `${debut}  ${cle(code)}: '${nom.replace(/'/g, "\\'")}',\n${fin}`
  );
  if (langues === avant) throw new Error(`${rel(LANGUES_TS)} : insertion dans LANGUES impossible`);
  faits.push(`LANGUES → ${cle(code)}: '${nom}'`);
}

// 2. l'import du catalogue, juste après le dernier `import … from './catalogues/….json';`
if (new RegExp(`^import ${identifiant(code)} from '\\./catalogues/${code}\\.json';$`, 'm').test(traduire)) {
  deja.push('import');
} else {
  const imports = [...traduire.matchAll(/^import \w+ from '\.\/catalogues\/[\w-]+\.json';$/gm)];
  if (imports.length === 0) throw new Error(`${rel(TRADUIRE_TS)} : aucun import de catalogue trouvé`);
  const dernier = imports[imports.length - 1];
  const fin = dernier.index + dernier[0].length;
  traduire = `${traduire.slice(0, fin)}\nimport ${identifiant(code)} from './catalogues/${code}.json';${traduire.slice(fin)}`;
  faits.push(`import ${identifiant(code)} depuis ${code}.json`);
}

// 3. le type de CATALOGUES, puis la valeur. Le type est `Partial` pour toute langue autre que le
//    français (source) et l'anglais (repli) : une clé qui manque doit retomber sur l'anglais, pas
//    faire échouer la compilation. C'est ce qui permet d'importer une traduction incomplète.
if (new RegExp(`${cle(code).replace(/'/g, "'")}: (?:Partial<Record|Record)<Cle, Message>[>;]`).test(traduire)) {
  deja.push('type CATALOGUES');
} else {
  const avant = traduire;
  // ⚠️ LA CLASSE ACCEPTE `'` `:` ET `-` : dès la PREMIÈRE langue à tiret, la liste de valeurs cesse
  //    d'être une simple énumération de noms et devient `…, cs, 'zh-Hant': zhHant`. Écrite d'abord
  //    en `[\w, ]`, elle a marché pour le chinois puis échoué à la langue SUIVANTE — un défaut qui
  //    ne se voit qu'au deuxième usage, et qui a bien échoué bruyamment plutôt qu'en silence.
  traduire = traduire.replace(
    /(const CATALOGUES: \{\n[\s\S]*?)(\n\} = \{ )([\w, ':-]+)( \};)/,
    (_, corps, milieu, valeurs, fin) =>
      `${corps}\n  ${cle(code)}: Partial<Record<Cle, Message>>;${milieu}${valeurs}, `
      + `${identifiant(code) === code ? code : `${cle(code)}: ${identifiant(code)}`}${fin}`
  );
  if (traduire === avant) throw new Error(`${rel(TRADUIRE_TS)} : bloc CATALOGUES introuvable`);
  faits.push(`CATALOGUES → ${code}: Partial<Record<Cle, Message>>`);
}

if (faits.length === 0) {
  console.log(`✓ ${code} était déjà déclarée (${deja.join(', ')}) — rien à faire`);
  process.exit(0);
}

fs.writeFileSync(LANGUES_TS, langues, 'utf8');
fs.writeFileSync(TRADUIRE_TS, traduire, 'utf8');

console.log(`✓ ${code} déclarée :`);
for (const f of faits) console.log(`      ${f}`);
if (deja.length > 0) console.log(`  (déjà en place : ${deja.join(', ')})`);
console.log('\nEnsuite :');
console.log('  node scripts/i18n-push.js       (les textes du push suivent le catalogue)');
console.log('  node scripts/i18n-audit.js      (dont le contrôle du plafond de commun.niveau_valeur)');
