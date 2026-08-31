// La banque de lieux.
// ──────────────────
// Ce que ce script protège, et qui ne se verrait pas à la relecture :
//   1. LA FORME DES ENTRÉES — deux règles décidées le 30/08/2026 (ville dans le nom : on ne la
//      répète pas ; sinon « nom, virgule, ville »), et un plafond d'affichage de 40 caractères
//      hérité du feed. Une entrée trop longue serait tronquée dans la carte, pas à la saisie.
//   2. LE SEUIL ET LE PLAFOND — 3 caractères, 5 suggestions. Ce sont des valeurs produit : un test
//      les fige, sinon elles dérivent au premier « ça serait mieux avec 4 ».
//   3. LE CLASSEMENT — trois rangs. Sans témoin, une régression de tri ne se voit qu'à l'usage,
//      et seulement par quelqu'un qui connaît la bonne réponse.
//   4. LES DEUX EXEMPLES DE VICTOR — « Bell » → Bellagio, « Los An » → les salles de Los Angeles.
//      Ce sont les seules exigences énoncées mot pour mot : elles méritent leur assertion.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/data/lieux.ts pokza-app/src/utils/recherche.ts \
//     --outDir scripts/cm --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-lieux.js

const { LIEUX, chercherLieux, LIEU_MIN_CARACTERES, LIEU_MAX_SUGGESTIONS } = require('./cm/data/lieux.js');

// Le plafond d'affichage vient de `constants/limits.ts`. Recopié plutôt qu'importé : ce test doit
// échouer si quelqu'un ABAISSE la limite sans revoir la banque, pas suivre docilement la nouvelle.
const LOCATION_MAX_LENGTH = 40;

let ok = 0;
const echecs = [];
function eq(nom, obtenu, attendu) {
  if (JSON.stringify(obtenu) === JSON.stringify(attendu)) ok++;
  else echecs.push(`${nom}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
}
function vrai(nom, condition, details = '') {
  if (condition) ok++;
  else echecs.push(`${nom}${details ? `\n      ${details}` : ''}`);
}
const noms = (saisie, max) => chercherLieux(saisie, max).map((l) => l.nom);

// ── 1. Intégrité de la banque ──────────────────────────────────────────────────────────────────
const ids = LIEUX.map((l) => l.id);
eq('aucun identifiant en double', ids.length - new Set(ids).size, 0);
const nomsTous = LIEUX.map((l) => l.nom);
const doublons = nomsTous.filter((n, i) => nomsTous.indexOf(n) !== i);
eq('aucun nom en double', doublons, []);

const tropLongs = LIEUX.filter((l) => l.nom.length > LOCATION_MAX_LENGTH).map((l) => `${l.nom.length} — ${l.nom}`);
eq(`aucun nom au-dessus de ${LOCATION_MAX_LENGTH} caractères`, tropLongs, []);

// Les alias servent à la recherche, jamais à l'affichage : accentués ou en majuscules, ils ne
// seraient tout simplement jamais trouvés, puisque la saisie est repliée avant comparaison.
const aliasMalEcrits = LIEUX.flatMap((l) =>
  (l.alias ?? []).filter((a) => a !== a.toLowerCase() || /[^\x00-\x7F]/.test(a)).map((a) => `${l.id} : ${a}`)
);
eq('tous les alias en minuscules sans accent', aliasMalEcrits, []);

// RÈGLE DE FORME : quand le nom porte une virgule, la ville qui suit ne doit pas déjà figurer dans
// la partie gauche. C'est exactement la redondance que Victor a proscrite (« Bellagio, Las Vegas »
// et non « Bellagio Las Vegas, Las Vegas »).
const redondants = LIEUX.filter((l) => {
  const i = l.nom.indexOf(', ');
  if (i < 0) return false;
  return l.nom.slice(0, i).toLowerCase().includes(l.nom.slice(i + 2).toLowerCase());
}).map((l) => l.nom);
eq('aucune ville répétée de part et d’autre de la virgule', redondants, []);

// ── 2. Le seuil de 3 caractères ────────────────────────────────────────────────────────────────
eq('valeur du seuil', LIEU_MIN_CARACTERES, 3);
eq('valeur du plafond', LIEU_MAX_SUGGESTIONS, 5);
eq('une lettre ne propose rien', noms('B'), []);
eq('deux lettres ne proposent rien', noms('Be'), []);
vrai('trois lettres proposent', noms('Bel').length > 0, `obtenu : ${JSON.stringify(noms('Bel'))}`);
eq('saisie vide ne propose rien', noms(''), []);
eq('espaces seuls ne proposent rien', noms('   '), []);
// TÉMOIN : le seuil porte sur la saisie entière, pas sur chaque morceau — sinon « Los An » (dont le
// second morceau ne fait que deux lettres) ne proposerait rien, alors que c'est l'exemple de Victor.
vrai('« Los An » propose malgré un morceau de 2 lettres', noms('Los An').length > 0);

// ── 3. Le plafond de 5 ─────────────────────────────────────────────────────────────────────────
// « Casino » correspond à une bonne partie de la banque : c'est le pire cas du plafond.
vrai('« Casino » correspond à beaucoup', chercherLieux('Casino', 999).length > 20);
eq('mais cinq suggestions au plus', noms('Casino').length, 5);
eq('« Las » plafonné aussi', noms('Las').length, 5);

// ── 4. Les deux exemples de Victor ─────────────────────────────────────────────────────────────
eq('« Bell » propose le Bellagio en tête', noms('Bell')[0], 'Bellagio, Las Vegas');
const losAn = noms('Los An');
vrai('« Los An » propose Commerce Casino', losAn.includes('Commerce Casino, Los Angeles'), JSON.stringify(losAn));
vrai('« Los An » propose plusieurs salles', losAn.length >= 4, JSON.stringify(losAn));
// RÈGLE DE VICTOR (30/08) : on affiche la ville que le lecteur reconnaît, pas la commune de
// banlieue. Bell Gardens, Gardena et Inglewood ne s'écrivent plus — elles sont passées en alias.
vrai('« Los An » ne propose que des « Los Angeles »', losAn.every((n) => n.includes('Los Angeles')), JSON.stringify(losAn));
vrai('mais la commune reste cherchable : « Bell Gardens »', noms('Bell Gardens').includes('The Bicycle Casino, Los Angeles'));
vrai('« Gardena » aussi', noms('Gardena').includes('Hustler Casino, Los Angeles'));
vrai('« Inglewood » aussi', noms('Inglewood').includes('Hollywood Park Casino, Los Angeles'));

// ── 5. Ville ou casino, même résultat ──────────────────────────────────────────────────────────
vrai('par le casino : « Commerce »', noms('Commerce').includes('Commerce Casino, Los Angeles'));
vrai('par la ville : « Rozvadov »', noms('Rozvadov').some((n) => n.startsWith("King's Resort")));
vrai('par le casino : « King »', noms('King').some((n) => n.startsWith("King's Resort")));
vrai('par la ville : « Enghien »', noms('Enghien').some((n) => n.includes('Enghien')));
vrai('par le casino : « Barrière de Lil »', noms('Barrière de Lil').includes('Casino Barrière de Lille'));

// ── 6. Accents et casse ────────────────────────────────────────────────────────────────────────
eq('« barriere » sans accent trouve « Barrière »', noms('barriere de lille'), ['Casino Barrière de Lille']);
eq('« BARRIÈRE » en majuscules aussi', noms('BARRIÈRE DE LILLE'), ['Casino Barrière de Lille']);
vrai('« mediterranee » trouve « Méditerranée »', noms('mediterranee').includes('Palais de la Méditerranée, Nice'));

// ── 7. Alias ───────────────────────────────────────────────────────────────────────────────────
vrai('« the vic » trouve le Grosvenor Victoria', noms('the vic').includes('Grosvenor Victoria, Londres'));
vrai('« london » trouve les salles de Londres', noms('london').some((n) => n.includes('Londres')));
vrai('« manila » trouve les salles de Manille', noms('manila').some((n) => n.includes('Manille')));
vrai('« casino barcelona » trouve « Casino de Barcelone »', noms('casino barcelona').includes('Casino de Barcelone'));
vrai('« dtd » trouve Dusk Till Dawn', noms('dtd').includes('Dusk Till Dawn, Nottingham'));

// ── 8. Le classement, rang par rang ────────────────────────────────────────────────────────────
// Rang 0 (le nom commence par la saisie) passe devant rang 1 (un mot du nom commence par la saisie).
// « Grand » : huit « Grand Casino … » au rang 0, trois « … Grand … » au rang 1. Les cinq places
// doivent toutes revenir au rang 0.
const grand = noms('Grand');
vrai('rang 0 avant rang 1 : aucun « MGM Grand » sur « Grand »',
  grand.every((n) => n.startsWith('Grand')), JSON.stringify(grand));
// Rang 1 (un mot du nom) passe devant rang 2 (il a fallu un alias).
const vegas = noms('Vegas');
vrai('rang 1 avant rang 2 : « Las Vegas » du nom avant les alias',
  vegas.every((n) => n.includes('Las Vegas') || n.includes('Budapest')),
  JSON.stringify(vegas));
// Alphabétique à l'intérieur d'un rang — une fois le phare mis à part, puisqu'il précède ses pairs.
const PHARES = new Set(LIEUX.filter((l) => l.phare).map((l) => l.nom));
const casinos = noms('Casino');
const pairs = casinos.filter((n) => !PHARES.has(n));
eq('alphabétique entre pairs', pairs, [...pairs].sort((a, b) => a.localeCompare(b, 'fr')));
vrai('et le phare est bien en tête', PHARES.has(casinos[0]), JSON.stringify(casinos));

// ── 8 bis. La salle de référence d'une enseigne passe devant ses succursales ───────────────────
// SIGNALÉ PAR VICTOR À L'USAGE : « grosvenor » renvoyait Birmingham, Brighton, Bristol, Cardiff et
// Edinburgh — par ordre alphabétique — et pas le Vic, la plus grande salle de Londres. L'alphabet
// départage des inconnues, jamais une référence et ses succursales.
eq('« grosvenor » donne le Vic en premier', noms('grosvenor')[0], 'Grosvenor Victoria, Londres');
eq('« barrière » donne Enghien en premier', noms('barrière')[0], "Casino Barrière d'Enghien-les-Bains");
eq('« spielbank » donne Berlin en premier', noms('spielbank')[0], 'Spielbank Berlin');
eq('« seminole » donne le Hard Rock en premier', noms('seminole')[0], 'Seminole Hard Rock, Miami');
eq('« holland » donne Amsterdam en premier', noms('holland')[0], 'Holland Casino Amsterdam');
// TÉMOIN : le phare ne saute PAS de rang, il ne fait que devancer ses pairs. « Casino » commence
// huit noms au rang 0 ; Enghien, qui est un phare mais au rang 1, ne doit pas leur passer devant.
vrai('le phare ne double pas un rang meilleur', noms('Casino').every((n) => n.startsWith('Casino')), JSON.stringify(noms('Casino')));

// ── 8 ter. Les villes qu'un lecteur reconnaît ─────────────────────────────────────────────────
// SIGNALÉ PAR VICTOR À L'USAGE : « miami » ne renvoyait rien, alors que la Floride du Sud est une
// des places fortes du poker américain.
vrai('« miami » propose quelque chose', noms('miami').length >= 4, JSON.stringify(noms('miami')));
// TÉMOIN de la leçon du Vic, rejouée : tant que « Miami » n'était qu'un ALIAS du Hard Rock, il
// tombait au rang 2, derrière trois salles bien plus petites — le phare ne rattrape pas un rang.
// La ville affichée n'est donc pas qu'un habillage : elle décide du classement.
eq('« miami » donne le Hard Rock en premier', noms('miami')[0], 'Seminole Hard Rock, Miami');
// « Hollywood » seul, en Floride, se lit comme Hollywood à Los Angeles : le seul nom du fichier
// qui désignait deux endroits à 4 000 km l'un de l'autre.
vrai('aucun lieu ne s’affiche « Hollywood » tout court',
  !LIEUX.some((l) => /,\s*Hollywood$/.test(l.nom)), JSON.stringify(LIEUX.filter((l) => /Hollywood/.test(l.nom)).map((l) => l.nom)));

// ── 9. Chaque morceau doit AMORCER un mot ──────────────────────────────────────────────────────
// TÉMOIN : en sous-chaîne libre, « as » ramènerait les deux cents entrées contenant « casino ».
eq('« asin » ne ramène pas tous les « casino »', noms('asin'), []);
eq('« ega » ne ramène pas « Las Vegas »', noms('ega'), []);
vrai('mais « veg » amorce bien « Vegas »', noms('veg').length > 0);

// ── 10. Rien à proposer sur un lieu déjà choisi ────────────────────────────────────────────────
// Après avoir touché une suggestion, le champ contient exactement son nom : laisser la liste
// ouverte sur cette seule ligne n'offrirait plus rien à faire.
eq('un nom exact de la banque ne propose plus rien', noms('Bellagio, Las Vegas'), []);
eq('la casse ne change rien à ce silence', noms('bellagio, las vegas'), []);
vrai('mais le modifier rouvre les suggestions', noms('Bellagio, Las Veg').length > 0);

// ── 11. En ligne ───────────────────────────────────────────────────────────────────────────────
vrai('« Wina » trouve Winamax', noms('Wina').includes('Winamax'));
vrai('« GGP » trouve GGPoker', noms('GGP').includes('GGPoker'));
// TÉMOIN : « Win » est ambigu — la salle en ligne ET le WinStar. Les deux doivent sortir.
const win = noms('Win');
vrai('« Win » propose Winamax ET WinStar', win.includes('Winamax') && win.some((n) => n.startsWith('WinStar')), JSON.stringify(win));

// ── Résultat ───────────────────────────────────────────────────────────────────────────────────
console.log(`\nBanque : ${LIEUX.length} lieux.`);
console.log(`${ok} vérifications passées, ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
