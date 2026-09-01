// Déplacer les joueurs à table : décalage d'un cran, échange, effacement.
// ──────────────────────────────────────────────────────────────────────
// Ce que ce script tient, et qui ne se voit à la relecture d'aucun des trois écrans concernés :
//
//   1. LE SENS DU DÉCALAGE. « Le bouton a tourné » veut dire que tout le monde RECULE d'un cran
//      dans l'ordre de parole (celui qui était SB devient BTN). Le sens inverse est une erreur
//      silencieuse : la table reste plausible, elle est simplement fausse d'un siège — et personne
//      ne le verra jamais en relisant la main publiée.
//   2. L'ASYMÉTRIE NOM / TAPIS. Les tapis sont indexés par position POUR TOUT LE MONDE, héros
//      compris ; les noms d'adversaires seulement pour les adversaires (le héros a `heroName`, à
//      part). Traiter les deux pareil laisse le tapis du héros sur la chaise qu'il quitte.
//   3. LE NOM FANTÔME. Un nom écrit à une place que le héros occupe ensuite reste STOCKÉ sans être
//      affiché. Le déplacer le ferait apparaître ailleurs — un joueur surgi de nulle part dans une
//      main publiée. Les trois fonctions doivent le laisser tomber.
//   4. CE QUI NE DOIT PAS BOUGER : straddle, ante, blindes, nombre de joueurs. La chaise straddle,
//      pas la personne.
//
// Les vérifications passent par `buildSeats` partout où c'est possible : ce qui compte n'est pas la
// forme du contexte, c'est LA TABLE QUI EN SORT — c'est elle qui sera publiée.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/creator/deplacements.ts pokza-app/src/creator/positions.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-deplacements.js

const { decalerJoueurs, deplacerHero, echangerJoueurs, viderSiege } = require('./cm/creator/deplacements.js');
const { buildSeats, POSITION_SETS } = require('./cm/creator/positions.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)}\n   obtenu  ${JSON.stringify(obtenu)}`);
}

const ctx = (patch) => ({
  gameType: 'cash',
  variant: 'nlhe',
  bombPot: false,
  bombAnte: 0,
  doubleBoard: false,
  sb: 2,
  bb: 5,
  effectiveStack: 500,
  numPlayers: 6,
  heroPosition: 'CO',
  anteType: 'none',
  ante: 0,
  straddleCount: 0,
  straddleAmounts: [],
  straddleBouton: false,
  straddleBoutonMontant: 0,
  currency: 'EUR',
  ...patch,
});

/** LA TABLE TELLE QU'ELLE SERA PUBLIÉE : « place=qui/tapis », dans l'ordre de parole préflop. */
const table = (c) =>
  buildSeats(c.numPlayers, c.heroPosition, c.effectiveStack, c.opponentNames, c.seatStacks, c.heroName).map(
    (s) => `${s.position}=${s.playerName ?? (s.isHero ? 'Hero' : '·')}/${s.startingStack}`
  );

// La table de référence : six joueurs, le héros au CO, trois adversaires nommés, deux tapis à part.
const BASE = ctx({
  heroName: 'Victor',
  opponentNames: { UTG: 'Anne', HJ: 'Marc', BTN: 'Léa' },
  seatStacks: { CO: 900, BTN: 250 },
});

console.log('\n── 1. Le décalage : le bouton a tourné ──');

cas(
  'Départ : Anne UTG, Marc HJ, Victor CO (900), Léa BTN (250)',
  table(BASE),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=Victor/900', 'BTN=Léa/250', 'SB=·/500', 'BB=·/500']
);

// LE CŒUR DU TEST. Une main plus tard, celui qui était SB est BTN : tout le monde recule d'un cran.
// Anne (UTG) passe BB, Marc (HJ) passe UTG, Victor (CO) passe HJ, Léa (BTN) passe CO.
cas(
  '+1 : chacun recule d\'un cran, et emmène son tapis',
  table(decalerJoueurs(BASE, 1)),
  ['UTG=Marc/500', 'HJ=Victor/900', 'CO=Léa/250', 'BTN=·/500', 'SB=·/500', 'BB=Anne/500']
);
cas('+1 : le héros a suivi le mouvement', decalerJoueurs(BASE, 1).heroPosition, 'HJ');
cas(
  '-1 : la main d\'avant, exactement l\'inverse',
  table(decalerJoueurs(BASE, -1)),
  ['UTG=·/500', 'HJ=Anne/500', 'CO=Marc/500', 'BTN=Victor/900', 'SB=Léa/250', 'BB=·/500']
);
cas('Aller-retour +1 puis -1 : on retrouve la table de départ', table(decalerJoueurs(decalerJoueurs(BASE, 1), -1)), table(BASE));

// Le tour complet : six décalages à six joueurs remettent tout le monde à sa place. Si le sens était
// faux, ce cas passerait quand même — c'est pourquoi le cas « +1 » ci-dessus est écrit en dur.
let tour = BASE;
for (let i = 0; i < 6; i++) tour = decalerJoueurs(tour, 1);
cas('Six crans à six joueurs : le tour complet ramène à l\'identique', table(tour), table(BASE));

console.log('\n── 2. Les tables courtes ──');

const HU = ctx({ numPlayers: 2, heroPosition: 'BTN', heroName: 'Victor', opponentNames: { BB: 'Marc' } });
cas('Heads-up : le bouton et la BB s\'échangent', table(decalerJoueurs(HU, 1)), ['BTN=Marc/500', 'BB=Victor/500']);
cas('Heads-up : deux crans reviennent au départ', table(decalerJoueurs(decalerJoueurs(HU, 1), 1)), table(HU));

const TROIS = ctx({
  numPlayers: 3,
  heroPosition: 'BTN',
  heroName: 'Victor',
  opponentNames: { SB: 'Anne', BB: 'Marc' },
});
cas(
  'À trois : SB devient BTN, BB devient SB, BTN devient BB',
  table(decalerJoueurs(TROIS, 1)),
  ['BTN=Anne/500', 'SB=Marc/500', 'BB=Victor/500']
);

console.log('\n── 3. Ce que le décalage ne doit PAS toucher ──');

const AVEC_STRADDLE = ctx({
  ...BASE,
  sb: 2,
  bb: 5,
  ante: 1,
  anteType: 'per-player',
  straddleCount: 2,
  straddleAmounts: [10, 20],
  straddleBouton: true,
  straddleBoutonMontant: 20,
});
const apres = decalerJoueurs(AVEC_STRADDLE, 1);
cas(
  'Le straddle, l\'ante et les blindes restent à la chaise',
  [apres.sb, apres.bb, apres.ante, apres.anteType, apres.straddleCount, apres.straddleAmounts, apres.straddleBouton, apres.straddleBoutonMontant, apres.numPlayers],
  [2, 5, 1, 'per-player', 2, [10, 20], true, 20, 6]
);
cas('Le nom du héros ne change jamais de champ', apres.heroName, 'Victor');

// LE NOM FANTÔME : « Tom » a été tapé au CO, puis le héros s'est assis au CO. Tom n'est plus
// affiché (cf. `buildSeats`) mais il est toujours stocké. Un décalage ne doit pas le ressusciter.
const FANTOME = ctx({ heroPosition: 'CO', heroName: 'Victor', opponentNames: { CO: 'Tom', HJ: 'Marc' } });
cas('Départ : Tom est caché sous le héros', table(FANTOME), ['UTG=·/500', 'HJ=Marc/500', 'CO=Victor/500', 'BTN=·/500', 'SB=·/500', 'BB=·/500']);
cas(
  'Le décalage ne fait pas réapparaître le nom caché',
  table(decalerJoueurs(FANTOME, 1)),
  ['UTG=Marc/500', 'HJ=Victor/500', 'CO=·/500', 'BTN=·/500', 'SB=·/500', 'BB=·/500']
);

// Reste d'une table plus grande : « Zoé » est en LJ, qui n'existe pas à six. Elle n'a pas de siège,
// donc pas de voisin — elle reste où elle est, invisible, et retrouvera sa place si on repasse à 8.
const RESTE = ctx({ heroPosition: 'CO', opponentNames: { LJ: 'Zoé', HJ: 'Marc' } });
cas('Une place absente de la table ne se décale pas', decalerJoueurs(RESTE, 1).opponentNames.LJ, 'Zoé');
cas('… et n\'écrase personne', table(decalerJoueurs(RESTE, 1))[0], 'UTG=Marc/500');

console.log('\n── 4. L\'échange ──');

cas(
  'Deux adversaires échangent nom ET tapis (Marc HJ ↔ Léa BTN)',
  table(echangerJoueurs(BASE, 'HJ', 'BTN')),
  ['UTG=Anne/500', 'HJ=Léa/250', 'CO=Victor/900', 'BTN=Marc/500', 'SB=·/500', 'BB=·/500']
);
cas(
  'Vers un siège vide : le joueur part, sa place se libère (Marc HJ → BB)',
  table(echangerJoueurs(BASE, 'HJ', 'BB')),
  ['UTG=Anne/500', 'HJ=·/500', 'CO=Victor/900', 'BTN=Léa/250', 'SB=·/500', 'BB=Marc/500']
);
cas('L\'échange est symétrique', table(echangerJoueurs(BASE, 'HJ', 'BB')), table(echangerJoueurs(BASE, 'BB', 'HJ')));
cas('Échanger une place avec elle-même ne change rien', table(echangerJoueurs(BASE, 'HJ', 'HJ')), table(BASE));

// LE HÉROS EST L'UN DES DEUX : il change de position, et Léa récupère la chaise qu'il libère —
// avec les tapis qui suivent chacun leur joueur.
const heroEchange = echangerJoueurs(BASE, 'CO', 'BTN');
cas(
  'Le héros échange avec Léa : les deux changent de place, tapis compris',
  table(heroEchange),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=Léa/250', 'BTN=Victor/900', 'SB=·/500', 'BB=·/500']
);
cas('… et `heroPosition` a bien suivi', heroEchange.heroPosition, 'BTN');
cas(
  'Le héros vers un siège vide : personne n\'apparaît derrière lui',
  table(echangerJoueurs(BASE, 'CO', 'SB')),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=·/500', 'BTN=Léa/250', 'SB=Victor/900', 'BB=·/500']
);
cas(
  'L\'échange ne ressuscite pas le nom caché sous le héros',
  table(echangerJoueurs(FANTOME, 'CO', 'BTN')),
  ['UTG=·/500', 'HJ=Marc/500', 'CO=·/500', 'BTN=Victor/500', 'SB=·/500', 'BB=·/500']
);

console.log('\n── 5. Vider un siège ──');

cas(
  'Vider efface le nom ET le tapis (Léa au BTN, tapis 250)',
  table(viderSiege(BASE, 'BTN')),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=Victor/900', 'BTN=·/500', 'SB=·/500', 'BB=·/500']
);
cas(
  'Vider la place du héros : il redevient « Hero » mais reste assis',
  table(viderSiege(BASE, 'CO')),
  ['UTG=Anne/500', 'HJ=Marc/500', 'CO=Hero/500', 'BTN=Léa/250', 'SB=·/500', 'BB=·/500']
);
cas('Vider un siège ne touche pas les autres', viderSiege(BASE, 'BTN').opponentNames, { UTG: 'Anne', HJ: 'Marc' });

console.log('\n── 6. Le tour complet sur toutes les tailles de table ──');

// Un décalage complet doit être l'identité quelle que soit la taille : c'est ce qui prouve que le
// modulo tient sur les dix jeux de positions, y compris ceux dont l'ordre n'est pas intuitif (2 et 3
// n'ont pas de SB au même endroit).
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const places = POSITION_SETS[n];
  const noms = {};
  places.forEach((p, i) => {
    if (p !== places[0]) noms[p] = `J${i}`;
  });
  let c = ctx({ numPlayers: n, heroPosition: places[0], heroName: 'Victor', opponentNames: noms });
  const depart = table(c);
  for (let i = 0; i < n; i++) c = decalerJoueurs(c, 1);
  cas(`Table de ${n} : ${n} crans ramènent à l'identique`, table(c), depart);
}

console.log('\n── 7. Le héros change de position : toute la table suit ──');

/** Les gens dans l'ordre des sièges EN PARTANT DU HÉROS : deux tables au même anneau ont le même
 *  placement, quelles que soient les étiquettes que le bouton leur a données. */
const anneau = (c) => {
  const places = POSITION_SETS[c.numPlayers];
  const h = places.indexOf(c.heroPosition);
  return places.map((_, k) => places[(h + k) % places.length])
    .map((p) => (p === c.heroPosition ? 'Hero' : c.opponentNames?.[p] ?? '·'));
};

// LE CAS DE VICTOR (01/09/2026) : héros au bouton, Éric au CO, donc juste à sa droite. Le héros
// annonce qu'il était en BB — Éric doit se retrouver en SB, et non rester accroché au CO. Dire
// « j'étais en BB » ne veut pas dire qu'on s'est levé de sa chaise, mais que le bouton était
// ailleurs : personne n'a bougé à table.
const AVEC_ERIC = ctx({ numPlayers: 6, heroPosition: 'BTN', heroName: 'Victor', opponentNames: { CO: 'Eric' } });
cas('Héros BTN → BB : Éric passe du CO à la SB', deplacerHero(AVEC_ERIC, 'BB').opponentNames, { SB: 'Eric' });
cas('… et le héros est bien arrivé', deplacerHero(AVEC_ERIC, 'BB').heroPosition, 'BB');
cas('… Éric reste le voisin de droite', anneau(deplacerHero(AVEC_ERIC, 'BB')), ['Hero', '·', '·', '·', '·', 'Eric']);

// L'invariant, énoncé une fois pour toutes : déplacer le héros ne change AUCUN voisinage, où qu'il
// aille. Si un seul de ces six cas tombe, c'est que quelqu'un est resté accroché à son étiquette.
for (const place of ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']) {
  cas(`Héros → ${place} : le voisinage est intact`, anneau(deplacerHero(BASE, place)), anneau(BASE));
}
cas('Aller-retour : on retrouve la table de départ', table(deplacerHero(deplacerHero(BASE, 'SB'), 'CO')), table(BASE));
cas('Rester sur place ne change rien', table(deplacerHero(BASE, 'CO')), table(BASE));

// Le tapis du héros est indexé par position comme les autres : il doit voyager avec lui, sinon il
// resterait sur la chaise qu'il vient de quitter et habillerait le joueur qui s'y assoit.
cas('Le tapis du héros le suit', deplacerHero(BASE, 'SB').seatStacks.SB, 900);
cas('Le tapis de Léa la suit aussi', deplacerHero(BASE, 'SB').seatStacks.SB !== undefined && deplacerHero(BASE, 'SB').opponentNames.BB, 'Léa');

// Sur une table dont personne n'est nommé, le déplacement du héros ne fait rien d'autre que le
// déplacer : la saisie neuve est inchangée.
const NUE = ctx({ numPlayers: 6, heroPosition: 'CO' });
cas('Table anonyme : rien d\'autre ne bouge', [deplacerHero(NUE, 'BB').heroPosition, deplacerHero(NUE, 'BB').opponentNames], ['BB', {}]);

// Une position absente de la table (le nombre de joueurs vient de changer) : on pose le héros sans
// rien faire tourner, faute de savoir de combien.
cas('Position hors de la table : le héros s\'y pose, rien ne tourne', deplacerHero(BASE, 'LJ').heroPosition, 'LJ');
cas('… et les autres n\'ont pas bougé', deplacerHero(BASE, 'LJ').opponentNames, BASE.opponentNames);

const apresHero = deplacerHero(AVEC_STRADDLE, 'SB');
cas(
  'Le straddle et les blindes restent à la chaise',
  [apresHero.sb, apresHero.bb, apresHero.straddleCount, apresHero.straddleAmounts, apresHero.straddleBouton],
  [2, 5, 2, [10, 20], true]
);

console.log(ko === 0 ? '\n✅ Tout passe.\n' : `\n❌ ${ko} cas en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
