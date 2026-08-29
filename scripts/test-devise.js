// La devise d'une main.
// ────────────────────
// Ce que ce script protège, et qui ne se verrait pas à l'œil :
//   1. LE « PAS DE TROU » — une main publiée avant l'arrivée du sélecteur n'a pas de devise, et doit
//      s'afficher exactement comme avant. C'est la garantie qui permet de ne pas migrer la base.
//   2. LA POSITION DU SIGLE — deux tiers des devises s'écrivent devant le nombre ("$10"), l'euro
//      derrière ("10€"), et huit portent une espace. Une inversion passerait inaperçue en relecture.
//   3. L'ABRÉGÉ EN CASH — l'argent réel ne s'abrège JAMAIS, sauf pour les huit devises dont les
//      montants ordinaires sont à six chiffres (décision de Victor, 30/08/2026). Jamais l'euro,
//      jamais le dollar : c'est la moitié de la règle qui risque le plus de partir à la dérive.
//   4. LES BB — la préférence « en grosses blindes » l'emporte sur toute devise.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/currency.ts pokza-app/src/utils/chipFormat.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-devise.js

const { DEVISES, DEVISE_PAR_DEFAUT, devise, habillerMontant } = require('./cm/utils/currency.js');
const { formatChipAmount, habillerDenomination } = require('./cm/utils/chipFormat.js');
const { postToSeed } = require('./cm/creator/rehydrate.js');
const { champsStructurelsModifies } = require('./cm/creator/invalidation.js');

let ok = 0;
const echecs = [];
function eq(nom, obtenu, attendu) {
  if (obtenu === attendu) ok++;
  else echecs.push(`${nom}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
}

// ── 1. Pas de trou ─────────────────────────────────────────────────────────────────────────────
eq('devise() sans argument → euro', devise().code, 'EUR');
eq('devise(undefined) → euro', devise(undefined).code, 'EUR');
eq('devise(null) → euro', devise(null).code, 'EUR');
eq('devise("") → euro', devise('').code, 'EUR');
eq('devise(code inconnu) → euro', devise('XYZ').code, 'EUR');
eq('devise(minuscules) → euro', devise('usd').code, 'EUR');
eq('le défaut EST l\'euro', DEVISE_PAR_DEFAUT, 'EUR');
// Une main d'avant le sélecteur : aucune devise, et l'affichage ne bouge pas d'un caractère.
eq('main sans devise = comme avant', formatChipAmount(500, 'cash', undefined, undefined), '500€');
eq('main avec devise corrompue', formatChipAmount(500, 'cash', undefined, 'PIÈCES'), '500€');

// ── 2. Position du sigle ───────────────────────────────────────────────────────────────────────
eq('euro : derrière, collé', formatChipAmount(500, 'cash', undefined, 'EUR'), '500€');
eq('dollar : devant, collé', formatChipAmount(500, 'cash', undefined, 'USD'), '$500');
eq('livre : devant, collé', formatChipAmount(200, 'cash', undefined, 'GBP'), '£200');
eq('real : devant, collé', formatChipAmount(500, 'cash', undefined, 'BRL'), 'R$500');
eq('tchèque : derrière, espacé', formatChipAmount(5000, 'cash', undefined, 'CZK'), '5000 Kč');
eq('suisse : devant, espacé', formatChipAmount(500, 'cash', undefined, 'CHF'), 'CHF 500');
eq('zloty : derrière, espacé', formatChipAmount(1000, 'cash', undefined, 'PLN'), '1000 zł');
eq('dirham : devant, espacé', formatChipAmount(2000, 'cash', undefined, 'AED'), 'AED 2000');
eq('rouble : derrière, collé', formatChipAmount(20000, 'cash', undefined, 'RUB'), '20000₽');
eq('lev : derrière, espacé', formatChipAmount(1000, 'cash', undefined, 'BGN'), '1000 лв');

// ── 3. L'abrégé en cash : huit devises, et huit seulement ───────────────────────────────────────
const ABREGEES = ['JPY', 'KRW', 'HUF', 'VND', 'IDR', 'KZT', 'NGN', 'CRC'];
eq('exactement huit devises abrégées', DEVISES.filter((d) => d.abrege).length, 8);
for (const code of ABREGEES) {
  eq(`${code} est abrégée`, devise(code).abrege, true);
}
for (const d of DEVISES) {
  if (!ABREGEES.includes(d.code)) eq(`${d.code} n'est PAS abrégée`, d.abrege, false);
}
// Jamais l'euro ni le dollar, quel que soit le montant : c'est la moitié de la règle.
eq('euro à 7 chiffres : entier', formatChipAmount(4000000, 'cash', undefined, 'EUR'), '4000000€');
eq('dollar à 7 chiffres : entier', formatChipAmount(4000000, 'cash', undefined, 'USD'), '$4000000');
eq('livre à 6 chiffres : entier', formatChipAmount(150000, 'cash', undefined, 'GBP'), '£150000');
// Et systématiquement pour les huit autres.
eq('dong : millions abrégés', formatChipAmount(4000000, 'cash', undefined, 'VND'), '4M₫');
eq('dong : milliers abrégés', formatChipAmount(300000, 'cash', undefined, 'VND'), '300k₫');
eq('rupiah : devant', formatChipAmount(5000000, 'cash', undefined, 'IDR'), 'Rp5M');
eq('won', formatChipAmount(200000, 'cash', undefined, 'KRW'), '₩200k');
eq('forint : espacé', formatChipAmount(100000, 'cash', undefined, 'HUF'), '100k Ft');
eq('yen', formatChipAmount(100000, 'cash', undefined, 'JPY'), '¥100k');
// Sous le millier, l'abréviation ne change rien — pas de "0,5k" pour 500.
eq('dong sous 1000 : entier', formatChipAmount(500, 'cash', undefined, 'VND'), '500₫');
// Les centimes d'une devise abrégée ne se perdent pas non plus.
eq('dong à 12,5', formatChipAmount(12.5, 'cash', undefined, 'VND'), '12.5₫');

// ── 4. Le tournoi ignore la devise, les BB l'emportent sur tout ─────────────────────────────────
eq('tournoi : pas de devise', formatChipAmount(30000, 'tournament', undefined, 'USD'), '30k');
eq('tournoi : pas de devise (2)', formatChipAmount(500, 'tournament', undefined, 'EUR'), '500');
eq('BB > devise', formatChipAmount(500, 'cash', { bb: 5, useBB: true }, 'USD'), '100 bb');
eq('BB > devise abrégée', formatChipAmount(4000000, 'cash', { bb: 40000, useBB: true }, 'VND'), '100 bb');
eq('BB à 0 : on retombe sur la devise', formatChipAmount(500, 'cash', { bb: 0, useBB: true }, 'USD'), '$500');

// ── 5. La dénomination du feed ──────────────────────────────────────────────────────────────────
eq('dénomination euro', habillerDenomination('2/5', 'cash', 'EUR'), '2/5€');
eq('dénomination dollar', habillerDenomination('2/5', 'cash', 'USD'), '$2/5');
eq('dénomination tchèque', habillerDenomination('25/50', 'cash', 'CZK'), '25/50 Kč');
eq('dénomination straddlée', habillerDenomination('2/5/10', 'cash', 'GBP'), '£2/5/10');
eq('dénomination sans devise', habillerDenomination('2/5', 'cash', undefined), '2/5€');
eq('dénomination en tournoi', habillerDenomination('15M/30M', 'tournament', 'USD'), '15M/30M');

// ── 6. Le tableau lui-même ─────────────────────────────────────────────────────────────────────
eq('trente devises', DEVISES.length, 30);
eq('l\'euro ouvre la liste', DEVISES[0].code, 'EUR');
eq('puis le dollar', DEVISES[1].code, 'USD');
eq('puis la livre', DEVISES[2].code, 'GBP');
const codes = DEVISES.map((d) => d.code);
eq('aucun code en double', new Set(codes).size, 30);
const sigles = DEVISES.map((d) => d.sigle);
eq('aucun SIGLE en double', new Set(sigles).size, 30);
for (const d of DEVISES) {
  if (!d.sigle.trim()) echecs.push(`${d.code} : sigle vide`);
  else ok++;
  if (!d.nom.trim()) echecs.push(`${d.code} : nom vide`);
  else ok++;
}
// L'espace ne se déduit PAS de la longueur du sigle : « RM100 », « Rp5000 », « R$50 » et « S/50 »
// s'écrivent collés alors qu'ils font deux caractères, et « CHF 100 » séparé. C'est une convention
// par devise, donc on épingle la liste exacte plutôt qu'une règle qui aurait l'air vraie.
const ESPACEES = ['CZK', 'CHF', 'PLN', 'SEK', 'HUF', 'RON', 'AED', 'BGN'];
for (const d of DEVISES) {
  eq(`${d.code} : espace ${ESPACEES.includes(d.code) ? 'attendu' : 'non'}`, d.espace, ESPACEES.includes(d.code));
}
eq('ringgit collé', formatChipAmount(2000, 'cash', undefined, 'MYR'), 'RM2000');
eq('sol collé', formatChipAmount(1000, 'cash', undefined, 'PEN'), 'S/1000');
eq('habillerMontant direct', habillerMontant('42', devise('CHF')), 'CHF 42');

// ── 7. L'aller-retour d'une main publiée, et la correction ─────────────────────────────────────
// C'est ici que se joue la promesse faite à Victor : corriger la devise d'une main publiée ne doit
// RIEN faire ressaisir. Le seul moyen de le garantir est de le mesurer sur le vrai critère.
const seats = [
  { id: 's-co', position: 'CO', isHero: false, startingStack: 800 },
  { id: 's-btn', position: 'BTN', isHero: true, startingStack: 800 },
  { id: 's-sb', position: 'SB', isHero: false, startingStack: 800 },
  { id: 's-bb', position: 'BB', isHero: false, startingStack: 800 },
];
const acts = [
  { id: 'a1', street: 'preflop', seatId: 's-sb', type: 'post-sb', amount: 2, order: 1 },
  { id: 'a2', street: 'preflop', seatId: 's-bb', type: 'post-bb', amount: 5, order: 2 },
  { id: 'a3', street: 'preflop', seatId: 's-co', type: 'fold', order: 3 },
  { id: 'a4', street: 'preflop', seatId: 's-btn', type: 'raise', amount: 15, order: 4 },
  { id: 'a5', street: 'preflop', seatId: 's-sb', type: 'fold', order: 5 },
  { id: 'a6', street: 'preflop', seatId: 's-bb', type: 'fold', order: 6 },
];
const post = (currency) => ({
  id: 'p', authorId: 'u', authorName: 'V', createdAt: '2026-08-30T12:00:00Z', title: 'T',
  likeCount: 0, commentCount: 0, visibility: 'public',
  hand: { id: 'h', variant: 'nlhe', gameType: 'cash', blinds: { sb: 2, bb: 5 }, effectiveStack: 800,
          visibility: 'public', seats, board: {}, actions: acts, ...(currency ? { currency } : {}) },
});
eq('relecture : la devise revient', postToSeed(post('CHF')).context.currency, 'CHF');
eq('relecture : main d\'avant → euro', postToSeed(post(undefined)).context.currency, 'EUR');
eq('relecture : devise corrompue → euro', postToSeed(post('PIÈCES')).context.currency, 'EUR');

const avant = postToSeed(post('EUR')).context;
eq('changer la devise n\'invalide RIEN',
   champsStructurelsModifies(avant, { ...avant, currency: 'USD' }).length, 0);
// Témoin : le critère répond bien quand c'est vraiment structurel, sinon le test ci-dessus ne
// prouverait que l'inertie de la fonction.
eq('témoin : changer la BB invalide',
   champsStructurelsModifies(avant, { ...avant, bb: 10 }).join(','), 'les blindes');

console.log(`\n${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log('Tout est vert.\n');
