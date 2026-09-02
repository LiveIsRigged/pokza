// Le sélecteur de cartes : les 13 rangs, sans défilement, sur TOUTES les largeurs.
// ──────────────────────────────────────────────────────────────────────────────
// Constat 4 de l'audit du 01/09/2026. Avant ce test, la carte était figée à 44 px et le contenu
// mesurait 644 px pour 354 visibles : six rangs sur treize (7 6 5 4 3 2) vivaient derrière un
// défilement horizontal, sur le geste le plus répété du créateur.
//
// Ce que ce test tient — et que la relecture du code ne dit pas :
//
//   1. LA RANGÉE NE DÉBORDE JAMAIS. C'est l'invariant, et il vaut pour toute largeur d'écran, pas
//      seulement pour l'iPhone de référence. Une constante changée « pour faire respirer » qui
//      remettrait le défilement sur un SE se verrait ici.
//   2. LA CIBLE TACTILE NE DESCEND PLUS. 44 px en hauteur — la recommandation — sur tous les écrans.
//      La largeur, elle, passe dessous : c'est le compromis assumé (l'erreur est visible sur le
//      feutre et se répare d'un second toucher).
//   3. UNE CARTE NE RÉTRÉCIT PAS QUAND L'ÉCRAN GRANDIT. Une monotonie évidente, et exactement le
//      genre de chose qu'un `Math.floor` mal placé casse en silence.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/grilleCartes.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-selecteur-cartes.js

const G = require('./cm/creator/grilleCartes.js');

/** Les 18 px de rembourrage de `WizardScreen`, de chaque côté : la place RÉELLEMENT disponible. */
const INSET_REEL = 36;

/** Largeurs de fenêtre à couvrir : des vrais téléphones, du plus étroit au plus large, plus deux
 *  tablettes. 320 est le SE de première génération — le pire cas encore concevable. */
const LARGEURS = [320, 360, 375, 390, 393, 402, 414, 428, 430, 440, 500, 600, 768, 1024];

let ko = 0;
function vrai(titre, condition, details = '') {
  if (!condition) ko++;
  console.log(`${condition ? '  ok  ' : '  KO  '} ${titre}${condition ? '' : `\n         ${details}`}`);
}
function eq(titre, obtenu, attendu) {
  vrai(`${titre} : ${obtenu}`, obtenu === attendu, `obtenu ${obtenu} · attendu ${attendu}`);
}

console.log('\n— Les 13 rangs entrent, quelle que soit la largeur —');
for (const w of LARGEURS) {
  const g = G.grilleCartes(w);
  const dispo = w - INSET_REEL;
  vrai(
    `${w} px : carte ${g.largeur}×${G.CARD_HEIGHT}, écart ${g.gap.toFixed(2)} → contenu ${g.contenu.toFixed(0)} ≤ ${dispo}`,
    g.contenu <= dispo,
    `déborde de ${(g.contenu - dispo).toFixed(1)} px : le défilement revient`
  );
}

console.log('\n— Les relevés de référence, en dur —');
// Ces trois-là sont des RELEVÉS, pas des attendus recalculés : ce sont les valeurs tranchées le
// 01/09 (« carte ≈ 24 px »). Si une constante bouge, c'est cette ligne qui doit le dire.
eq('iPhone 14 (390) — la largeur de référence', G.grilleCartes(390).largeur, 24);
eq('iPhone SE (375) — le plus étroit des téléphones courants', G.grilleCartes(375).largeur, 23);
eq('un écran large retrouve la carte d’avant', G.grilleCartes(768).largeur, G.CARD_MAX_WIDTH);

console.log('\n— Les invariants —');
eq('la cible tactile garde ses 44 px de haut', G.CARD_HEIGHT, 44);
vrai(
  'une carte ne dépasse jamais sa taille d’origine',
  LARGEURS.every((w) => G.grilleCartes(w).largeur <= G.CARD_MAX_WIDTH),
  'le sélecteur ne doit pas devenir plus gros qu’il ne l’était'
);
vrai(
  'une carte ne rétrécit pas quand l’écran grandit',
  LARGEURS.every((w, i) => i === 0 || G.grilleCartes(w).largeur >= G.grilleCartes(LARGEURS[i - 1]).largeur),
  'monotonie cassée — un arrondi mal placé'
);
vrai(
  'l’écart entre deux cartes reste visible',
  LARGEURS.every((w) => G.grilleCartes(w).gap >= 3),
  'sous 3 px, deux cartes voisines se lisent comme une seule'
);
vrai(
  'le rang reste lisible partout',
  LARGEURS.every((w) => G.grilleCartes(w).tailleRang >= 13),
  'une lettre sous 13 px ne se lit plus d’un coup d’œil'
);
vrai(
  'les quatre rangées tiennent dans moins de place qu’avant',
  4 * (G.CARD_HEIGHT + G.ROW_GAP) < 4 * (58 + 6),
  `${4 * (G.CARD_HEIGHT + G.ROW_GAP)} px contre ${4 * (58 + 6)} avant`
);

console.log(
  `\n${ko === 0 ? '🎉 tout passe' : `${ko} échec(s)`} — plus un seul rang derrière un défilement.\n`
);
process.exit(ko === 0 ? 0 : 1);
