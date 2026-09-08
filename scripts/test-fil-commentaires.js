// La forme du fil de commentaires : un arbre en base, deux niveaux à l'écran.
// ──────────────────────────────────────────────────────────────────────────
// Depuis le 07/09/2026, « Répondre » figure sur TOUTES les lignes et une réponse s'attache au
// commentaire réellement visé : la chaîne des parents peut compter trois maillons ou davantage.
// L'écran, lui, ne montre jamais plus de deux niveaux. Ce script protège les deux invariants qui
// tiennent l'ensemble :
//   A. AFFICHAGE — tout commentaire chargé est rendu EXACTEMENT une fois, soit comme racine, soit
//      sous la sienne. Ni deux fois (fil dupliqué), ni zéro (le bug de 41414af : des réponses
//      disparaissaient du fil pendant que le compteur de la main continuait de les compter) ;
//   B. SUPPRESSION — retirer un commentaire retire toute sa descendance, comme le fait la base
//      (`on delete cascade`), et ne laisse donc aucun orphelin remonter au premier niveau.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/components/post/filCommentaires.ts \
//     --outDir scripts/fc --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-fil-commentaires.js

const { aplatirFil, descendance } = require('./fc/components/post/filCommentaires.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  const ok = a === o;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${a} · obtenu ${o}`);
}

/** `c('b', 'a')` = le commentaire `b`, réponse à `a`. Sans parent : une racine. */
const c = (id, parentCommentId) => ({ id, parentCommentId });
const ids = (liste) => liste.map((x) => x.id);
const tries = (ensemble) => [...ensemble].sort();

// ── 1. Le fil de la capture d'écran de Victor ────────────────────────────────────────────────────
// luca ouvre, Victor répond, luca répond À VICTOR, Victor répond à luca. Puis un second fil.
// Attendu à l'écran : deux racines, et sous la première trois réponses au MÊME décalage, dans
// l'ordre où elles ont été écrites — pas de cascade, pas de troisième cran.
const filVictor = [
  c('luca-flop'),
  c('victor-intuition', 'luca-flop'),
  c('luca-400', 'victor-intuition'),
  c('victor-yes', 'luca-400'),
  c('luca-turn'),
  c('victor-450', 'luca-turn'),
];
{
  const { racines, reponsesDe } = aplatirFil(filVictor);
  cas('deux racines', ids(racines), ['luca-flop', 'luca-turn']);
  cas(
    'la réponse à une réponse se range sous la MÊME racine, dans l’ordre d’écriture',
    ids(reponsesDe('luca-flop')),
    ['victor-intuition', 'luca-400', 'victor-yes']
  );
  cas('le second fil reste séparé', ids(reponsesDe('luca-turn')), ['victor-450']);
  // Un commentaire ne se range jamais sous une réponse : ce serait le troisième cran.
  cas('aucune réponse sous une réponse', ids(reponsesDe('victor-intuition')), []);
}

// ── 2. Profondeur : cinq maillons, toujours deux niveaux ─────────────────────────────────────────
{
  const fil = [c('r'), c('a', 'r'), c('b', 'a'), c('c', 'b'), c('d', 'c'), c('e', 'd')];
  const { racines, reponsesDe } = aplatirFil(fil);
  cas('une seule racine', ids(racines), ['r']);
  cas('les cinq descendants à plat', ids(reponsesDe('r')), ['a', 'b', 'c', 'd', 'e']);
}

// ── 3. Parent absent : modération, blocage ───────────────────────────────────────────────────────
// `a` a été retiré par la modération : les autres lecteurs ne le reçoivent plus. Ses réponses, si.
// Elles doivent remonter au premier niveau — jamais disparaître.
{
  const fil = [c('r'), c('b', 'a'), c('c', 'b')];
  const { racines, reponsesDe } = aplatirFil(fil);
  cas('la réponse orpheline devient une racine', ids(racines), ['r', 'b']);
  cas('et garde sa propre descendance', ids(reponsesDe('b')), ['c']);
  cas('la racine intacte reste vide', ids(reponsesDe('r')), []);
}

// ── 4. Cycle : impossible en principe, mais il ne doit rien faire disparaître ────────────────────
{
  const fil = [c('x', 'y'), c('y', 'x'), c('libre')];
  const { racines, reponsesDe } = aplatirFil(fil);
  cas('les deux maillons du cycle sont rendus', tries(new Set(ids(racines))), ['libre', 'x', 'y']);
  cas('et n’emportent personne avec eux', ids(reponsesDe('x')), []);
}

// ── 5. Liste vide ────────────────────────────────────────────────────────────────────────────────
{
  const { racines, reponsesDe } = aplatirFil([]);
  cas('aucun commentaire : aucune racine', ids(racines), []);
  cas('aucun commentaire : aucune réponse', ids(reponsesDe('rien')), []);
}

// ── 6. La suppression emporte TOUTE la descendance ───────────────────────────────────────────────
{
  cas('supprimer la racine emporte le fil entier',
    tries(descendance(filVictor, 'luca-flop')),
    ['luca-400', 'luca-flop', 'victor-intuition', 'victor-yes']);
  cas('supprimer un maillon du milieu emporte ce qui pend dessous',
    tries(descendance(filVictor, 'victor-intuition')),
    ['luca-400', 'victor-intuition', 'victor-yes']);
  cas('supprimer une feuille n’emporte qu’elle',
    tries(descendance(filVictor, 'victor-yes')),
    ['victor-yes']);
  cas('le second fil n’est jamais touché',
    tries(descendance(filVictor, 'luca-turn')),
    ['luca-turn', 'victor-450']);
  cas('un id inconnu ne retire que lui-même (rien, en pratique)',
    tries(descendance(filVictor, 'inconnu')),
    ['inconnu']);
  // Un cycle ne doit pas faire tourner la boucle indéfiniment.
  cas('cycle : la descendance se referme',
    tries(descendance([c('x', 'y'), c('y', 'x')], 'x')),
    ['x', 'y']);
}

// ── 7. Une liste dans le désordre ────────────────────────────────────────────────────────────────
// La base renvoie les commentaires par date croissante, donc un parent précède toujours sa réponse.
// Rien ne le GARANTIT côté client — et une propagation en une seule passe se contenterait de cet
// ordre sans jamais le dire. Ce fil-là est écrit à l'envers, enfants d'abord.
{
  const alEnvers = [c('d', 'c'), c('c', 'b'), c('b', 'a'), c('a')];
  const { racines, reponsesDe } = aplatirFil(alEnvers);
  cas('désordre : une seule racine', ids(racines), ['a']);
  cas('désordre : tout à plat, dans l’ordre de la liste', ids(reponsesDe('a')), ['d', 'c', 'b']);
  cas('désordre : la suppression descend jusqu’au bout',
    tries(descendance(alEnvers, 'a')), ['a', 'b', 'c', 'd']);
}

// ── 8. Les deux invariants, sur 5 000 fils tirés au hasard ───────────────────────────────────────
// Générateur déterministe (xorshift) : un échec se rejoue à l'identique.
let graine = 20260907;
const alea = () => {
  graine ^= graine << 13; graine ^= graine >>> 17; graine ^= graine << 5;
  return ((graine >>> 0) % 100000) / 100000;
};

let filsRendusPile = 0;
let filsSansOrphelin = 0;
const TIRAGES = 5000;
for (let t = 0; t < TIRAGES; t++) {
  const taille = 1 + Math.floor(alea() * 12);
  // Chaque commentaire ne peut répondre qu'à un commentaire ANTÉRIEUR : c'est la règle de la base
  // (le parent existe forcément avant), et elle interdit les cycles par construction.
  const tous = [];
  for (let i = 0; i < taille; i++) {
    const racine = i === 0 || alea() < 0.3;
    tous.push(c(`k${i}`, racine ? undefined : `k${Math.floor(alea() * i)}`));
  }
  // Puis on en masque quelques-uns, comme le fait la modération ou un blocage : le commentaire
  // disparaît de la liste reçue, mais pas les réponses des autres en dessous.
  const visibles = tous.filter((x) => alea() >= 0.15);

  // A — chaque commentaire visible est rendu exactement une fois.
  const { racines, reponsesDe } = aplatirFil(visibles);
  const rendus = [];
  for (const r of racines) {
    rendus.push(r.id);
    for (const rep of reponsesDe(r.id)) rendus.push(rep.id);
  }
  const uneFois =
    rendus.length === visibles.length &&
    new Set(rendus).size === visibles.length &&
    visibles.every((x) => rendus.includes(x.id));
  if (uneFois) filsRendusPile++;
  else if (filsRendusPile === t) console.log('   fil fautif (A) :', JSON.stringify(visibles));

  // B — après une suppression, plus aucun orphelin : tout ce qui reste a son parent présent, ou
  //     n'en avait pas dans la liste de départ.
  if (visibles.length > 0) {
    const cible = visibles[Math.floor(alea() * visibles.length)].id;
    const retires = descendance(visibles, cible);
    const restants = visibles.filter((x) => !retires.has(x.id));
    const avant = new Set(visibles.map((x) => x.id));
    const apres = new Set(restants.map((x) => x.id));
    const propre = restants.every((x) => !x.parentCommentId || !avant.has(x.parentCommentId) || apres.has(x.parentCommentId));
    if (propre) filsSansOrphelin++;
    else if (filsSansOrphelin === t) console.log('   fil fautif (B) :', cible, JSON.stringify(visibles));
  } else {
    filsSansOrphelin++;
  }
}
cas(`invariant A sur ${TIRAGES} fils : chacun rendu une fois et une seule`, filsRendusPile, TIRAGES);
cas(`invariant B sur ${TIRAGES} fils : aucune suppression ne laisse d’orphelin`, filsSansOrphelin, TIRAGES);

console.log(ko === 0 ? '\n✅ Tout est vert.' : `\n❌ ${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
