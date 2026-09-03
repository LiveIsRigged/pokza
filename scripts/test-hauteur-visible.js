// L'app tient dans la bande visible quand le clavier est là — et SEULEMENT là.
// ────────────────────────────────────────────────────────────────────────────
// Ce fichier existe parce que la PREMIÈRE version du correctif ne s'est jamais déclenchée, et que
// rien ne l'a signalé : ni le compilateur, ni les tests d'alors, ni l'app. Elle a été déployée,
// Victor a testé, et « rien n'a changé ». Il a fallu une sonde sur son iPhone pour comprendre.
//
// LES DEUX FAITS MESURÉS LE 03/09/2026 (iPhone de Victor, mode application)
//   • Au repos la bande visible fait 873 px ; clavier ouvert, 487. Il en manque 386.
//   • `window.innerHeight` vaut 487 LUI AUSSI clavier ouvert. Sur iOS il suit la bande visible,
//     pas la fenêtre de mise en page.
//
// Ce que ce test protège, et qui ne se verrait pas à la relecture :
//
//   1. LE GARDE-FOU NE SE COMPARE PLUS À `innerHeight`. C'est l'erreur exacte de la v1 : l'écart
//      valait toujours zéro, donc le seuil de 120 px désactivait tout, en silence. La référence
//      est `hauteurAuRepos`. Le témoin du § 2 rejoue le piège.
//   2. ON RÉTRÉCIT DÈS LE TOUCHER, PAS APRÈS LA MESURE. Safari pose son décalage à 89 ms, avant le
//      premier `resize`. `hauteurAnticipee` existe pour ça, et elle doit rogner GÉNÉREUSEMENT :
//      trop rogner laisse une bande de fond 90 ms, pas assez fait glisser la page.
//   3. CE QUI N'EST PAS UN CLAVIER N'ENGAGE PAS. La barre d'adresse Safari va et vient au moindre
//      défilement dans un onglet ; si elle passait le seuil, l'app changerait de hauteur pendant
//      toute la lecture du feed.
//   4. ON NE POSE JAMAIS UNE HAUTEUR ABSURDE. Un plancher : sous 200 px il n'y a plus d'app.
//   5. LA SORTIE ACCOMPAGNE LE CLAVIER. Rendre la hauteur dès la perte du focus rejouerait le
//      défaut pendant les ~250 ms de l'animation de fermeture.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/web/hauteurVisible.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-hauteur-visible.js

const {
  hauteurAAppliquer, hauteurAnticipee,
  RETRAIT_MINIMUM, ECHELLE_MAX, PART_CLAVIER_PAR_DEFAUT, HAUTEUR_PLANCHER,
} = require('./cm/web/hauteurVisible.js');

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

// Les chiffres de l'iPhone de Victor, relevés le 03/09/2026.
const REPOS = 873;
const AVEC_CLAVIER = 487;
const CLAVIER = REPOS - AVEC_CLAVIER; // 386

const etat = (o) => ({
  hauteurAuRepos: REPOS,
  hauteurVisible: REPOS,
  echelle: 1,
  champFocalise: false,
  ...o,
});

// ── 1. L'appareil réellement mesuré ────────────────────────────────────────────────────────────
eq(
  'iPhone de Victor, clavier ouvert dans un champ → on cale sur 487',
  hauteurAAppliquer(etat({ hauteurVisible: AVEC_CLAVIER, champFocalise: true }), false),
  AVEC_CLAVIER,
);
eq(
  'le même au repos, aucun champ focalisé → aucune hauteur',
  hauteurAAppliquer(etat({}), false),
  null,
);
vrai(
  `le clavier mesuré (${CLAVIER} px) dépasse bien le seuil (${RETRAIT_MINIMUM})`,
  CLAVIER > RETRAIT_MINIMUM,
);

// ── 2. LE PIÈGE DE LA v1, REJOUÉ ───────────────────────────────────────────────────────────────
// TÉMOIN. Sur iOS, `window.innerHeight` suit la bande visible : clavier ouvert, il vaut 487, comme
// `visualViewport.height`. La v1 en faisait sa référence, l'écart valait donc toujours zéro, et le
// correctif ne s'est JAMAIS déclenché. Ici la référence est la mesure AU REPOS — et elle engage.
const commeLaV1 = AVEC_CLAVIER - AVEC_CLAVIER; // ce que la v1 calculait vraiment : 0
vrai(
  'la formule de la v1 donnait bien un écart nul (d’où le silence)',
  commeLaV1 === 0 && commeLaV1 < RETRAIT_MINIMUM,
);
eq(
  'avec la bonne référence, le même instant engage',
  hauteurAAppliquer(
    etat({ hauteurAuRepos: REPOS, hauteurVisible: AVEC_CLAVIER, champFocalise: true }),
    false,
  ),
  AVEC_CLAVIER,
);
// Et le corollaire : si la référence au repos était fausse (recopiée de la mesure du moment),
// on retomberait dans le silence. C'est exactement ce qu'il ne faut plus jamais écrire.
eq(
  'référence au repos égale à la mesure du moment → rien, comme la v1',
  hauteurAAppliquer(
    etat({ hauteurAuRepos: AVEC_CLAVIER, hauteurVisible: AVEC_CLAVIER, champFocalise: true }),
    false,
  ),
  null,
);

// ── 3. Rétrécir dès le toucher ─────────────────────────────────────────────────────────────────
eq(
  'clavier déjà mesuré sur cet appareil → on vise juste',
  hauteurAnticipee(REPOS, CLAVIER),
  AVEC_CLAVIER,
);
// Premier toucher de la vie de l'app : aucune mesure, on devine.
const devine = hauteurAnticipee(REPOS, 0);
eq(
  'aucune mesure → on rogne la part par défaut',
  devine,
  REPOS - Math.round(REPOS * PART_CLAVIER_PAR_DEFAUT),
);
vrai(
  `la devinette (${devine}) rogne PLUS que le vrai clavier (${AVEC_CLAVIER})`,
  devine < AVEC_CLAVIER,
  'trop rogner ne fait jamais glisser la page ; pas assez, si',
);
// Une valeur retenue absurde (un vieux stockage, une autre orientation) ne doit pas être suivie.
eq(
  'valeur retenue sous le seuil → ignorée, on revient à la devinette',
  hauteurAnticipee(REPOS, 40),
  devine,
);
eq('hauteur au repos absurde → aucune anticipation', hauteurAnticipee(0, CLAVIER), null);
eq('hauteur au repos NaN → aucune anticipation', hauteurAnticipee(NaN, CLAVIER), null);

// ── 4. Le plancher ─────────────────────────────────────────────────────────────────────────────
// Un très petit écran, ou un clavier retenu démesuré, ne doit pas réduire l'app à rien.
vrai(
  'anticipation sur un petit écran : jamais sous le plancher',
  hauteurAnticipee(400, 380) >= HAUTEUR_PLANCHER,
  `obtenu ${hauteurAnticipee(400, 380)}`,
);
vrai(
  'mesure aberrante : jamais sous le plancher',
  hauteurAAppliquer(etat({ hauteurVisible: 30, champFocalise: true }), false) >= HAUTEUR_PLANCHER,
);

// ── 5. Ce qui n'est pas un clavier ─────────────────────────────────────────────────────────────
for (const barre of [44, 50, 60, 70, 80, 100, 119]) {
  eq(
    `barre d'adresse de ${barre} px, champ focalisé → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurVisible: REPOS - barre, champFocalise: true }), false),
    null,
  );
}
vrai(
  `le seuil (${RETRAIT_MINIMUM}) est au-dessus de la plus grande barre d'adresse (80)`,
  RETRAIT_MINIMUM > 80,
);
vrai(
  `le seuil (${RETRAIT_MINIMUM}) est sous le plus petit clavier iOS (216, iPhone SE)`,
  RETRAIT_MINIMUM < 216,
);
eq(
  'retrait exactement au seuil → on engage',
  hauteurAAppliquer(etat({ hauteurVisible: REPOS - RETRAIT_MINIMUM, champFocalise: true }), false),
  REPOS - RETRAIT_MINIMUM,
);
eq(
  'un pixel sous le seuil → on n’engage pas',
  hauteurAAppliquer(etat({ hauteurVisible: REPOS - RETRAIT_MINIMUM + 1, champFocalise: true }), false),
  null,
);
// Ordinateur : ouvrir un champ ne rétrécit rien.
eq(
  'ordinateur, champ focalisé, aucun retrait → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: REPOS, champFocalise: true }), false),
  null,
);

// ── 6. La sortie ───────────────────────────────────────────────────────────────────────────────
eq(
  'focus perdu, clavier encore là, déjà engagé → on reste calé',
  hauteurAAppliquer(etat({ hauteurVisible: AVEC_CLAVIER, champFocalise: false }), true),
  AVEC_CLAVIER,
);
eq(
  'focus perdu, clavier à mi-course, déjà engagé → on suit',
  hauteurAAppliquer(etat({ hauteurVisible: 700, champFocalise: false }), true),
  700,
);
eq(
  'focus perdu, clavier parti, déjà engagé → on rend la main',
  hauteurAAppliquer(etat({ hauteurVisible: REPOS, champFocalise: false }), true),
  null,
);
// TÉMOIN, le garde-fou le plus important : sans focus ET sans engagement, la même bande réduite ne
// doit RIEN déclencher — sinon une barre d'outils système écraserait l'app en pleine lecture.
eq(
  'aucun focus, aucun engagement, bande pourtant réduite → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: AVEC_CLAVIER, champFocalise: false }), false),
  null,
);

// ── 7. Page zoomée ─────────────────────────────────────────────────────────────────────────────
eq(
  'page zoomée à 2× avec un champ focalisé → aucune hauteur',
  hauteurAAppliquer(etat({ hauteurVisible: 436, echelle: 2, champFocalise: true }), false),
  null,
);
eq(
  'page zoomée alors qu’on était engagé → on rend la main',
  hauteurAAppliquer(etat({ hauteurVisible: 436, echelle: 2, champFocalise: true }), true),
  null,
);
eq(
  'micro-écart d’échelle toléré (arrondi) → on engage quand même',
  hauteurAAppliquer(etat({ hauteurVisible: AVEC_CLAVIER, echelle: ECHELLE_MAX, champFocalise: true }), false),
  AVEC_CLAVIER,
);

// ── 8. Mesures aberrantes ──────────────────────────────────────────────────────────────────────
for (const [nom, mesure] of [['NaN', NaN], ['zéro', 0], ['négative', -10]]) {
  eq(
    `hauteur visible ${nom} → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurVisible: mesure, champFocalise: true }), true),
    null,
  );
  eq(
    `hauteur au repos ${nom} → aucune hauteur`,
    hauteurAAppliquer(etat({ hauteurAuRepos: mesure, hauteurVisible: AVEC_CLAVIER, champFocalise: true }), true),
    null,
  );
}

// ── 9. Toujours un entier ──────────────────────────────────────────────────────────────────────
// Safari renvoie des hauteurs fractionnaires (487.3333). Un `px` fractionnaire sur la racine fait
// apparaître un liseré d'un demi-pixel en bas de l'app sur certains écrans.
vrai(
  'la valeur rendue est toujours entière',
  [487.3333, 508.6, 700.5].every((h) =>
    Number.isInteger(hauteurAAppliquer(etat({ hauteurVisible: h, champFocalise: true }), false))),
);
vrai(
  'l’anticipation est toujours entière',
  [873, 812.5, 667.25].every((h) => Number.isInteger(hauteurAnticipee(h, 0))),
);

// ── Résultat ───────────────────────────────────────────────────────────────────────────────────
console.log(`\nSeuil ${RETRAIT_MINIMUM} px · plancher ${HAUTEUR_PLANCHER} px · part par défaut ${PART_CLAVIER_PAR_DEFAUT}.`);
console.log(`${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
