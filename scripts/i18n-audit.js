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

// ⚠️ L'APP N'EST PAS LE SEUL CONSOMMATEUR. `i18n-push.js` lit des clés `notif.*` pour fabriquer
// les textes de la fonction `send-push`, et il les désigne SANS leur préfixe (`'quelquun'`, pas
// `'notif.quelquun'`). En ne balayant que `pokza-app/src`, ce contrôle a déclaré morte
// `notif.quelquun` — le repli quand l'auteur n'a pas de nom — et elle a été supprimée pour de bon
// avant que le contrôle de dérive des textes du push ne la rattrape. D'où ces deux dossiers, et la
// règle du suffixe plus bas. Le sens de l'erreur n'est pas neutre : croire vivante une clé morte
// laisse traîner une ligne inutile, croire morte une clé vivante casse une notification.
const generateurs = [];
(function balayerGenerateurs(dossier) {
  if (!fs.existsSync(dossier)) return;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') balayerGenerateurs(p);
    } else if (/\.(js|ts|json)$/.test(e.name)) generateurs.push(p);
  }
})(__dirname);
(function balayerFonctions(dossier) {
  if (!fs.existsSync(dossier)) return;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) balayerFonctions(p);
    else if (/\.(ts|json)$/.test(e.name)) generateurs.push(p);
  }
})(path.join(__dirname, '..', 'supabase', 'functions'));

const codeGenerateurs = generateurs.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
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
// Côté générateurs, on accepte AUSSI le dernier segment seul : c'est la forme sous laquelle
// `i18n-push.js` nomme ses clés. Une collision fortuite ferait survivre une clé morte — coût : une
// ligne de trop dans la feuille du relecteur. L'erreur inverse supprime une clé qui sert.
const jamais = Object.keys(fr).filter(
  (c) =>
    !litterales.has(c) &&
    !codeGenerateurs.includes(`'${c}'`) &&
    !codeGenerateurs.includes(`"${c}"`) &&
    !codeGenerateurs.includes(`'${c.split('.').pop()}'`) &&
    !codeGenerateurs.includes(`"${c.split('.').pop()}"`)
);
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
    // Un message de `console.*` s'adresse au développeur, jamais à un joueur : il n'a pas à être
    // traduit, et le signaler noierait le rapport sous du bruit qu'on ne corrigera jamais.
    ligne = ligne.replace(/\bconsole\.\w+\([^)]*\)?/g, '');
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
  /^(?:Hero|Pokza|GIF|NLHE|PLO5?|Pot|Check|Fold|Board \d|BB ante|BTN straddle|BTN Straddle|Straddle|Bomb pot|ALL-IN|PRÉFLOP)$/,
  /^Reset$/,                             // bouton de la fiche joueur : choisi par Victor le 01/09, cf. FicheJoueur.tsx
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

// ── Le texte JSX renvoyé à la ligne, ou sans accent ─────────────────────────────────────────────
// LE HUITIÈME AVEUGLEMENT, trouvé le 15/09/2026 : 16 phrases françaises affichées à tous les joueurs
// — dont la case de consentement de la complétion du profil — n'apparaissaient dans AUCUN contrôle.
// « Français restant » lit ligne par ligne et veut `>`, `<` ET un accent sur la même ligne ; « Texte
// littéral » ne regarde que les chaînes entre guillemets. Or dès qu'un texte ne tient plus entre ses
// balises, il passe sur sa propre ligne :
//     <Text style={styles.hint}>
//       Les notifications ne sont pas disponibles sur cet appareil.
//     </Text>
// et un texte court sans accent (`>Recevoir un push pour…<`) passait même tenu sur une ligne.
//
// Celle-ci lit chaque fichier d'un bloc et suit les VRAIES balises : un `<Nom` collé à un identifiant
// est un générique (`useState<string>`), pas une balise ; la fin d'une balise se cherche en comptant
// les accolades, sinon le `>` d'un `() =>` dans un attribut la couperait ; et une PILE ne laisse lire
// du texte qu'entre une ouverture et sa fermeture — sans elle, le code qui suit le dernier `</View>`
// d'un composant passait pour une phrase.
//
// Limite connue : un mot court dans une expression (`isHero ? 'Hero' : 'Nom'`) ou dans un gabarit
// (`${label} (toi)`) reste invisible à tous les contrôles — c'est ainsi que ces deux-là ont survécu.
const texteJsx = [];
for (const f of fichiers) {
  if (!f.endsWith('.tsx')) continue;
  const relatif = path.relative(RACINE, f).split(path.sep).join('/');
  if (HORS_PERIMETRE.some((h) => relatif.startsWith(h))) continue;
  // Commentaires blanchis en GARDANT les retours à la ligne, pour que les numéros restent justes.
  // Un `//` précédé de `:` est celui d'une adresse (`https://`), pas un commentaire.
  const src = fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (c, avant) => avant + ' '.repeat(c.length - avant.length));
  const pile = [];
  const balise = /<(\/?)([A-Za-z][\w.]*)?/g;
  let m;
  while ((m = balise.exec(src))) {
    const fermante = m[1] === '/';
    // `<>` et `</>` sont des fragments ; `a < b` n'est pas une balise.
    if (!m[2] && src[balise.lastIndex] !== '>') continue;
    if (!fermante && /[\w$)\]]/.test(src[m.index - 1] ?? '')) continue;
    let fin = balise.lastIndex;
    for (let profondeur = 0; fin < src.length; fin++) {
      if (src[fin] === '{') profondeur++;
      else if (src[fin] === '}') profondeur--;
      else if (src[fin] === '>' && profondeur === 0) break;
    }
    if (fin >= src.length) break;
    balise.lastIndex = fin + 1;
    if (fermante) pile.pop();
    else if (src[fin - 1] !== '/') pile.push(m[2] ?? '');
    if (pile.length === 0) continue;
    const texte = src.slice(fin + 1).match(/^[^<{]*/)[0];
    const net = texte.replace(/\s+/g, ' ').trim();
    if (!net || BRUIT.some((b) => b.test(net))) continue;
    // Le code d'une expression qui suit une balise (`) : liste.length === 0 ? (`) n'est pas une
    // phrase : il commence par une parenthèse fermante ou porte un opérateur qu'aucun texte n'a.
    if (/^\)|=>|===|!==|&&|\|\||\?\s*\(|\)\s*:/.test(net)) continue;
    const mots = net.match(MOTS) ?? [];
    const humain = mots.length >= 2 || (mots.length === 1 && mots[0].length >= 4 && /^[A-ZÀ-Þ]/.test(mots[0]));
    const ligne = src.slice(0, fin + 1 + texte.search(/\S/)).split('\n').length;
    if (humain) texteJsx.push(`${relatif}:${ligne}  ${net.slice(0, 90)}`);
  }
}
if (texteJsx.length > 0) {
  const plafondTexte = process.argv.includes('--tout') ? texteJsx.length : 25;
  console.log(`Texte JSX renvoyé à la ligne ou sans accent (${texteJsx.length}) — informatif :`);
  for (const l of texteJsx.slice(0, plafondTexte)) console.log(`      ${l}`);
  if (texteJsx.length > plafondTexte) console.log(`      … et ${texteJsx.length - plafondTexte} de plus (--tout)`);
  console.log('');
}

// ── Le français caché dans un gabarit interpolé ─────────────────────────────────────────────────
// LE NEUVIÈME AVEUGLEMENT, signalé par Victor le 25/09/2026 : « À {nom} de jouer » s'affichait en
// français à un lecteur réglé sur l'anglais, sous chaque main arrêtée par son auteur. La ligne
// fautive était à UN appel de la bonne — sa voisine immédiate passait déjà par `t()` :
//
//     ? `À ${nomEnAttente} de jouer`     ← en dur
//     : t('replayer.main_arretee')       ← traduite
//
// Aucun des trois contrôles ci-dessus ne pouvait la voir, et chacun pour une raison propre :
//   · « Français restant » exige QUATRE caractères AVANT l'accent. Le « À » est le premier
//     caractère du gabarit : la condition ne peut pas être remplie. Toute phrase qui COMMENCE par
//     son accent lui était invisible — et en français c'est un début très courant (« À », « Élu »,
//     « Ôte »). Le {4,} voulait écarter les chaînes trop courtes ; il a été posé AVANT l'accent au
//     lieu de mesurer la longueur totale ;
//   · « Texte littéral » exclut le dollar de sa classe de caractères : tout gabarit interpolé lui
//     est invisible PAR CONSTRUCTION ;
//   · « Texte JSX » ne lit qu'entre des balises, et celui-ci est dans une expression.
//
// Le troisième l'annonçait d'ailleurs en clair — « un mot court dans une expression ou dans un
// gabarit reste invisible à tous les contrôles ». Le trou était donc CONNU et écrit ; il manquait
// seulement quelqu'un pour le fermer. Mesuré à l'insertion : cinq autres gabarits français, dont
// deux glissaient un fragment brut DANS une phrase traduite (un Allemand lisait « den ganzen
// Verlauf » autour de « le tapis de BTN »).
//
// Celui-ci ne cherche donc ni accent ni balise : il relève TOUT gabarit contenant une expression,
// remplace les expressions par un blanc, et juge ce qui reste avec le même critère que les autres.
// Les expressions se suivent en comptant les accolades, et un gabarit imbriqué se saute en entier —
// sans quoi le ternaire d'`ErrorBoundary` faisait déborder la lecture sur le code d'après.
//
// ⚠️ LIMITE CONNUE, mesurée et non corrigée : un gabarit dont il ne reste qu'une UNITÉ de deux
// lettres (« {n} Mo », réellement trouvé ce jour-là et traduit à la main) reste sous le critère
// « deux mots, ou un mot capitalisé de quatre lettres ». L'abaisser ferait remonter toutes les
// constantes d'une lettre ou deux du dépôt : un garde-fou qui crie à tort finit ignoré, et
// celui-ci a déjà trois prédécesseurs morts de ça.

/** Blanchit un appel et son contenu en suivant ses parenthèses, sans décaler les lignes. */
function blanchirAppels(src, motif) {
  let sortie = src;
  const re = new RegExp(motif, 'g');
  let m;
  while ((m = re.exec(sortie))) {
    let profondeur = 0;
    let i = m.index + m[0].length - 1;
    for (; i < sortie.length; i++) {
      if (sortie[i] === '(') profondeur++;
      else if (sortie[i] === ')') { profondeur--; if (profondeur === 0) break; }
    }
    const fin = Math.min(i + 1, sortie.length);
    sortie =
      sortie.slice(0, m.index) +
      sortie.slice(m.index, fin).replace(/[^\n]/g, ' ') +
      sortie.slice(fin);
    re.lastIndex = fin;
  }
  return sortie;
}

/** Les gabarits INTERPOLÉS d'une source, leurs expressions réduites à un blanc. */
function gabaritsInterpoles(src) {
  const sortie = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '`') continue;
    let texte = '';
    let interpole = false;
    let profondeur = 0;
    let j = i + 1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (profondeur === 0) {
        if (c === '\\') { j++; continue; }
        if (c === '`') break;
        if (c === '$' && src[j + 1] === '{') { interpole = true; profondeur = 1; j++; texte += ' '; continue; }
        texte += c;
      } else if (c === '{') profondeur++;
      else if (c === '}') profondeur--;
      else if (c === '`') {
        // Gabarit imbriqué dans l'expression : sauté en entier, sinon sa fin passerait pour celle
        // du gabarit extérieur et la lecture déborderait sur le code suivant.
        let k = j + 1;
        let p = 0;
        for (; k < src.length; k++) {
          if (src[k] === '\\') { k++; continue; }
          if (src[k] === '$' && src[k + 1] === '{') { p++; k++; }
          else if (src[k] === '}' && p > 0) p--;
          else if (src[k] === '`' && p === 0) break;
        }
        j = k;
      }
    }
    // Un gabarit non refermé signe une lecture qui a dérapé : on ne rapporte rien plutôt que faux.
    if (j < src.length && interpole) sortie.push({ index: i, texte });
    i = j;
  }
  return sortie;
}

// Ce qu'on assemble avec une variable est le plus souvent une ADRESSE, un sélecteur ou un filtre —
// jamais une phrase. Ces cinq motifs sont les familles réellement relevées dans le dépôt.
const BRUIT_GABARIT = [
  /^\//,                        // chemin ou route assemblés (`${userId}/avatar.jpg`)
  /\w\[\w+=/,                   // sélecteur d'attribut CSS (`meta[name="${name}"]`)
  /^url\(/,                     // `url(#fade-${suit})`
  /\.eq\.|_id[,)]|^and\(/,      // filtres PostgREST (`sender_id.eq.${userId},…`)
  /^[A-Z][a-z]+[A-Z]/,          // identifiant en casse chameau (`PostCard ${id}`)
];
const gabaritsFrancais = [];
for (const f of fichiers) {
  const relatif = path.relative(RACINE, f).split(path.sep).join('/');
  if (HORS_PERIMETRE.some((h) => relatif.startsWith(h))) continue;
  let src = fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (c, avant) => avant + ' '.repeat(c.length - avant.length));
  // Un message de `console.*` s'adresse au développeur — même raison qu'au contrôle précédent,
  // mais en suivant les parenthèses : ce contrôle lit le fichier d'un bloc, pas ligne par ligne.
  src = blanchirAppels(src, '\\bconsole\\.\\w+\\(');
  for (const g of gabaritsInterpoles(src)) {
    const net = g.texte.replace(/\s+/g, ' ').trim();
    if (!net || net in fr) continue;
    if (BRUIT.some((b) => b.test(net)) || BRUIT_GABARIT.some((b) => b.test(net))) continue;
    const mots = net.match(MOTS) ?? [];
    const humain = mots.length >= 2 || (mots.length === 1 && mots[0].length >= 4 && /^[A-ZÀ-Þ]/.test(mots[0]));
    if (!humain) continue;
    const ligne = src.slice(0, g.index).split('\n').length;
    gabaritsFrancais.push(`${relatif}:${ligne}  ${net.slice(0, 90)}`);
  }
}
if (gabaritsFrancais.length > 0) {
  const plafondGabarits = process.argv.includes('--tout') ? gabaritsFrancais.length : 25;
  console.log(`Texte figé dans un gabarit interpolé (${gabaritsFrancais.length}) — informatif :`);
  for (const l of gabaritsFrancais.slice(0, plafondGabarits)) console.log(`      ${l}`);
  if (gabaritsFrancais.length > plafondGabarits) {
    console.log(`      … et ${gabaritsFrancais.length - plafondGabarits} de plus (--tout)`);
  }
  console.log('');
}

// ── La forme stockée du niveau contre la contrainte de la base ───────────────────────────────────
// `commun.niveau_valeur` n'est pas une étiquette : c'est la valeur ÉCRITE dans `posts.level`, par
// le créateur comme par l'import. Et `securite-lot6.sql` y impose `char_length(level) <= 10`.
//
// Les quatre langues livrées tiennent — « Niveau 999 » fait 10 pile, les trois autres 9. Par
// chance, pas par construction : « Livello 999 » (italien) ferait 11, et la base REFUSERAIT
// l'insertion. Ce n'est pas une troncature, c'est une main qui ne se publie pas, sur une erreur que
// personne ne saurait relier à une traduction.
//
// BLOQUANT, contrairement aux contrôles informatifs plus haut : le coût d'un oubli n'est pas une
// phrase un peu française, c'est une fonctionnalité cassée pour toute une langue.
{
  const PLAFOND_BASE = 10; // jumeau de limits.ts / securite-lot6.sql:63
  const CLE_NIVEAU = 'commun.niveau_valeur';
  const CHIFFRES_MAX = 3; // LEVEL_DIGITS_MAX
  const trop = [];
  for (const langue of [SOURCE, ...langues]) {
    const catalogue = langue === SOURCE ? fr : lire(`${langue}.json`);
    const forme = catalogue[CLE_NIVEAU];
    if (typeof forme !== 'string') continue; // absente : déjà signalé comme MANQUANTE plus haut
    const rendu = forme.replace(/\{n\}/g, '9'.repeat(CHIFFRES_MAX));
    if (rendu.length > PLAFOND_BASE) trop.push(`${langue} : « ${rendu} » = ${rendu.length} caractères`);
  }
  if (trop.length > 0) {
    trous += trop.length;
    console.log(`${CLE_NIVEAU} dépasse les ${PLAFOND_BASE} caractères de la base (${trop.length}) :`);
    for (const l of trop) console.log(`      ${l}`);
    console.log('      La base REFUSERAIT la publication. Raccourcir le mot, ou remonter la');
    console.log('      contrainte des DEUX côtés (securite-lot6.sql et limits.ts).\n');
  }
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

// ── Les textes des aperçus de liens, qui vivent hors du bundle eux aussi ────────────────────────
// `pokza-app/worker-textes.json` est GÉNÉRÉ depuis ce catalogue par `scripts/i18n-apercu.js` : le
// Worker Cloudflare qui écrit les balises Open Graph ne peut pas importer `fr.json`. S'il dérive,
// la vignette d'un lien dit autre chose que la page qu'il ouvre.
{
  const generateur = path.join(__dirname, 'i18n-apercu.js');
  if (fs.existsSync(generateur)) {
    const { status } = require('child_process').spawnSync(
      process.execPath, [generateur, '--verifier'], { encoding: 'utf8' }
    );
    if (status !== 0) {
      trous += 1;
      console.log("Les textes des aperçus ont dérivé du catalogue — `node scripts/i18n-apercu.js`.");
      console.log("Si `apercu.phrase` a bougé, relancer aussi `python3 scripts/carte-apercu.py`.\n");
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
//
// ⚠️ CE CONTRÔLE N'AVAIT JAMAIS RIEN ATTRAPÉ, découvert le 25/09/2026 : son motif exigeait un chemin
// d'import FINISSANT par `i18n`, alors que les quatre fichiers concernés importent depuis
// `i18n/traduire` — le module nu, justement celui qui n'abonne pas. Il ne pouvait donc mordre que
// sur la forme qui n'a pas le défaut. Un contrôle muet est pire que pas de contrôle : la docstring
// d'`useT` promet qu'il signale ce piège, et on s'y fiait.
// Un COMPOSANT DE CLASSE ne peut pas appeler de hook : React impose la classe aux frontières
// d'erreur (`componentDidCatch` n'existe pas sur une fonction). Nommé ici plutôt que toléré en
// silence — sans quoi cet avertissement resterait allumé pour toujours et on apprendrait à ne
// plus le lire, ce qui a déjà tué trois contrôles de ce fichier.
const ABONNEMENT_IMPOSSIBLE = ['src/components/ui/ErrorBoundary.tsx'];
const sansAbonnement = [];
for (const f of fichiers) {
  if (!f.endsWith('.tsx')) continue;
  const relatifT = path.relative(RACINE, f).split(path.sep).join('/');
  if (ABONNEMENT_IMPOSSIBLE.includes(relatifT)) continue;
  const contenu = fs.readFileSync(f, 'utf8');
  const importeT = /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*i18n(?:\/traduire)?'/.test(contenu);
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
