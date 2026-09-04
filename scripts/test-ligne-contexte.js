// La ligne de contexte d'un post, et la normalisation du buy-in.
// ─────────────────────────────────────────────────────────────
// Deux fonctions pures, tranchées par Victor le 04/09/2026, et qui s'affichent sur TOUTES les mains
// du feed — pas seulement les importées. Une erreur ici est visible partout et tout de suite, mais
// silencieuse à l'écriture : rien ne plante, la ligne dit juste autre chose.
//
// Ce que ce script surveille, et qui ne se voit pas à la relecture :
//   1. les deux formes (cash / tournoi) ne partagent presque rien — la variante change de place, le
//      tiret remplace la barre, et le groupe du niveau n'existe qu'en tournoi ;
//   2. « on n'écrit pas deux fois le même prix » ne doit PAS avaler un buy-in légitime :
//      « Main Event 250€ » finit littéralement par « 50€ » ;
//   3. le groupe des blindes s'abrège en entier ou pas du tout (« 15k-30k (3k) », jamais
//      « 15k-30k (3000) ») ;
//   4. la somme du buy-in ne doit sommer QUE ce qu'elle comprend entièrement — tout le reste revient
//      tel quel, y compris « 1,500 » dont on ne peut pas savoir si c'est mille cinq cents.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/denomination.ts pokza-app/src/utils/buyIn.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-ligne-contexte.js

const { formatContextLine } = require('./cm/utils/denomination.js');
const { normaliserBuyIn } = require('./cm/utils/buyIn.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu « ${attendu} »\n   obtenu  « ${obtenu} »`);
}

/** Une main réduite à ce que la ligne de contexte lui demande. */
function main({ gameType = 'tournament', variant = 'nlhe', sb, bb, ante, currency, actions = [], bombPot } = {}) {
  return {
    id: 'h', variant, gameType, effectiveStack: 100, visibility: 'public',
    seats: [], board: {}, actions,
    blinds: { sb, bb, ...(ante ? { ante } : {}) },
    ...(currency ? { currency } : {}),
    ...(bombPot ? { bombPot: true } : {}),
  };
}
const straddle = (amount) => ({ id: 's', street: 'preflop', seatId: 's-utg', type: 'post-straddle', amount, order: 3 });

console.log('\n── TOURNOI ─────────────────────────────────────────────────────────────────');

// La main Winamax du corpus : MTT à antes, nom d'épreuve long, buy-in sommé en amont.
cas('MTT importé, au complet',
  formatContextLine({
    hand: main({ sb: 700, bb: 1400, ante: 160 }),
    tournamentName: '#5 - W SERIES - MILLION EVENT - KO - DAY 1',
    buyIn: '50€', level: 'Niveau 12',
  }, { withLocation: false }),
  'Tournoi NLHE · #5 - W SERIES - MILLION EVENT - KO - DAY 1 50€ · Niveau 12 : 700-1400 (160)');

// La main Betclic du corpus : pas de niveau (le format n'en donne pas), et un nom qui porte déjà
// son prix — le buy-in ne doit pas être répété.
cas('Twister : pas de niveau, prix déjà dans le nom',
  formatContextLine({
    hand: main({ sb: 10, bb: 20 }),
    tournamentName: 'Flash Twister 5€', buyIn: '5€',
  }, { withLocation: false }),
  'Tournoi NLHE · Flash Twister 5€ · 10-20');

cas('Tournoi live',
  formatContextLine({
    hand: main({ sb: 500, bb: 1000 }),
    tournamentName: 'Main Event', buyIn: '250€', level: 'Niveau 12',
  }, { withLocation: false }),
  'Tournoi NLHE · Main Event 250€ · Niveau 12 : 500-1000');

cas('PLO : la variante qualifie la partie, pas les blindes',
  formatContextLine({
    hand: main({ variant: 'plo', sb: 300, bb: 600, ante: 75 }),
    tournamentName: 'Deepstack', buyIn: '150€', level: 'Niveau 8',
  }, { withLocation: false }),
  'Tournoi PLO · Deepstack 150€ · Niveau 8 : 300-600 (75)');

cas('Aucun champ de contexte rempli',
  formatContextLine({ hand: main({ sb: 500, bb: 1000 }), level: 'Niveau 12' }, { withLocation: false }),
  'Tournoi NLHE · Niveau 12 : 500-1000');

cas('Ni nom ni buy-in ni niveau : les blindes seules',
  formatContextLine({ hand: main({ sb: 500, bb: 1000 }) }, { withLocation: false }),
  'Tournoi NLHE · 500-1000');

cas('Buy-in sans nom d’épreuve',
  formatContextLine({ hand: main({ sb: 25, bb: 50 }), buyIn: '20€' }, { withLocation: false }),
  'Tournoi NLHE · 20€ · 25-50');

// LE GARDE-FOU : « Main Event 250€ » se termine par « 50€ ». Sans la frontière de nombre, le buy-in
// disparaîtrait et la ligne annoncerait un tournoi à 250€ au lieu de 50€.
cas('Le nom finit par un nombre qui CONTIENT le buy-in : on répète',
  formatContextLine({
    hand: main({ sb: 100, bb: 200 }), tournamentName: 'Main Event 250€', buyIn: '50€',
  }, { withLocation: false }),
  'Tournoi NLHE · Main Event 250€ 50€ · 100-200');

cas('Le nom EST le prix',
  formatContextLine({ hand: main({ sb: 10, bb: 20 }), tournamentName: '5€', buyIn: '5€' }, { withLocation: false }),
  'Tournoi NLHE · 5€ · 10-20');

cas('Blindes hautes : le groupe s’abrège en entier, ante comprise',
  formatContextLine({
    hand: main({ sb: 15000, bb: 30000, ante: 3000 }), level: 'Niveau 24',
  }, { withLocation: false }),
  'Tournoi NLHE · Niveau 24 : 15k-30k (3k)');

cas('Le plus grand tranche : une ante sous le seuil s’abrège avec les autres',
  formatContextLine({
    hand: main({ sb: 5000, bb: 10000, ante: 1200 }), level: 'Niveau 20',
  }, { withLocation: false }),
  'Tournoi NLHE · Niveau 20 : 5k-10k (1,2k)');

cas('Le lieu, quand la ligne voyage seule (partage)',
  formatContextLine({
    hand: main({ sb: 500, bb: 1000 }), location: 'Winamax',
    tournamentName: 'Main Event', buyIn: '250€', level: 'Niveau 12',
  }),
  'Tournoi NLHE · Winamax · Main Event 250€ · Niveau 12 : 500-1000');

console.log('\n── CASH GAME ───────────────────────────────────────────────────────────────');

cas('Cash : la variante reste collée à l’enjeu',
  formatContextLine({ hand: main({ gameType: 'cash', sb: 2, bb: 5 }) }, { withLocation: false }),
  'Cash game · NLHE 2/5€');

cas('Straddle : la barre, pas le tiret',
  formatContextLine({ hand: main({ gameType: 'cash', sb: 2, bb: 5, actions: [straddle(10)] }) }, { withLocation: false }),
  'Cash game · NLHE 2/5/10€');

cas('Ante en cash : visible pour la première fois',
  formatContextLine({ hand: main({ gameType: 'cash', sb: 2, bb: 5, ante: 1 }) }, { withLocation: false }),
  'Cash game · NLHE 2/5€ (1€)');

cas('Devise en préfixe : le sigle se pose autour de chaque groupe',
  formatContextLine({ hand: main({ gameType: 'cash', sb: 2, bb: 5, ante: 1, currency: 'USD' }) }, { withLocation: false }),
  'Cash game · NLHE $2/5 ($1)');

cas('Bomb pot',
  formatContextLine({ hand: main({ gameType: 'cash', variant: 'plo', sb: 0, bb: 10, bombPot: true }) }, { withLocation: false }),
  'Cash game · PLO bomb pot 10€');

cas('Devise à grosse dénomination : abrégée même en cash',
  formatContextLine({ hand: main({ gameType: 'cash', sb: 20000, bb: 40000, currency: 'VND' }) }, { withLocation: false }),
  'Cash game · NLHE 20k/40k₫');

console.log('\n── BUY-IN NORMALISÉ ────────────────────────────────────────────────────────');

// « 50$ » et non « $50 » serait contraire à la table des devises : le dollar se pose DEVANT le
// nombre partout dans Pokza (`avant: true`), quel que soit le côté où l'auteur l'a tapé.
cas('Somme avec sigle collé',           normaliserBuyIn('45+5$'), '$50');
cas('Somme avec sigle répété',          normaliserBuyIn('45€ + 5€'), '50€');
cas('Forme Betclic, sigle en préfixe',  normaliserBuyIn('€4.65 + €0.35'), '5€');
cas('Tournoi à prime : trois termes',   normaliserBuyIn('10+1+1'), '12€');
cas('Sans devise : celle du contexte',  normaliserBuyIn('100'), '100€');
cas('Devise du contexte respectée',     normaliserBuyIn('100', 'USD'), '$100');
cas('Le sigle écrit gagne sur celui du contexte', normaliserBuyIn('100€', 'USD'), '100€');
cas('Sigle en lettres',                 normaliserBuyIn('100 CHF'), 'CHF 100');
cas('Décimales à la virgule',           normaliserBuyIn('2,5+2,5'), '5€');
cas('Centimes conservés',               normaliserBuyIn('0.5'), '0.5€');
cas('Espaces autour',                   normaliserBuyIn('  100  '), '100€');
cas('Champ vide',                       normaliserBuyIn(''), '');

// Tout ce qui suit doit revenir INTACT : on préfère afficher ce que l'auteur a tapé plutôt que d'en
// deviner la moitié.
cas('Mot seul',                         normaliserBuyIn('Freeroll'), 'Freeroll');
cas('Somme avec un mot en trop',        normaliserBuyIn('45$+5$ KO'), '45$+5$ KO');
cas('Deux devises différentes',         normaliserBuyIn('45€+5$'), '45€+5$');
cas('Trois décimales : ambigu',         normaliserBuyIn('1,500'), '1,500');
cas('Intervalle, pas une somme',        normaliserBuyIn('100-200'), '100-200');

console.log(ko === 0 ? '\n✅ Tout est vert.' : `\n❌ ${ko} échec(s).`);
process.exit(ko === 0 ? 0 : 1);
