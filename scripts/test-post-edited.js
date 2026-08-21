// Non-régression de la mention « modifié » sous le pseudo.
// ───────────────────────────────────────────────────────
// Ce que ce script protège, et qui a été tranché avant d'écrire une ligne :
//   1. délai de grâce de 5 minutes — corriger une coquille juste après publication ne marque rien ;
//   2. le seuil est STRICT : à 5 min pile, toujours rien ; c'est la seconde d'après qui bascule ;
//   3. la fenêtre se compte depuis la PUBLICATION, jamais depuis maintenant. Sinon la mention
//      apparaîtrait toute seule cinq minutes plus tard, sous les yeux d'un lecteur qui n'a rien vu
//      changer — et une main d'il y a un an, corrigée dans sa première minute, se retrouverait
//      marquée pour toujours ;
//   4. une date absente ou illisible n'affiche RIEN (jamais un « modifié » sorti d'un NaN) ;
//   5. une modification antérieure à la publication (horloge de travers côté base) n'affiche rien.
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/postEdited.ts \
//     --outDir scripts/pe --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-post-edited.js

const { wasEdited, EDIT_GRACE_MS } = require('./pe/utils/postEdited.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${attendu} · obtenu ${obtenu}`);
}

// Une main publiée à une date fixe : tous les cas se lisent en décalage par rapport à elle.
const PUBLIE = '2026-08-21T14:00:00.000Z';
const apres = (ms) => new Date(Date.parse(PUBLIE) + ms).toISOString();
const main = (editedAt) => ({ createdAt: PUBLIE, editedAt });

// ── 1. Jamais retouchée ──────────────────────────────────────────────────────────────────────────
cas('jamais modifiée : rien', wasEdited(main(undefined)), false);

// ── 2. Le délai de grâce ─────────────────────────────────────────────────────────────────────────
cas('corrigée 30 s après publication : rien', wasEdited(main(apres(30 * 1000))), false);
cas('corrigée 3 min après publication : rien', wasEdited(main(apres(3 * 60 * 1000))), false);
cas('5 minutes pile : rien (seuil strict)', wasEdited(main(apres(EDIT_GRACE_MS))), false);
cas('5 min et 1 s : « modifié »', wasEdited(main(apres(EDIT_GRACE_MS + 1000))), true);
cas('corrigée 2 h après : « modifié »', wasEdited(main(apres(2 * 3600 * 1000))), true);

// ── 3. La fenêtre part de la publication, pas de maintenant ──────────────────────────────────────
// Le piège que ce cas ferme : avec `Date.now() - edited > 5 min`, cette main afficherait « modifié »
// alors que sa seule retouche a eu lieu dans sa première minute d'existence.
const VIEUX = '2025-01-05T09:00:00.000Z';
cas('main d’il y a un an, corrigée à +1 min : rien',
  wasEdited({ createdAt: VIEUX, editedAt: new Date(Date.parse(VIEUX) + 60 * 1000).toISOString() }), false);
cas('main d’il y a un an, corrigée à +1 h : « modifié »',
  wasEdited({ createdAt: VIEUX, editedAt: new Date(Date.parse(VIEUX) + 3600 * 1000).toISOString() }), true);

// ── 4. Dates douteuses ───────────────────────────────────────────────────────────────────────────
cas('edited_at illisible : rien', wasEdited(main('pas une date')), false);
cas('created_at illisible : rien', wasEdited({ createdAt: 'jamais', editedAt: apres(3600 * 1000) }), false);
cas('chaîne vide : rien', wasEdited(main('')), false);

// ── 5. Horloge de travers ────────────────────────────────────────────────────────────────────────
cas('modification AVANT la publication : rien', wasEdited(main(apres(-3600 * 1000))), false);

console.log(ko === 0 ? '\n🎉 tout passe' : `\n${ko} cas en échec`);
process.exit(ko === 0 ? 0 : 1);
