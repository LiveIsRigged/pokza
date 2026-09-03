// Le fondu du bas d'une zone qui défile.
// ─────────────────────────────────────
// Le 03/09/2026, la première proposition pour signaler qu'un formulaire continue sous le bouton
// reposait sur la COUTURE : réordonner les sections de l'étape 1 pour que le bas de la lucarne
// tranche une rangée de pastilles en travers. Victor a demandé si ça tenait vraiment, vu que la
// coupe dépend de l'écran et du nombre de joueurs. Rejoué sur sept combinaisons réelles : la
// lucarne va de 158 à 451 px et la coupe tombe DEUX FOIS SUR SEPT exactement sur une frontière de
// section — écran d'apparence terminée. La couture est un accident, pas une propriété.
//
// D'où `debordement.ts`, qui ne regarde plus la géométrie du contenu mais seulement trois nombres.
// Ce que ce test protège, et qui ne se verrait pas à la relecture :
//
//   1. LE SILENCE TANT QUE RIEN N'EST MESURÉ. Un fondu affiché « au cas où » promet une suite qui
//      n'existe pas. Zéro veut dire « pas encore mesuré », jamais « pas de contenu ».
//   2. LE SILENCE EN BAS DE COURSE. Un fondu qui reste allumé une fois tout lu ment aussi.
//   3. LE RÉSIDU D'UN PIXEL, sinon le fondu clignote sur les arrondis d'arrivée.
//   4. LE REBOND ÉLASTIQUE d'iOS, qui envoie des positions au-delà de la fin — et sous zéro en
//      haut de course.
//   5. `fusionner` RENVOIE L'ANCIEN OBJET quand rien ne change : c'est ce qui évite soixante
//      rendus par seconde de l'écran entier, table comprise. Un test de RÉFÉRENCE, pas d'égalité.
//
// ⚠️ Ce test ne dit RIEN du câblage. La leçon de la v1 du correctif clavier, le même jour : un
// garde-fou qui comparait un nombre à lui-même n'a jamais été franchi une seule fois, en silence,
// et ni `tsc` ni les tests ne pouvaient le voir. Le fondu se vérifie sur l'appareil.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/debordement.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-debordement.js

const {
  debordeSousLePli,
  resteSousLePli,
  fusionner,
  RESIDU_TOLERE,
  MESURE_VIERGE,
} = require('./cm/creator/debordement.js');

let ok = 0;
const echecs = [];
function eq(nom, obtenu, attendu) {
  if (obtenu === attendu) ok++;
  else echecs.push(`${nom}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
}
const vrai = (nom, cond) => eq(nom, cond, true);
const faux = (nom, cond) => eq(nom, cond, false);
const m = (contenu, lucarne, position) => ({ contenu, lucarne, position });

// ── 1. Le silence tant que rien n'est mesuré ───────────────────────────────────────────────────
faux('mesure vierge : pas de fondu', debordeSousLePli(MESURE_VIERGE));
faux('lucarne pas encore posée (contenu seul)', debordeSousLePli(m(1280, 0, 0)));
faux('contenu pas encore mesuré (lucarne seule)', debordeSousLePli(m(0, 429, 0)));
faux('les deux à zéro', debordeSousLePli(m(0, 0, 0)));
eq('rien de mesuré → reste nul', resteSousLePli(MESURE_VIERGE), 0);
eq('lucarne seule → reste nul et non négatif', resteSousLePli(m(0, 429, 0)), 0);

// Ce qui arrive vraiment sous react-native-web quand une source manque : des nombres non finis.
faux('contenu NaN', debordeSousLePli(m(NaN, 429, 0)));
faux('lucarne NaN', debordeSousLePli(m(1280, NaN, 0)));
faux('position NaN', debordeSousLePli(m(1280, 429, NaN)));
faux('lucarne infinie', debordeSousLePli(m(1280, Infinity, 0)));
eq('un NaN ne fabrique pas un reste', resteSousLePli(m(1280, NaN, 0)), 0);

// ── 2. Le cas de l'étape 1, sur les sept combinaisons réellement calculées ─────────────────────
// La lucarne = bande visible − 211 (chrome fixe + zone sûre) − hauteur de table. Le formulaire de
// l'étape 1 mesure 1 280 px, relevés le 02/09/2026.
const FORMULAIRE = 1280;
const LUCARNES = [
  ['SE, 10 joueurs', 158],
  ['SE, 6 joueurs', 237],
  ['iPhone 14, 10 joueurs', 274],
  ['Pro Max, 10 joueurs', 350],
  ['iPhone 14, 6 joueurs', 353],
  ['iPhone de Victor, 6 joueurs', 429],
  ['Pro Max, 3 joueurs', 451],
];
for (const [nom, lucarne] of LUCARNES) {
  vrai(`${nom} (lucarne ${lucarne}) : le fondu s'allume en haut de course`, debordeSousLePli(m(FORMULAIRE, lucarne, 0)));
  faux(`${nom} : il s'éteint en bas de course`, debordeSousLePli(m(FORMULAIRE, lucarne, FORMULAIRE - lucarne)));
  eq(`${nom} : reste caché en haut de course`, resteSousLePli(m(FORMULAIRE, lucarne, 0)), FORMULAIRE - lucarne);
}
// LE TÉMOIN DE LA COUTURE : c'est ce que le fondu remplace.
//
// Frontières de RANGÉE de l'ordre proposé, cumulées depuis le haut du formulaire (label 36 px,
// rangée de pastilles 43, champ 47) — et non frontières de section : une coupe qui tombe à la fin
// d'une rangée de pastilles a exactement le même effet, rien ne dépasse.
//   Type 0-36-79 · Variante 79-115-158 · Blindes 158-194-237-284 · Stack 284-320-367
//   Nombre 367-403-446 · Position 446-482-525
const FRONTIERES = [36, 79, 115, 158, 194, 237, 284, 320, 367, 403, 446, 482, 525];
const surUneFrontiere = LUCARNES.filter(([, l]) => FRONTIERES.includes(l)).map(([nom]) => nom);
eq('deux des sept lucarnes tombent pile sur une frontière de rangée', surUneFrontiere.length, 2);
vrai('ce sont bien le SE à 10 joueurs (158) et le SE à 6 (237)',
  surUneFrontiere.join(' | ') === 'SE, 10 joueurs | SE, 6 joueurs');
// Et sur ces deux-là, le fondu s'allume quand même — c'est tout l'intérêt.
for (const [nom, lucarne] of LUCARNES.filter(([, l]) => FRONTIERES.includes(l))) {
  vrai(`${nom} : coupe invisible, mais le fondu parle`, debordeSousLePli(m(FORMULAIRE, lucarne, 0)));
}

// ── 3. Le bas de course, et le résidu d'un pixel ───────────────────────────────────────────────
eq('le résidu toléré vaut bien un pixel', RESIDU_TOLERE, 1);
faux('exactement en bas', debordeSousLePli(m(1280, 429, 851)));
faux('un pixel avant la fin : dans le résidu, on se tait', debordeSousLePli(m(1280, 429, 850)));
vrai('deux pixels avant la fin : on parle', debordeSousLePli(m(1280, 429, 849)));
faux('arrondi fractionnaire d’arrivée (0,5 px de reste)', debordeSousLePli(m(1280.5, 429, 851)));
faux('contenu plus court que la lucarne : rien ne déborde', debordeSousLePli(m(300, 429, 0)));
eq('contenu plus court : reste nul', resteSousLePli(m(300, 429, 0)), 0);
faux('contenu exactement de la taille de la lucarne', debordeSousLePli(m(429, 429, 0)));

// ── 4. Le rebond élastique d'iOS ───────────────────────────────────────────────────────────────
faux('tiré au-delà de la fin (rebond bas)', debordeSousLePli(m(1280, 429, 900)));
eq('rebond bas : le reste ne devient pas négatif', resteSousLePli(m(1280, 429, 900)), 0);
vrai('tiré au-dessus du haut (rebond haut)', debordeSousLePli(m(1280, 429, -60)));
eq('rebond haut : le reste ne dépasse pas le contenu caché réel de plus que le tirage',
  resteSousLePli(m(1280, 429, -60)), 1280 - 429 + 60);

// ── 5. `fusionner` : l'ancien objet quand rien ne change ───────────────────────────────────────
const base = m(1280, 429, 0);
vrai('même position → MÊME objet (référence)', fusionner(base, { position: 0 }) === base);
vrai('part vide → même objet', fusionner(base, {}) === base);
vrai('trois valeurs identiques → même objet', fusionner(base, { contenu: 1280, lucarne: 429, position: 0 }) === base);
faux('position différente → nouvel objet', fusionner(base, { position: 12 }) === base);
eq('la valeur fusionnée est bien reprise', fusionner(base, { position: 12 }).position, 12);
eq('les autres champs survivent à la fusion', fusionner(base, { position: 12 }).contenu, 1280);
eq('une partie seule ne touche pas au reste', fusionner(base, { contenu: 1400 }).lucarne, 429);
vrai('l’objet d’origine n’est pas modifié', base.position === 0);
// Le cas exact d'`onScroll` : soixante appels par seconde, dont un seul change quelque chose.
let courante = base;
let nouveaux = 0;
for (let i = 0; i < 60; i++) {
  const suite = fusionner(courante, { contenu: 1280, lucarne: 429, position: 0 });
  if (suite !== courante) nouveaux++;
  courante = suite;
}
eq('soixante événements sur un écran immobile ne créent aucun objet', nouveaux, 0);

// ── 6. Une zone qui grandit sous le doigt (une section qui se déplie) ──────────────────────────
faux('avant le dépliement, tout tient', debordeSousLePli(m(400, 429, 0)));
vrai('après le dépliement, ça déborde', debordeSousLePli(m(700, 429, 0)));
faux('replié, le fondu repart', debordeSousLePli(m(400, 429, 0)));

// ── Résultat ───────────────────────────────────────────────────────────────────────────────────
console.log(`\n${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
