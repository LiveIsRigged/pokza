// Sonde AutoFill — fichier SÉPARÉ, et c'est obligatoire : la CSP de Pokza est
// `script-src 'self'` sans `unsafe-inline`. Un script en ligne serait bloqué, et la page
// n'afficherait AUCUN champ (c'est lui qui les construit).
(function () {
  // Chaque cas : le numero que Victor me rapportera, l'attribut pose, et ce qu'on cherche a savoir.
  const CAS = {
    texte: [
      { n: 1,  attrs: { autocomplete: 'off' },                 note: "l'état actuel de l'app — le témoin" },
      { n: 2,  attrs: {},                                       note: "aucun attribut : ce que react-native-web posait avant (autocomplete=\"on\")" },
      { n: 3,  attrs: { autocomplete: 'one-time-code' },        note: "jeton valide dont Safari n'a aucune donnée" },
      { n: 4,  attrs: { autocomplete: 'nickname' },             note: "jeton valide, mais Safari peut avoir un surnom en fiche" },
      { n: 5,  attrs: { autocomplete: 'off', name: 'pokza-libre' }, note: "un name explicite change-t-il l'heuristique ?" },
      { n: 6,  attrs: { autocomplete: 'off' }, forme: true,     note: "le même, mais dans un <form> — le contexte compte-t-il ?" },
      { n: 7,  attrs: { autocomplete: 'off', readonly: '' },    note: "readonly : ne pas retenir comme solution, seulement pour situer" }
    ],
    nombre: [
      { n: 8,  attrs: { autocomplete: 'off', inputmode: 'decimal' },              note: "l'état actuel des blindes, du stack, du straddle" },
      { n: 9,  attrs: { autocomplete: 'one-time-code', inputmode: 'decimal' },    note: "le même jeton que 3, sur un pavé numérique" },
      { n: 10, attrs: { autocomplete: 'transaction-amount', inputmode: 'decimal' }, note: "jeton HTML fait pour un montant — le candidat le plus juste sémantiquement" }
    ],
    multi: [
      { n: 11, attrs: { autocomplete: 'off' },                  note: "l'état actuel du champ de commentaire", zone: true },
      { n: 12, attrs: { autocomplete: 'one-time-code' },        note: "le même jeton que 3, sur un textarea", zone: true }
    ]
  };

  const REPONSES = [
    ['rien', 'Rien'],
    ['carte', 'Carte bancaire'],
    ['contact', 'Contact']
  ];
  const CLEF = 'pokza-sonde-autofill';

  let etat = {};
  try { etat = JSON.parse(localStorage.getItem(CLEF) || '{}'); } catch (e) { etat = {}; }

  function ecrire() {
    try { localStorage.setItem(CLEF, JSON.stringify(etat)); } catch (e) { /* navigation privée */ }
  }

  function resumer() {
    const par = { rien: [], carte: [], contact: [] };
    Object.keys(etat).forEach(function (n) { if (par[etat[n]]) par[etat[n]].push(Number(n)); });
    const ligne = function (clef, mot) {
      const l = par[clef].sort(function (a, b) { return a - b; });
      return l.length ? mot + ' : ' + l.join(', ') : '';
    };
    document.getElementById('resume').textContent =
      [ligne('rien', 'RIEN PROPOSÉ'), ligne('carte', 'carte bancaire'), ligne('contact', 'contact')]
        .filter(Boolean).join('\n');
  }

  function attributsLisibles(attrs) {
    const clefs = Object.keys(attrs);
    if (!clefs.length) return 'aucun attribut';
    return clefs.map(function (k) {
      return attrs[k] === '' ? k : k + '="' + attrs[k] + '"';
    }).join('  ');
  }

  Object.keys(CAS).forEach(function (section) {
    const hote = document.getElementById(section);
    CAS[section].forEach(function (cas) {
      const ligne = document.createElement('div');
      ligne.className = 'ligne';

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(cas.n).padStart(2, '0');
      ligne.appendChild(num);

      const jeton = document.createElement('code');
      jeton.className = 'jeton';
      jeton.textContent = attributsLisibles(cas.attrs);
      ligne.appendChild(jeton);

      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = cas.note;
      ligne.appendChild(note);

      const zone = document.createElement('div');
      zone.className = 'champ-zone';
      const champ = document.createElement(cas.zone ? 'textarea' : 'input');
      Object.keys(cas.attrs).forEach(function (k) { champ.setAttribute(k, cas.attrs[k]); });
      champ.setAttribute('aria-label', 'Champ de test numéro ' + cas.n);
      champ.setAttribute('placeholder', 'Tape ici, puis regarde au-dessus du clavier');
      if (cas.forme) {
        const forme = document.createElement('form');
        forme.addEventListener('submit', function (e) { e.preventDefault(); });
        forme.appendChild(champ);
        zone.appendChild(forme);
      } else {
        zone.appendChild(champ);
      }
      ligne.appendChild(zone);

      const rep = document.createElement('div');
      rep.className = 'reponses';
      rep.setAttribute('role', 'group');
      rep.setAttribute('aria-label', 'Ce que Safari a proposé pour le champ ' + cas.n);
      REPONSES.forEach(function (paire) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.r = paire[0];
        b.textContent = paire[1];
        b.setAttribute('aria-pressed', etat[cas.n] === paire[0] ? 'true' : 'false');
        b.addEventListener('click', function () {
          etat[cas.n] = etat[cas.n] === paire[0] ? undefined : paire[0];
          if (!etat[cas.n]) delete etat[cas.n];
          Array.prototype.forEach.call(rep.children, function (autre) {
            autre.setAttribute('aria-pressed', etat[cas.n] === autre.dataset.r ? 'true' : 'false');
          });
          ecrire();
          resumer();
        });
        rep.appendChild(b);
      });
      ligne.appendChild(rep);

      hote.appendChild(ligne);
    });
  });

  document.getElementById('raz').addEventListener('click', function () {
    etat = {};
    ecrire();
    resumer();
    Array.prototype.forEach.call(document.querySelectorAll('.reponses button'), function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
  });

  resumer();
})();

(function () {
  // `navigator.standalone` est le seul témoin fiable sur iOS. Sans ce bandeau, on risquait de
  // remesurer l'onglet Safari en croyant tester l'autonome — l'erreur exacte de la première manche.
  var autonome = window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  var el = document.getElementById('mode');
  el.dataset.ok = autonome ? 'oui' : 'non';
  el.textContent = autonome
    ? 'MODE AUTONOME ✓ — c\'est bien ici qu\'il faut mesurer.'
    : "ONGLET SAFARI — ce mode est déjà innocenté. Partage ▸ Ajouter à l'écran d'accueil, puis rouvre par l'icône.";
})();
