// L'app tient dans la bande visible quand le clavier est là — et SEULEMENT là.
// ────────────────────────────────────────────────────────────────────────────
// Signalé par Victor le 02/09/2026 : ouvrir « Relancer » fait remonter tout l'écran. Le correctif
// cale la racine sur `visualViewport.height`. Il est efficace — et c'est justement pour ça qu'il
// est dangereux : s'il s'engage quand il ne faut pas, il écrase l'app à une hauteur arbitraire, sur
// N'IMPORTE QUEL écran de l'app. Ce fichier tient les garde-fous.
//
// Ce que ce test protège, et qui ne se verrait pas à la relecture :
//
//   1. LES MESURES RÉELLES. 932/569 sur l'iPhone de Victor, 844/508 sur un iPhone 14. Ce sont les
//      deux seuls chiffres qu'on ait constatés sur du vrai matériel ; ils doivent engager.
//   2. CE QUI N'EST PAS UN CLAVIER N'ENGAGE PAS. La barre d'adresse Safari va et vient au moindre
//      défilement dans un onglet. Si elle passait le seuil, l'app changerait de hauteur en
//      permanence pendant la lecture du feed — un défaut bien pire que celui qu'on corrige.
//   3. LE SEUIL SÉPARE VRAIMENT LES DEUX FAMILLES. Un invariant sur la constante elle-même : entre
//      la plus grande barre d'adresse (80 px) et le plus petit clavier iOS (216 px). Quelqu'un qui
//      l'abaisserait « pour attraper les petits claviers » ramènerait le cas 2.
//   4. LA SORTIE ACCOMPAGNE LE CLAVIER. Rendre la hauteur dès la perte du focus rejouerait le
//      défaut pendant les ~250 ms de l'animation de fermeture. C'est le rôle du drapeau `engage`,
//      et c'est la seule partie de la fonction qui n'est pas déductible de ses entrées.
//   5. ON NE S'ENGAGE JAMAIS SUR ORDINATEUR NI SUR ANDROID. Là-bas le clavier rétrécit la fenêtre
//      de mise en page (ou il n'y en a pas) : le retrait vaut 0, et ces plateformes — qui n'ont pas
//      le défaut — ne doivent pas être touchées.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/web/hauteurVisible.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-hauteur-visible.js

const { hauteurAAppliquer, RETRAIT_MINIMUM, ECHELLE_MAX } = require('./cm/web/hauteurVisible.js');

let ok = 0;
const echecs = [];
function eq(nom, obtenu, attendu) {
  if (obtenu === attendu) ok++;
  else echecs.push(`${nom}\n      attendu : ${attendu}\n      obtenu  : ${obtenu}`);
}
function vrai(nom, condition, detail) {
  if (condition) ok++;
  else echecs.push(`${nom}${detail ? `\n      ${detail}` : ''}`);
}

/** Un état de viewport, avec les valeurs « au repos » par défaut. */
const etat = (o) => ({
  hauteurVisible: 932,
  hauteurMiseEnPage: 932,
  echelle: 1,
  champFocalise: false,
  ...o,
});

// ── 1. Les deux appareils réellement mesurés ───────────────────────────────────────────────────
// L'iPhone de Victor, le 02/09/2026 : la fenêtre de mise en page ne bouge pas, la bande visible
// tombe de 932 à 569. C'est le cas qui a motivé tout ce fichier.
eq(
  'iPhone de Victor, clavier ouvert dans un champ → on cale sur 569',
  hauteurAAppliquer(etat({ hauteurVisible: 569, champFocalise: true }), false),
  569,
);
eq(
  'iPhone 14, clavier ouvert dans un champ → on cale sur 508',
  hauteurAAppliquer(etat({ hauteurVisible: 508, hauteurMiseEnPage: 844, champFocalise: true }), false),
  508,
);
// Les deux mêmes appareils, au repos : rien ne doit bouger.
eq(
  'iPhone de Victor, aucun champ focalisé → aucune hauteur',
  hauteurAAppliquer(etat({}), false),
  null,
);

// ── 2. La barre d'adresse ne doit JAMAIS engager ───────────────────────────────────────────────
// Dans un onglet Safari (pas la PWA), elle se rétracte au défilement : `visualViewport.height`
// grandit de 50 à 80 px puis rapetisse, en continu. Le pire cas mesuré est ~80 px.
for (const barre of [44, 50, 60, 70, 80, 100, 119]) {
  eq(
    `barre d'adresse de ${barre} px, champ focalisé → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurVisible: 932 - barre, champFocalise: true }), false),
    null,
  );
}
// Et même engagé : redescendre sous le seuil rend la main. C'est le chemin normal de sortie.
eq(
  "barre d'adresse de 80 px alors qu'on était engagé → on rend la main",
  hauteurAAppliquer(etat({ hauteurVisible: 852, champFocalise: true }), true),
  null,
);

// ── 3. Le seuil sépare les deux familles ───────────────────────────────────────────────────────
// TÉMOIN : la constante elle-même. Ces deux bornes viennent du monde réel, pas du code.
vrai(
  `le seuil (${RETRAIT_MINIMUM}) est au-dessus de la plus grande barre d'adresse (80)`,
  RETRAIT_MINIMUM > 80,
  `RETRAIT_MINIMUM = ${RETRAIT_MINIMUM}`,
);
vrai(
  `le seuil (${RETRAIT_MINIMUM}) est en dessous du plus petit clavier iOS (216, iPhone SE)`,
  RETRAIT_MINIMUM < 216,
  `RETRAIT_MINIMUM = ${RETRAIT_MINIMUM}`,
);
// La frontière exacte, des deux côtés : un retrait tout juste au seuil engage, un pixel de moins
// n'engage pas.
eq(
  'retrait exactement au seuil → on engage',
  hauteurAAppliquer(etat({ hauteurVisible: 932 - RETRAIT_MINIMUM, champFocalise: true }), false),
  932 - RETRAIT_MINIMUM,
);
eq(
  'retrait à un pixel sous le seuil → on n’engage pas',
  hauteurAAppliquer(etat({ hauteurVisible: 932 - RETRAIT_MINIMUM + 1, champFocalise: true }), false),
  null,
);

// ── 4. La sortie accompagne le clavier qui se referme ──────────────────────────────────────────
// Le champ vient de perdre le focus, le clavier met ~250 ms à redescendre. Tant qu'il est là, on
// reste calé : lâcher tout de suite rejouerait le défaut le temps de l'animation.
eq(
  'focus perdu, clavier encore à l’écran, déjà engagé → on reste calé',
  hauteurAAppliquer(etat({ hauteurVisible: 569, champFocalise: false }), true),
  569,
);
eq(
  'focus perdu, clavier à mi-course, déjà engagé → on suit',
  hauteurAAppliquer(etat({ hauteurVisible: 750, champFocalise: false }), true),
  750,
);
eq(
  'focus perdu, clavier parti, déjà engagé → on rend la main',
  hauteurAAppliquer(etat({ hauteurVisible: 932, champFocalise: false }), true),
  null,
);
// TÉMOIN, et c'est le garde-fou le plus important du lot : sans focus et sans engagement, la
// même mesure ne doit RIEN déclencher. Sinon n'importe quel rétrécissement de la fenêtre visible
// (une extension, une barre d'outils, un panneau du navigateur) écraserait l'app.
eq(
  'aucun focus, aucun engagement, bande pourtant réduite → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: 569, champFocalise: false }), false),
  null,
);

// ── 5. Ordinateur et Android : jamais d'engagement ─────────────────────────────────────────────
// Sur un ordinateur, ouvrir un champ ne rétrécit rien du tout.
eq(
  'ordinateur, champ focalisé, aucun retrait → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: 900, hauteurMiseEnPage: 900, champFocalise: true }), false),
  null,
);
// Sur les navigateurs Android qui rétrécissent la fenêtre de MISE EN PAGE, les deux mesures
// tombent ensemble : le retrait reste nul, et le comportement natif — déjà correct — est préservé.
eq(
  'Android qui rétrécit la mise en page → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: 500, hauteurMiseEnPage: 500, champFocalise: true }), false),
  null,
);

// ── 6. Page zoomée ─────────────────────────────────────────────────────────────────────────────
// `visualViewport.height` devient la hauteur de la loupe. S'y caler écraserait l'app.
eq(
  'page zoomée à 2× avec un champ focalisé → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: 466, echelle: 2, champFocalise: true }), false),
  null,
);
eq(
  'page zoomée alors qu’on était engagé → on rend la main',
  hauteurAAppliquer(etat({ hauteurVisible: 466, echelle: 2, champFocalise: true }), true),
  null,
);
// Le zoom automatique de Safari sur un champ à petite fonte s'arrête bien avant 1,05 en pratique ;
// la tolérance existe pour les arrondis de `scale`, pas pour laisser passer un vrai zoom.
eq(
  'micro-écart d’échelle toléré (arrondi) → on engage quand même',
  hauteurAAppliquer(etat({ hauteurVisible: 569, echelle: ECHELLE_MAX, champFocalise: true }), false),
  569,
);

// ── 7. Mesures aberrantes ──────────────────────────────────────────────────────────────────────
// `visualViewport` renvoie NaN le temps d'un changement d'orientation, et 0 dans certains onglets
// en arrière-plan. Poser `height: NaNpx` ou `0px` ferait disparaître l'app.
for (const [nom, mesure] of [['NaN', NaN], ['zéro', 0], ['négative', -10]]) {
  eq(
    `hauteur visible ${nom} → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurVisible: mesure, champFocalise: true }), true),
    null,
  );
  eq(
    `hauteur de mise en page ${nom} → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurMiseEnPage: mesure, hauteurVisible: 569, champFocalise: true }), true),
    null,
  );
}

// ── 8. La hauteur posée est toujours un entier ─────────────────────────────────────────────────
// Safari renvoie des hauteurs fractionnaires (569.3333). Un `px` fractionnaire sur la racine fait
// apparaître un liseré d'un demi-pixel en bas de l'app sur certains écrans.
eq(
  'hauteur fractionnaire → arrondie',
  hauteurAAppliquer(etat({ hauteurVisible: 569.3333, champFocalise: true }), false),
  569,
);
vrai(
  'la valeur rendue est toujours entière',
  [569.3333, 508.6, 700.5].every((h) => {
    const px = hauteurAAppliquer(etat({ hauteurVisible: h, champFocalise: true }), false);
    return Number.isInteger(px);
  }),
);

// ── Résultat ───────────────────────────────────────────────────────────────────────────────────
console.log(`\nSeuil de retrait : ${RETRAIT_MINIMUM} px. Échelle maximale : ${ECHELLE_MAX}.`);
console.log(`${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
