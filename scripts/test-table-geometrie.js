// La géométrie de la table, et les deux gabarits qui la dessinent.
// ─────────────────────────────────────────────────────────────────
// Deux choses à tenir, et aucune ne se voit à la relecture du code :
//
//   1. LE FEED NE DOIT PAS BOUGER D'UN PIXEL. L'introduction du gabarit a paramétré des constantes
//      qui étaient figées depuis toujours. Chaque valeur historique est donc réaffirmée ici, en dur :
//      si quelqu'un change une taille « pour l'atelier » et déplace le feed sans le vouloir, c'est
//      ce bloc qui le dira. Ces nombres ne sont pas des attendus recalculés, ce sont des relevés.
//
//   2. LE PLANCHER D'UNE TABLE NE SE MESURE PAS ENTRE LES SIÈGES. C'est l'erreur qui a coûté le plus
//      cher le 30/08/2026 : un modèle qui ne regardait que les blocs cartes+badge annonçait 239 px
//      à six joueurs, alors que le vrai plancher est à 399 — parce que les JETONS DE MISE se posent
//      radialement, donc VERS le board, et le touchent bien avant que deux sièges ne se chevauchent.
//      Le test ci-dessous mesure les jetons. Le témoin `PLANCHER_SANS_LES_JETONS` garde la trace de
//      la valeur fausse : s'il se met à égaler le vrai plancher, c'est que le modèle a reperdu les
//      jetons en route.
//
//   Et une nuance qui n'en est pas une : à 8, 9 et 10 joueurs, le jeton d'un siège latéral MORD DÉJÀ
//   sur la carte extérieure du board — relevé en août, tranché « on n'y touche pas ». On ne demande
//   donc pas à une table d'être parfaite, on lui demande de ne rien AJOUTER à ce qui est déjà toléré.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/layout.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-table-geometrie.js

const L = require('./cm/engine/layout.js');

/** `styles.secondBoard.marginTop` dans BoardView : l'écart entre les deux rangées d'un double board. */
const ECART_BOARDS = 6;

let ko = 0;
function eq(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${titre}${ok ? '' : `\n         obtenu ${JSON.stringify(obtenu)} · attendu ${JSON.stringify(attendu)}`}`);
}
function vrai(titre, condition, details = '') {
  if (!condition) ko++;
  console.log(`${condition ? '  ok  ' : '  KO  '} ${titre}${condition ? '' : `\n         ${details}`}`);
}

const FEED = L.GABARIT_FEED;
const ATELIER = L.GABARIT_ATELIER;

console.log('\n— Le feed, valeur par valeur (relevés d’avant le gabarit) —');
eq('bloc de siège', L.blocSiegeHauteur(FEED, false), 80);
eq('ancre depuis le haut', L.ancreDepuisLeHaut(FEED, false), 39);
eq('bord intérieur haut', L.SEAT_INNER_EDGE_TOP_HALF, 41);
eq('bord intérieur bas', L.SEAT_INNER_EDGE_BOTTOM_HALF, 39);
eq('recentrage du board', L.boardVerticalOffset(), 10);
eq('carte de board à 390 px', L.boardCardSize(390), { width: 34, height: 46 });
eq('rayon vertical à 488 px', L.seatEllipseRy(488), 205);
// La table du feed vaut largeur × 1,25 (aspectRatio 0.8) : à 390 de large, 487,5 de haut.
eq('hero au bas de la table', Math.round(L.layoutSeats(sieges(6), 390, 487.5)[0].y), 449);

console.log('\n— L’atelier : les trois réductions du 30/08 —');
eq('cartes des adversaires', ATELIER.carteVilain, { width: 24, height: 32 });
eq('cartes de Hero, intactes', ATELIER.carteHero, FEED.carteHero);
eq('carte de board à 390 px', L.boardCardSize(390, ATELIER), { width: 26, height: 35 });
eq('bloc d’un adversaire', L.blocSiegeHauteur(ATELIER, false), 66);
eq('bloc de Hero', L.blocSiegeHauteur(ATELIER, true), 80);
eq('bloc de mise', ATELIER.chipBlockHeight, 25);
eq('recentrage du board', L.boardVerticalOffset(18, ATELIER), 5.5);
vrai(
  'le board de l’atelier reste dans les bornes de la fonction',
  ATELIER.boardCardMax >= 18 && ATELIER.boardCardMax <= FEED.boardCardMax,
  'la borne basse de boardCardSize est 18, son plafond au feed 34'
);

// ── Le modèle de collision : sièges, jetons, board et pot ──────────────────────────────────────
const POT_PILL_H = 18;
const CHIP_W = 56;
const CHIP_CLEAR = 6;
const croise = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

function sieges(n) {
  const pos = ['UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const pris = pos.slice(0, Math.max(0, n - 2)).concat(['SB', 'BB']).slice(-n);
  return pris.map((p, i) => ({ id: `s-${p}`, position: p, isHero: i === pris.length - 3, startingStack: 500 }));
}

/** Toutes les boîtes visibles d'une table : blocs de siège, jetons de mise, board, pastille de pot. */
function boites(n, w, h, g, avecJetons = true, avecBoard = true, rangees = 1) {
  const coords = L.layoutSeats(sieges(n), w, h, 0.16, g);
  const cx = w / 2;
  const cy = h / 2;
  const bc = L.boardCardSize(w, g);
  // Deux rangées de board (bomb pot double board) : la seconde s'empile sous la première, avec
  // l'écart de `styles.secondBoard`. C'est ce bloc, plus haut, que les jetons viennent buter.
  const bh = avecBoard ? rangees * bc.height + (rangees - 1) * ECART_BOARDS : 0;
  // Sans rangée de board, `TableVue` recentre la seule pastille de pot sur la table (offset
  // = POT_PILL_H / 2) au lieu d'appliquer le recentrage qui équilibre BB et Hero autour du board.
  // Le modèle doit dire exactement ce que le rendu fait, sinon il mesure une autre table.
  const decalage = avecBoard ? L.boardVerticalOffset(POT_PILL_H, g) : POT_PILL_H / 2;
  const boardW = 5 * bc.width + 16;
  const out = [
    { n: 'board', x1: cx - boardW / 2, x2: cx + boardW / 2, y1: cy + decalage - bh / 2, y2: cy + decalage + bh / 2 },
  ];
  out.push({ n: 'pot', x1: cx - CHIP_W / 2, x2: cx + CHIP_W / 2, y1: out[0].y1 - POT_PILL_H, y2: out[0].y1 });
  coords.forEach(({ seat, x, y }, i) => {
    const hero = Boolean(seat.isHero);
    const carte = hero ? g.carteHero : g.carteVilain;
    const bloc = L.blocSiegeHauteur(g, hero);
    const haut = y - L.ancreDepuisLeHaut(g, hero);
    const largeurCartes = 2 * carte.width + 3;
    out.push({ n: `s${i}.cartes`, x1: x - largeurCartes / 2, x2: x + largeurCartes / 2, y1: haut, y2: haut + carte.height });
    out.push({ n: `s${i}.badge`, x1: x - 40, x2: x + 40, y1: haut + carte.height + 4, y2: haut + bloc });
    if (!avecJetons) return;
    const dx = cx - x;
    const dy = cy - y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const sortie = Math.min(40 / (Math.abs(ux) || 1e-6), bloc / 2 / (Math.abs(uy) || 1e-6));
    const dist = sortie + CHIP_CLEAR + g.chipBlockHeight / 2;
    const jx = x + ux * dist;
    const jy = y + uy * dist;
    out.push({
      n: `j${i}`,
      x1: jx - CHIP_W / 2, x2: jx + CHIP_W / 2,
      y1: jy - g.chipBlockHeight / 2, y2: jy + g.chipBlockHeight / 2,
    });
  });
  return out;
}

function conflits(n, w, h, g, avecJetons = true, avecBoard = true, rangees = 1) {
  const b = boites(n, w, h, g, avecJetons, avecBoard, rangees);
  const out = new Set();
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      // Un siège ne se chevauche jamais lui-même : ni ses cartes contre son badge, ni SON jeton
      // contre SON bloc. Le jeton est justement posé juste devant son propre siège — l'y compter
      // comme conflit ferait mentir tous les planchers (mesuré : 457 au lieu de 414 à huit joueurs).
      const proprietaire = (nom) => nom.replace(/^([sj])(\d+).*$/, '$2');
      if (proprietaire(b[i].n) === proprietaire(b[j].n) && b[i].n[0] !== 'b' && b[j].n[0] !== 'b') continue;
      if (croise(b[i], b[j])) out.add(`${b[i].n}×${b[j].n}`);
    }
  return [...out];
}

/** Plus petite hauteur qui n'AJOUTE rien au chevauchement déjà toléré au feed. */
function plancherSur(n, w, g, avecJetons = true, rangees = 1) {
  const tolere = new Set(conflits(n, w, Math.round(w * 1.25), FEED));
  let dernier = null;
  for (let h = 150; h <= Math.round(w * 1.25); h++) {
    if (conflits(n, w, h, g, avecJetons, true, rangees).filter((c) => !tolere.has(c)).length) dernier = h;
  }
  return dernier ? dernier + 1 : 150;
}

console.log('\n— La table du feed ne crée aucun chevauchement neuf —');
for (const n of [6, 8, 9, 10]) {
  vrai(
    `${n} joueurs, table du feed (390 × 487)`,
    conflits(n, 390, 487, FEED).filter((c) => !new Set(conflits(n, 390, 487, FEED)).has(c)).length === 0,
    'la table du feed est sa propre référence'
  );
}

console.log('\n— Le plancher se mesure AVEC les jetons —');
const PLANCHER_SANS_LES_JETONS = plancherSur(6, 390, FEED, false);
const plancherVrai = plancherSur(6, 390, FEED, true);
vrai(
  'témoin : ignorer les jetons annonce un plancher bien trop bas',
  PLANCHER_SANS_LES_JETONS < plancherVrai - 100,
  `sans jetons ${PLANCHER_SANS_LES_JETONS}, avec jetons ${plancherVrai} — l'écart doit rester énorme`
);
eq('plancher du feed à 6 joueurs, 390 px', plancherVrai, 399);

console.log('\n— Les trois réductions rendent bien ce qui a été annoncé à Victor —');
const pireFeed = Math.max(...[6, 8, 9, 10].map((n) => plancherSur(n, 390, FEED)));
const pireAtelier = Math.max(...[6, 8, 9, 10].map((n) => plancherSur(n, 390, ATELIER)));
eq('pire plancher au gabarit du feed', pireFeed, 414);
vrai(
  `l'atelier descend d'au moins 50 px (${pireFeed} → ${pireAtelier})`,
  pireFeed - pireAtelier >= 50,
  'les trois réductions valaient −58 px à la mesure du 30/08'
);
vrai(
  "un écran de street tient sur un iPhone 14 au gabarit de l'atelier",
  pireAtelier + 298.5 <= 844,
  `${pireAtelier} + 298,5 = ${(pireAtelier + 298.5).toFixed(0)} pour 844`
);
vrai(
  'et sur le 15 Pro Max',
  Math.max(...[6, 8, 9, 10].map((n) => plancherSur(n, 430, ATELIER))) + 298.5 <= 932,
  'largeur de table 430'
);

/** Plancher SANS board réservé — les étapes de réglage, où la main n'a pas commencé. */
function plancherReglage(n, w, g) {
  const tolere = new Set(conflits(n, w, Math.round(w * 1.25), FEED));
  let dernier = null;
  for (let h = 150; h <= Math.round(w * 1.25); h++) {
    if (conflits(n, w, h, g, true, false).filter((c) => !tolere.has(c)).length) dernier = h;
  }
  return dernier ? dernier + 1 : 150;
}

console.log('\n— Les hauteurs de l’atelier tiennent le plancher, à toutes les largeurs —');
const LARGEURS = [339, 354, 370, 390, 410, 430];
for (const n of [2, 4, 5, 6, 7, 8, 9, 10]) {
  const annoncee = L.hauteurTableAtelier(n);
  const pireMesure = Math.max(...LARGEURS.map((w) => plancherSur(n, w, ATELIER)));
  vrai(
    `${n} joueurs : ${annoncee} px ≥ plancher mesuré ${pireMesure}`,
    annoncee >= pireMesure,
    'la table de HAUTEURS_ATELIER doit couvrir la pire largeur, sinon des jetons mordent le board'
  );
}
vrai(
  'la hauteur ne décroît jamais quand on ajoute un joueur',
  [3, 4, 5, 6, 7, 8, 9, 10].every((n) => L.hauteurTableAtelier(n) >= L.hauteurTableAtelier(n - 1)),
  'une table qui rapetisse quand on ajoute un siège serait incompréhensible'
);
console.log('\n— Le DOUBLE BOARD du bomb pot : deux rangées, tout dessiné plus petit —');
const DOUBLE = L.GABARIT_ATELIER_DOUBLE;
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const annoncee = L.hauteurTableAtelier(n, true);
  const pire = Math.max(...LARGEURS.map((w) => plancherSur(n, w, DOUBLE, true, 2)));
  vrai(
    `${n} joueurs, 2 boards : ${annoncee} px ≥ plancher mesuré ${pire}`,
    annoncee >= pire,
    'une seconde rangée pousse le board vers les jetons : la hauteur doit suivre'
  );
}
vrai(
  'la hauteur du double board ne décroît jamais quand on ajoute un joueur',
  [3, 4, 5, 6, 7, 8, 9, 10].every((n) => L.hauteurTableAtelier(n, true) >= L.hauteurTableAtelier(n - 1, true))
);
// TÉMOIN DU COÛT — mesuré le 31/08 : même en réduisant ce qui peut l'être, la seconde rangée coûte
// 45 px au pire (six joueurs, 342 → 387). Si ce chiffre s'effondre, c'est que le modèle a cessé de
// compter la seconde rangée.
//
// Et le TÉMOIN DE L'ÉCHANGE QUI N'EN EST PAS UN : réduire les cartes des adversaires n'achète pas
// de board. Victor l'a proposé, la mesure l'a écarté — on la garde ici pour ne pas y revenir.
eq('surcoût du double board à six joueurs', L.hauteurTableAtelier(6, true) - L.hauteurTableAtelier(6), 45);
{
  const vilainsMinces = { ...DOUBLE, carteVilain: { width: 18, height: 24 } };
  const boardPlusGrand = { ...DOUBLE, boardCardMax: 20 };
  const pire = (g) => Math.max(...LARGEURS.map((w) => plancherSur(6, w, g, true, 2)));
  const reference = pire(DOUBLE);
  vrai(
    'amincir les adversaires rend moins que ce que coûte un board plus grand',
    reference - pire(vilainsMinces) < pire(boardPlusGrand) - reference,
    `vilains à 18×24 : −${reference - pire(vilainsMinces)} px ; board à 20 : +${pire(boardPlusGrand) - reference} px`
  );
}
vrai(
  'les cartes du double board sont bien réduites au minimum',
  L.boardCardSize(390, DOUBLE).width === 18 && L.boardCardSize(390, L.GABARIT_ATELIER).width === 26,
  `double ${L.boardCardSize(390, DOUBLE).width}, simple ${L.boardCardSize(390, L.GABARIT_ATELIER).width}`
);

// TÉMOIN : la hauteur doit rester NETTEMENT sous celle du feed, sinon les trois réductions n'ont
// servi à rien et l'écran de street ne rentrera pas.
console.log('\n— Et les hauteurs de RÉGLAGE (étapes 1 et 2, sans board) —');
for (const n of [2, 4, 5, 6, 7, 8, 9, 10]) {
  const annoncee = L.hauteurTableReglage(n);
  const pire = Math.max(...LARGEURS.map((w) => plancherReglage(n, w, ATELIER)));
  vrai(`${n} joueurs : ${annoncee} px ≥ plancher mesuré ${pire}`, annoncee >= pire);
}
vrai(
  'la table de réglage n’est jamais plus haute que celle de la main',
  [2, 4, 5, 6, 7, 8, 9, 10].every((n) => L.hauteurTableReglage(n) <= L.hauteurTableAtelier(n)),
  'retirer le board ne peut pas exiger PLUS de hauteur'
);

vrai(
  'une table de 10 joueurs reste sous la proportion du feed',
  L.hauteurTableAtelier(10) < 390 * 1.25 - 50,
  `${L.hauteurTableAtelier(10)} contre ${390 * 1.25} au feed`
);

console.log(
  `\n${ko === 0 ? '🎉 tout passe' : `${ko} échec(s)`} — feed intact, atelier conforme aux mesures du 30/08.\n`
);
process.exit(ko === 0 ? 0 : 1);
