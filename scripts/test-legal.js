// Les textes légaux et leur traduction : ce qui les empêche de diverger en silence.
// ──────────────────────────────────────────────────────────────────────────────
// Un catalogue d'interface se rattrape : une clé manquante retombe sur l'anglais, et l'audit la
// signale. UN DOCUMENT LÉGAL, NON. Ajouter un paragraphe au français sans l'ajouter à l'anglais ne
// casse rien, ne s'affiche nulle part, et fait simplement disparaître une clause pour les lecteurs
// anglophones — indéfiniment. C'est le seul endroit du chantier où une divergence a des
// conséquences hors de l'app.
//
// Ce que ce script protège :
//   1. les MÊMES documents, dans le MÊME ordre — l'index est le même des deux côtés ;
//   2. la MÊME structure de sections, à une près : la traduction porte en plus, en tête de chaque
//      document, la clause de primauté du français, qui est ce qui rend cette traduction possible ;
//   3. le MÊME nombre de paragraphes par section — un paragraphe perdu est une clause perdue ;
//   4. les MÊMES puces au même endroit (une énumération tronquée change le sens d'une liste
//      d'interdits ou de bases légales) ;
//   5. la clause de primauté EN TÊTE de chaque document traduit, jamais ailleurs, jamais absente.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/legal/legalContent.ts \
//     pokza-app/src/legal/legalContent.en.ts \
//     --outDir scripts/legal --module commonjs --target es2021 --rootDir pokza-app/src \
//     --resolveJsonModule --skipLibCheck
// puis : node scripts/test-legal.js

const { LEGAL_DOCS_FR } = require('./legal/legal/legalContent');
const { LEGAL_DOCS_EN } = require('./legal/legal/legalContent.en');

let echecs = 0;
function verifier(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log(`    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`);
}
function affirmer(nom, condition, detail) {
  if (!condition) echecs++;
  console.log(`${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) console.log(`    ${detail}`);
}

verifier('mêmes documents, même ordre', LEGAL_DOCS_EN.map((d) => d.id), LEGAL_DOCS_FR.map((d) => d.id));

for (const frDoc of LEGAL_DOCS_FR) {
  const enDoc = LEGAL_DOCS_EN.find((d) => d.id === frDoc.id);
  if (!enDoc) { echecs++; console.log(`✗ « ${frDoc.id} » n'existe pas en anglais`); continue; }

  // La clause de primauté est la PREMIÈRE section, sans titre, et elle n'existe qu'en tête.
  const tete = enDoc.sections[0];
  affirmer(`${frDoc.id} : clause de primauté en tête`,
    tete && !tete.heading && tete.body.length === 1 && /French version .*prevails/i.test(tete.body[0]),
    `première section : ${JSON.stringify(tete)}`);

  const suite = enDoc.sections.slice(1);
  verifier(`${frDoc.id} : nombre de sections`, suite.length, frDoc.sections.length);

  frDoc.sections.forEach((sectionFr, i) => {
    const sectionEn = suite[i];
    if (!sectionEn) return; // déjà signalé par le compte ci-dessus
    affirmer(`${frDoc.id} §${i + 1} : titre présent des deux côtés ou d'aucun`,
      Boolean(sectionFr.heading) === Boolean(sectionEn.heading),
      `fr : ${JSON.stringify(sectionFr.heading)} / en : ${JSON.stringify(sectionEn.heading)}`);
    verifier(`${frDoc.id} §${i + 1} : nombre de paragraphes`, sectionEn.body.length, sectionFr.body.length);
    // Les puces : une énumération tronquée change le sens d'une liste d'interdits.
    verifier(`${frDoc.id} §${i + 1} : puces au même endroit`,
      sectionEn.body.map((p) => p.startsWith('•')),
      sectionFr.body.map((p) => p.startsWith('•')));
  });
}

// Aucun paragraphe vide : une chaîne oubliée passerait tous les comptes ci-dessus.
for (const [langue, docs] of [['fr', LEGAL_DOCS_FR], ['en', LEGAL_DOCS_EN]]) {
  const vides = docs.flatMap((d) =>
    d.sections.flatMap((s, i) => s.body.filter((p) => !p.trim()).map(() => `${d.id} §${i + 1}`))
  );
  affirmer(`${langue} : aucun paragraphe vide`, vides.length === 0, vides.join(', '));
}

console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
