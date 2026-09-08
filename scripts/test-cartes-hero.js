// « Ne pas rentrer ses cartes » / « Cachées » / « Révélées à la fin » — le contrat du moteur.
// ─────────────────────────────────────────────────────────────────────────────────────────
// Demandé par Victor le 08/09/2026 : trois pastilles à l'étape « Tes cartes ». Deux d'entre elles
// autorisent une main de Hero qui n'existe pas côté moteur, ce que rien n'avait jamais permis.
// Ce script protège les trois choses qui décident si c'est sûr ou non :
//
//   A. HERO DEBOUT SANS SA MAIN : PERSONNE NE GAGNE. Signalé par Victor le 08/09/2026 — il n'avait
//      pas noté ses cartes, l'adversaire avait montré les siennes, et le pot partait à
//      l'adversaire. Le silence de Hero ne dit pas « j'ai jeté ». Un ADVERSAIRE muet, lui, a bien
//      mucké : l'asymétrie est voulue et testée. Le contrat brut de l'évaluateur est pinné à part
//      — `holeCards: []` y joue LE BOARD en Hold'em et lève une erreur en PLO, ce qui est la raison
//      d'être du garde-fou de `construitMain`.
//   B. `mainHeroCachee` distingue « tue » de « inconnue » — c'est cette nuance qui décide si
//      l'équité doit disparaître, et elle ne doit pas retirer un chiffre juste.
//   C. « Révélées à la fin » ajoute bien le retournement AVANT l'annonce du gagnant, et seulement
//      quand il y a quelque chose à retourner.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/engine/handEngine.ts \
//     --outDir scripts/ch --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-cartes-hero.js

const { determinePotAwards, buildReplayEvents, mainHeroCachee } = require('./ch/engine/handEngine.js');
const { bestHandWinners } = require('./ch/engine/handEvaluator.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  const ok = a === o;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${a} · obtenu ${o}`);
}

const c = (rank, suit) => ({ rank, suit });
/** Board qui JOUE : quinte flush royale à pique, la meilleure main possible pour tout le monde. */
const BOARD_QUI_JOUE = { flop: [c('A', 's'), c('K', 's'), c('Q', 's')], turn: c('J', 's'), river: c('T', 's') };
/** Board qui ne joue pas : le vilain a une paire de rois, Hero jouerait roi-valet. */
const BOARD_ORDINAIRE = { flop: [c('2', 'c'), c('7', 'd'), c('9', 'h')], turn: c('J', 'c'), river: c('K', 's') };

const siege = (id, extra = {}) => ({ id, position: id === 'hero' ? 'BTN' : 'BB', isHero: id === 'hero', startingStack: 1000, ...extra });

/**
 * Une main allée à l'abattage : Hero mise, le vilain suit, puis on checke jusqu'à la river.
 *
 * ⚠️ IL FAUT DE L'ARGENT AU POT. Première version : que des `check` à 0. Les six cas de la
 * section A renvoyaient alors un tableau vide et l'attendu semblait faux — il ne l'était pas.
 * `determinePotAwards` sort par `if (total <= 0) return []` bien avant de comparer la moindre
 * main : sans mise, il n'y a rien à répartir et personne à désigner.
 */
function main({ heroSeat, variant = 'nlhe', board = BOARD_ORDINAIRE, ...reste }) {
  const actions = [
    { id: 'pf-hero', street: 'preflop', seatId: 'hero', type: 'bet', amount: 100, order: 0 },
    { id: 'pf-vilain', street: 'preflop', seatId: 'vilain', type: 'call', amount: 100, order: 1 },
  ];
  let ordre = 2;
  for (const street of ['flop', 'turn', 'river']) {
    for (const seatId of ['hero', 'vilain']) {
      actions.push({ id: `${street}-${seatId}`, street, seatId, type: 'check', amount: 0, order: ordre++ });
    }
  }
  return {
    id: 'main-test',
    variant,
    gameType: 'cash',
    blinds: { sb: 1, bb: 2 },
    effectiveStack: 1000,
    visibility: 'public',
    seats: [heroSeat, siege('vilain', { holeCards: [c('K', 'd'), c('2', 'h')] })],
    board,
    actions,
    ...reste,
  };
}

// ── A. Hero debout sans sa main : PERSONNE ne gagne ─────────────────────────────────────────────
// Signalé par Victor le 08/09/2026 : il n'avait pas noté ses cartes, l'adversaire avait montré les
// siennes, et le replayer donnait tout le pot à l'adversaire. Le silence de Hero ne veut pas dire
// « j'ai jeté » — il veut dire « je ne les ai pas notées ». On ne conclut donc rien.
{
  const sansLaCle = main({ heroSeat: siege('hero') });
  cas('Hero debout sans cartes : aucun vainqueur, le pot reste au milieu',
    determinePotAwards(sansLaCle), []);

  // Le test porte sur des cartes COMPLÈTES et pas sur la présence du tableau : `[]` est truthy.
  const tableauVide = main({ heroSeat: siege('hero', { holeCards: [] }) });
  cas('et un `holeCards: []` compte comme pas de cartes', determinePotAwards(tableauVide), []);

  // ⚠️ LE CAS QUI RENDAIT LE DÉFAUT VISIBLE : sur un board qui joue, Hero PARTAGEAIT le pot.
  const surBoardQuiJoue = main({ heroSeat: siege('hero'), board: BOARD_QUI_JOUE });
  cas('même sur un board qui joue, il ne partage plus rien',
    determinePotAwards(surBoardQuiJoue), []);

  // Avec sa main, rien ne change : le meilleur jeu gagne.
  // ⚠️ ATTENTION AU BOARD EN LISANT CE CAS. Premier attendu écrit ici : une paire d'as pour Hero,
  // « qui bat la paire de rois du vilain ». Faux — le board porte un 2, donc le vilain (Kd 2h) a
  // DEUX PAIRES, rois et deux, et il gagnait bel et bien. L'erreur était dans l'attendu, pas dans
  // le code. Hero prend donc KhKc : brelan de rois avec le Ks du board, ce qui ne se discute pas.
  const avecSaMain = main({ heroSeat: siege('hero', { holeCards: [c('K', 'h'), c('K', 'c')] }) });
  cas('Hero debout AVEC ses cartes : le meilleur jeu gagne, comme avant',
    determinePotAwards(avecSaMain).map((a) => a.seatId), ['hero']);

  // ⚠️ ET L'ASYMÉTRIE EST VOULUE. Un adversaire encore en jeu sans cartes saisies a MUCKÉ :
  // l'écran d'abattage les lui demande, ne rien saisir est une réponse. Hero n'est jamais
  // interrogé là. Toucher à cette règle-ci casserait toutes les mains déjà publiées.
  const vilainQuiMucke = {
    ...main({ heroSeat: siege('hero', { holeCards: [c('A', 'h'), c('A', 'c')] }) }),
    seats: [siege('hero', { holeCards: [c('A', 'h'), c('A', 'c')] }), siege('vilain')],
  };
  cas('un vilain sans cartes, lui, mucke toujours : Hero gagne seul',
    determinePotAwards(vilainQuiMucke).map((a) => a.seatId), ['hero']);
}

// ── A bis. L'Omaha, où le défaut ne mentait pas : il plantait ───────────────────────────────────
{
  const cartesPlo = [c('A', 'c'), c('A', 'd'), c('2', 'h'), c('3', 'h')];
  const vilainPlo = siege('vilain', { holeCards: cartesPlo });
  const plo = (heroSeat) => ({ ...main({ heroSeat, variant: 'plo' }), seats: [heroSeat, vilainPlo] });

  let planté = false;
  try { determinePotAwards(plo(siege('hero', { holeCards: [] }))); } catch { planté = true; }
  cas('PLO, `holeCards: []` : le moteur ne lève plus d’erreur', planté, false);
  cas('PLO, `holeCards: []` : et personne ne gagne',
    determinePotAwards(plo(siege('hero', { holeCards: [] }))), []);
  cas('PLO, sans la clé : personne ne gagne non plus',
    determinePotAwards(plo(siege('hero'))), []);
  // Deux cartes sur quatre ne font pas une main d'Omaha : incomplet vaut absent.
  cas('PLO, main incomplète (2 cartes sur 4) : personne ne gagne',
    determinePotAwards(plo(siege('hero', { holeCards: [c('K', 'c'), c('K', 'd')] }))), []);
}

// ── A quater. Pourquoi `construitMain` retire la clé plutôt que de la poser vide ────────────────
// Le garde-fou du moteur ci-dessus est un doublon volontaire. Ces deux cas pinnent ce que
// l'évaluateur BRUT fait d'une main vide — c'est la raison d'être du premier garde-fou, et rien
// dans le moteur ne le dirait si le second venait à bouger.
{
  const board = [c('A', 's'), c('K', 's'), c('Q', 's'), c('J', 's'), c('T', 's')];
  const vide = { seatId: 'hero', holeCards: [] };
  const vilain = { seatId: 'vilain', holeCards: [c('2', 'c'), c('3', 'd')] };
  cas('⚠️ évaluateur brut, NLHE : une main vide JOUE LE BOARD et partage',
    bestHandWinners([vide, vilain], board, 'nlhe').sort(), ['hero', 'vilain']);
  let planté = false;
  try { bestHandWinners([vide, vilain], board, 'plo'); } catch { planté = true; }
  cas('⚠️ évaluateur brut, PLO : une main vide lève une erreur', planté, true);
}

// ── A ter. Le cas de Victor : couché préflop, aucune carte notée ─────────────────────────────────
// Un siège couché est écarté AVANT le filtre des cartes : le réglage n'a alors aucun effet sur qui
// gagne, et c'est ce qui rend « je n'étais pas dans le coup » entièrement sûr.
{
  const coucheSansCartes = {
    ...main({ heroSeat: siege('hero'), heroCardsVisibility: 'never' }),
    actions: [
      { id: 'a1', street: 'preflop', seatId: 'vilain', type: 'bet', amount: 100, order: 0 },
      { id: 'a2', street: 'preflop', seatId: 'hero', type: 'fold', order: 1 },
    ],
  };
  cas('couché préflop sans cartes : le vilain reste seul debout et rafle',
    determinePotAwards(coucheSansCartes).map((a) => a.seatId), ['vilain']);
}

// ── B. Tue ou inconnue : la nuance qui décide de l'équité ────────────────────────────────────────
{
  const avecCartes = { holeCards: [c('A', 'h'), c('A', 'c')] };
  cas('réglage absent : rien n’est tu', mainHeroCachee(main({ heroSeat: siege('hero', avecCartes) })), false);
  cas('« cachées » + cartes connues : tue',
    mainHeroCachee(main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'never' })), true);
  cas('« révélées à la fin » + cartes connues : tue',
    mainHeroCachee(main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'end' })), true);
  // ⚠️ LE CAS QUI COMPTE : sans cartes saisies, il n'y a rien à taire. Répondre « oui » ici
  // supprimerait l'équité des mains qui restent — un chiffre juste, retiré pour rien.
  cas('« cachées » mais aucune carte saisie : rien n’est tu, c’est INCONNU',
    mainHeroCachee(main({ heroSeat: siege('hero'), heroCardsVisibility: 'never' })), false);
}

// ── C. Le retournement de « révélées à la fin » ──────────────────────────────────────────────────
{
  const avecCartes = { holeCards: [c('A', 'h'), c('A', 'c')] };
  const kinds = (h) => buildReplayEvents(h).map((e) => e.kind);
  const aRetournement = (h) => kinds(h).includes('revealCards');

  cas('« révélées à la fin » : le retournement est là',
    aRetournement(main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'end' })), true);
  // ⚠️ ET IL PRÉCÈDE L'ANNONCE DU GAGNANT : d'abord on voit les mains, ensuite on voit qui gagne.
  // Deux moments distincts — c'est la raison d'être de cet event.
  {
    const k = kinds(main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'end' }));
    cas('et il précède l’annonce du gagnant',
      [k[k.length - 2], k[k.length - 1]], ['revealCards', 'showdown']);
  }
  cas('« cachées » : aucun retournement, elles ne reviennent jamais',
    aRetournement(main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'never' })), false);
  cas('« révélées à la fin » sans cartes saisies : rien à retourner, aucun event',
    aRetournement(main({ heroSeat: siege('hero'), heroCardsVisibility: 'end' })), false);
  cas('réglage absent : aucun retournement (comportement d’avant, inchangé)',
    aRetournement(main({ heroSeat: siege('hero', avecCartes) })), false);
  // Le dernier step existe sur TOUTES les mains, y compris celle qui finit sur un fold : c'est ce
  // qui rend la promesse « révélées à la fin » tenable partout.
  {
    const surFold = {
      ...main({ heroSeat: siege('hero', avecCartes), heroCardsVisibility: 'end' }),
      actions: [
        { id: 'a1', street: 'preflop', seatId: 'vilain', type: 'fold', order: 0 },
      ],
    };
    cas('main finie sur un fold : le retournement a quand même lieu', aRetournement(surFold), true);
  }
}

console.log(ko === 0 ? '\n✅ Tout est vert.' : `\n❌ ${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
