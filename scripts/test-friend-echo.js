// Non-régression de la mention « Julien a aimé cette main ».
// ─────────────────────────────────────────────────────────
// Ce que ce script protège, et qui a été tranché avant d'écrire une ligne :
//   1. commenter prime sur aimer, et les deux verbes ne se mélangent JAMAIS sur une ligne ;
//   2. le compte affiché est celui des amis DISTINCTS de la réaction retenue ;
//   3. le nom montré est celui de l'ami qui a réagi en dernier ;
//   4. au plus 3 mentions par page de 10 — ni 100 %, ni tirage au sort ;
//   5. la sélection est TOTALEMENT déterministe : même page rechargée, mêmes mentions, sinon
//      elles clignotent quand on remonte dans le fil ;
//   6. la formulation reste sur une seule ligne (un seul pseudo, « un autre ami » et pas
//      « 1 autre ami », qui se lit comme un bogue d'affichage).
//
// Compiler d'abord (le `tsc` local, pas `npx tsc` — cf. mémoire projet) :
//   pokza-app/node_modules/.bin/tsc pokza-app/src/utils/friendEchoSelection.ts \
//     pokza-app/src/utils/friendEchoLabel.ts \
//     --outDir scripts/fe --module commonjs --target es2020 --rootDir pokza-app/src --skipLibCheck
// puis : node scripts/test-friend-echo.js

const { pickFriendEchoes, FRIEND_ECHO_MAX_PER_PAGE } = require('./fe/utils/friendEchoSelection.js');
const { friendEchoLabel } = require('./fe/utils/friendEchoLabel.js');

let ko = 0;
function cas(titre, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(`${ok ? '✅' : '❌'} ${titre}`);
  if (!ok) console.log(`   attendu ${JSON.stringify(attendu)} · obtenu ${JSON.stringify(obtenu)}`);
}

const pseudos = new Map([['u1', 'Julien'], ['u2', 'Marc'], ['u3', 'Léa'], ['u4', 'Sam']]);
// Les lignes arrivent de la base déjà triées du plus récent au plus ancien : les jeux d'essai
// respectent cet ordre, sinon on testerait autre chose que ce qui tourne.
const r = (postId, userId, createdAt) => ({ postId, userId, createdAt });
const lu = (m) => [...m.entries()].sort().map(([id, e]) => [id, e.kind, e.name, e.otherCount]);

// ── 1. Commenter prime sur aimer ─────────────────────────────────────────────────────────────────
cas('un commentaire d’ami l’emporte sur trois likes d’amis',
  lu(pickFriendEchoes(['p1'],
    [r('p1', 'u2', '2026-08-21T12:00:00+00:00'), r('p1', 'u3', '2026-08-21T11:00:00+00:00'), r('p1', 'u4', '2026-08-21T10:00:00+00:00')],
    [r('p1', 'u1', '2026-08-20T09:00:00+00:00')], pseudos)),
  [['p1', 'comment', 'Julien', 0]]);

cas('sans commentaire d’ami, on retombe sur les likes',
  lu(pickFriendEchoes(['p1'], [r('p1', 'u2', '2026-08-21T12:00:00+00:00')], [], pseudos)),
  [['p1', 'like', 'Marc', 0]]);

// ── 2. Amis distincts, pas réactions ─────────────────────────────────────────────────────────────
cas('un ami qui commente trois fois reste UN ami',
  lu(pickFriendEchoes(['p1'], [],
    [r('p1', 'u1', '2026-08-21T12:00:00+00:00'), r('p1', 'u1', '2026-08-21T11:00:00+00:00'), r('p1', 'u1', '2026-08-21T10:00:00+00:00')], pseudos)),
  [['p1', 'comment', 'Julien', 0]]);

cas('trois amis distincts → « et 2 autres »',
  lu(pickFriendEchoes(['p1'],
    [r('p1', 'u3', '2026-08-21T12:00:00+00:00'), r('p1', 'u2', '2026-08-21T11:00:00+00:00'), r('p1', 'u1', '2026-08-21T10:00:00+00:00')], [], pseudos)),
  [['p1', 'like', 'Léa', 2]]);

// ── 3. Le compte suit la réaction RETENUE, pas le total ──────────────────────────────────────────
// Volontaire : la ligne dit « ont commenté », le nombre doit donc compter des commentateurs. Un
// post commenté par 1 ami et aimé par 4 affiche bien « Marc a commenté cette main ».
cas('1 commentaire + 4 likes → le compte est celui des commentateurs',
  lu(pickFriendEchoes(['p1'],
    [r('p1', 'u1', '2026-08-21T12:00:00+00:00'), r('p1', 'u3', '2026-08-21T11:00:00+00:00'), r('p1', 'u4', '2026-08-21T10:00:00+00:00')],
    [r('p1', 'u2', '2026-08-21T09:00:00+00:00')], pseudos)),
  [['p1', 'comment', 'Marc', 0]]);

// ── 4. Le plafond ────────────────────────────────────────────────────────────────────────────────
const cinq = ['p1', 'p2', 'p3', 'p4', 'p5'];
const likesCinq = [
  r('p1', 'u1', '2026-08-21T10:00:00+00:00'),
  r('p2', 'u1', '2026-08-21T11:00:00+00:00'), r('p2', 'u2', '2026-08-21T10:00:00+00:00'),
  r('p3', 'u1', '2026-08-21T12:00:00+00:00'), r('p3', 'u2', '2026-08-21T11:00:00+00:00'), r('p3', 'u3', '2026-08-21T10:00:00+00:00'),
  r('p4', 'u1', '2026-08-21T09:00:00+00:00'),
  r('p5', 'u2', '2026-08-21T13:00:00+00:00'), r('p5', 'u3', '2026-08-21T12:00:00+00:00'),
];
cas('plafond fixé à 3', FRIEND_ECHO_MAX_PER_PAGE, 3);
cas('5 mains éligibles → 3 mentions, celles où le plus d’amis ont réagi',
  lu(pickFriendEchoes(cinq, likesCinq, [], pseudos)),
  [['p2', 'like', 'Julien', 1], ['p3', 'like', 'Julien', 2], ['p5', 'like', 'Marc', 1]]);

// ── 5. Déterminisme ──────────────────────────────────────────────────────────────────────────────
// L'ordre dans lequel la page arrive ne doit RIEN changer : mêmes mains retenues, mêmes textes.
cas('page reçue dans un autre ordre → mentions identiques',
  lu(pickFriendEchoes([...cinq].reverse(), likesCinq, [], pseudos)),
  lu(pickFriendEchoes(cinq, likesCinq, [], pseudos)));

// Ex æquo parfaits (même nombre d'amis, même date) : c'est l'id qui tranche, jamais le hasard.
const exaequo = [
  r('pB', 'u1', '2026-08-21T10:00:00+00:00'), r('pA', 'u1', '2026-08-21T10:00:00+00:00'),
  r('pD', 'u1', '2026-08-21T10:00:00+00:00'), r('pC', 'u1', '2026-08-21T10:00:00+00:00'),
];
cas('ex æquo parfaits → les 3 plus petits ids, quel que soit l’ordre d’entrée',
  [lu(pickFriendEchoes(['pA', 'pB', 'pC', 'pD'], exaequo, [], pseudos)).map(([id]) => id),
   lu(pickFriendEchoes(['pD', 'pC', 'pB', 'pA'], exaequo, [], pseudos)).map(([id]) => id)],
  [['pA', 'pB', 'pC'], ['pA', 'pB', 'pC']]);

// ── 6. Ce qui ne doit produire aucune mention ────────────────────────────────────────────────────
cas('aucune réaction d’ami → aucune mention', lu(pickFriendEchoes(['p1'], [], [], pseudos)), []);
cas('compte supprimé entre-temps → on saute plutôt que d’écrire « ? a aimé »',
  lu(pickFriendEchoes(['p1'], [r('p1', 'inconnu', '2026-08-21T10:00:00+00:00')], [], pseudos)), []);

// ── 7. La formulation ────────────────────────────────────────────────────────────────────────────
cas('les six formulations',
  [
    friendEchoLabel({ kind: 'like', name: 'Julien', otherCount: 0 }),
    friendEchoLabel({ kind: 'like', name: 'Julien', otherCount: 1 }),
    friendEchoLabel({ kind: 'like', name: 'Julien', otherCount: 3 }),
    friendEchoLabel({ kind: 'comment', name: 'Marc', otherCount: 0 }),
    friendEchoLabel({ kind: 'comment', name: 'Marc', otherCount: 1 }),
    friendEchoLabel({ kind: 'comment', name: 'Marc', otherCount: 2 }),
  ],
  [
    'Julien a aimé cette main',
    'Julien et un autre ami ont aimé cette main',
    'Julien et 3 autres amis ont aimé cette main',
    'Marc a commenté cette main',
    'Marc et un autre ami ont commenté cette main',
    'Marc et 2 autres amis ont commenté cette main',
  ]);

console.log(ko === 0 ? '\nTOUT PASSE' : `\n${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
