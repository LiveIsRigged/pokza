// Script de la sonde clavier (`sonde.html`).
// SÉPARÉ DU HTML PAR OBLIGATION : la CSP de Pokza est `script-src 'self'` — sans `unsafe-inline`,
// un `<script>` en ligne est bloqué en silence. La page s'affichait, et rien ne réagissait.
(function () {
  var racine = document.documentElement;
  var vue = window.visualViewport;
  var journal = document.getElementById('journal');
  var verdict = document.getElementById('verdict');
  var champ = document.getElementById('champ');
  var mode = 'A';
  var lignes = [];
  var t0 = 0;
  var focalise = false;
  var pire = 0;

  // Hauteur de clavier retenue d'un essai sur l'autre : c'est ce que fait le mode C pour deviner
  // avant que le clavier n'arrive.
  var CLE = 'sonde-clavier-hauteur';
  function retenue() {
    try { return parseInt(localStorage.getItem(CLE), 10) || 0; } catch (e) { return 0; }
  }
  function retenir(px) {
    try { localStorage.setItem(CLE, String(px)); } catch (e) {}
  }

  function etat() {
    return {
      inner: window.innerHeight,
      visible: vue ? Math.round(vue.height) : window.innerHeight,
      offset: vue ? Math.round(vue.offsetTop) : 0,
      pageTop: vue ? Math.round(vue.pageTop) : 0,
      scroll: Math.round(window.scrollY || 0),
      echelle: vue ? Math.round(vue.scale * 100) / 100 : 1,
      docHaut: Math.round(document.getElementById('app').getBoundingClientRect().bottom),
      variable: racine.style.getPropertyValue('--hauteur-app') || '—'
    };
  }

  function cadrans(e) {
    document.getElementById('c-inner').textContent = e.inner;
    document.getElementById('c-visible').textContent = e.visible;
    document.getElementById('c-offset').textContent = e.offset;
    document.getElementById('c-scroll').textContent = e.scroll;
    document.getElementById('cad-offset').dataset.chaud = e.offset > 0 ? 'oui' : 'non';
    document.getElementById('cad-scroll').dataset.chaud = e.scroll > 0 ? 'oui' : 'non';
  }

  function noter(evenement) {
    var e = etat();
    cadrans(e);
    var glissement = e.offset + e.scroll;
    if (focalise && glissement > pire) pire = glissement;
    var ms = t0 ? String(Date.now() - t0).padStart(5, ' ') : '    0';
    lignes.push(
      ms + 'ms ' + evenement.padEnd(11, ' ') +
      ' page=' + String(e.inner).padStart(4) +
      ' vis=' + String(e.visible).padStart(4) +
      ' off=' + String(e.offset).padStart(4) +
      ' scr=' + String(e.scroll).padStart(4) +
      ' bas=' + String(e.docHaut).padStart(4) +
      ' var=' + e.variable
    );
    journal.textContent = lignes.join('\n');
    journal.scrollTop = journal.scrollHeight;
    return e;
  }

  function afficherVerdict() {
    if (pire > 0) {
      verdict.dataset.etat = 'glisse';
      verdict.textContent = 'Mode ' + mode + ' : la page a glissé de ' + pire + ' px';
    } else {
      verdict.dataset.etat = 'tient';
      verdict.textContent = 'Mode ' + mode + ' : la page n\'a pas bougé';
    }
  }

  function poser(px) {
    if (px === null) racine.style.removeProperty('--hauteur-app');
    else racine.style.setProperty('--hauteur-app', Math.round(px) + 'px');
  }

  // ── Les trois modes ──────────────────────────────────────────────────────────
  function surFocus() {
    focalise = true;
    pire = 0;
    t0 = Date.now();
    lignes.push('── mode ' + mode + ' ' + '─'.repeat(46));
    noter('focus');
    if (mode === 'C') {
      // On rétrécit TOUT DE SUITE, avant que Safari ne décide de faire défiler pour révéler le
      // champ. La hauteur du clavier n'est pas encore connue : on la devine, généreusement (mieux
      // vaut trop petit que pas assez — trop petit ne fait jamais glisser).
      var devinee = retenue() || Math.round(window.innerHeight * 0.45);
      poser(window.innerHeight - devinee - 20);
      noter('C:devine');
    }
  }

  function surResize() {
    var e = noter('resize');
    var retrait = e.inner - e.visible;
    if (retrait > 120 && focalise) retenir(retrait);
    if ((mode === 'B' || mode === 'C') && retrait > 120) {
      poser(e.visible);
      noter('  cale');
    } else if ((mode === 'B' || mode === 'C') && retrait <= 120 && !focalise) {
      poser(null);
      noter('  relache');
    }
  }

  function surBlur() {
    focalise = false;
    noter('blur');
    setTimeout(function () {
      var e = etat();
      if (e.inner - e.visible <= 120) poser(null);
      noter('fin');
      afficherVerdict();
    }, 700);
  }

  champ.addEventListener('focus', surFocus);
  champ.addEventListener('blur', surBlur);
  if (vue) {
    vue.addEventListener('resize', surResize);
    vue.addEventListener('scroll', function () { noter('vv-scroll'); });
  }
  window.addEventListener('scroll', function () { noter('scroll'); });

  document.getElementById('modes').addEventListener('click', function (ev) {
    var carte = ev.target.closest('.mode');
    if (!carte) return;
    mode = carte.dataset.mode;
    [].forEach.call(document.querySelectorAll('.mode'), function (m) {
      m.dataset.actif = m === carte ? 'oui' : 'non';
    });
    poser(null);
    pire = 0;
    verdict.dataset.etat = '';
    verdict.textContent = 'Mode ' + mode + ' choisi — touche le champ';
  });

  document.getElementById('vider').addEventListener('click', function () {
    lignes = [];
    journal.textContent = '';
    verdict.dataset.etat = '';
    verdict.textContent = 'Journal vidé';
  });

  var bouton = document.getElementById('copier');
  bouton.addEventListener('click', function () {
    var entete = [
      'Sonde clavier — ' + new Date().toLocaleString('fr-FR'),
      'écran ' + screen.width + '×' + screen.height + ' · dpr ' + window.devicePixelRatio,
      'standalone : ' + (window.navigator.standalone === true ? 'OUI (depuis l\'écran d\'accueil)' : 'non (onglet Safari)'),
      'visualViewport : ' + (vue ? 'disponible' : 'ABSENT'),
      ''
    ].join('\n');
    var texte = entete + lignes.join('\n');
    var fini = function (ok) {
      bouton.textContent = ok ? 'Copié' : 'Sélectionne le journal';
      setTimeout(function () { bouton.textContent = 'Copier le rapport'; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(function () { fini(true); }, function () { fini(false); });
    } else { fini(false); }
  });

  cadrans(etat());
})();
