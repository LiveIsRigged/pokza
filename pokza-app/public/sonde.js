// Script de la sonde clavier (`sonde.html`).
// SÉPARÉ DU HTML PAR OBLIGATION : la CSP de Pokza est `script-src 'self'` — sans `unsafe-inline`,
// un `<script>` en ligne est bloqué en silence. La page s'affichait, et rien ne réagissait.
//
// VERSION 2, après le premier rapport de Victor (03/09/2026, 10:38). La version 1 ne prenait de
// mesure que sur ÉVÉNEMENT : `visualViewport.resize`, `scroll`. Sur son iPhone aucun de ces
// événements ne s'est déclenché, donc entre le focus et le blur elle n'a rien enregistré du tout.
// On échantillonne désormais au CHRONOMÈTRE, et surtout on mesure LA POSITION DU CHAMP À L'ÉCRAN —
// la seule grandeur qui corresponde à ce que Victor voit : « ça remonte ».
// On enregistre aussi le défilement du conteneur intérieur : si c'est lui qui bouge et non la page,
// aucune manipulation de la hauteur de la racine ne pourra jamais y changer quoi que ce soit.
(function () {
  var racine = document.documentElement;
  var vue = window.visualViewport;
  var journal = document.getElementById('journal');
  var verdict = document.getElementById('verdict');
  var champ = document.getElementById('champ');
  var dedans = document.querySelector('main');
  var mode = 'A';
  var lignes = [];
  var t0 = 0;
  var focalise = false;
  var reference = null; // position du champ au moment du toucher
  var pire = 0;
  var minuteur = null;

  var CLE = 'sonde-clavier-hauteur';
  function retenue() { try { return parseInt(localStorage.getItem(CLE), 10) || 0; } catch (e) { return 0; } }
  function retenir(px) { try { localStorage.setItem(CLE, String(px)); } catch (e) {} }

  function etat() {
    var r = champ.getBoundingClientRect();
    return {
      inner: window.innerHeight,
      visible: vue ? Math.round(vue.height) : window.innerHeight,
      offset: vue ? Math.round(vue.offsetTop) : 0,
      scroll: Math.round(window.scrollY || 0),
      dedans: Math.round(dedans ? dedans.scrollTop : 0),
      champY: Math.round(r.top),
      actif: document.activeElement === champ,
      echelle: vue ? Math.round(vue.scale * 100) / 100 : 1,
      variable: racine.style.getPropertyValue('--hauteur-app') || '—'
    };
  }

  function cadrans(e) {
    document.getElementById('c-inner').textContent = e.inner;
    document.getElementById('c-visible').textContent = e.visible;
    document.getElementById('c-offset').textContent = e.offset;
    document.getElementById('c-scroll').textContent = e.dedans;
    document.getElementById('cad-offset').dataset.chaud = e.offset > 0 ? 'oui' : 'non';
    document.getElementById('cad-scroll').dataset.chaud = e.dedans > 0 ? 'oui' : 'non';
  }

  function noter(quoi) {
    var e = etat();
    cadrans(e);
    if (reference !== null) {
      var bouge = Math.abs(reference - e.champY);
      if (bouge > pire) pire = bouge;
    }
    var ms = t0 ? String(Date.now() - t0).padStart(5, ' ') : '    0';
    lignes.push(
      ms + 'ms ' + quoi.padEnd(10, ' ') +
      ' page=' + String(e.inner).padStart(4) +
      ' vis=' + String(e.visible).padStart(4) +
      ' off=' + String(e.offset).padStart(3) +
      ' pageScr=' + String(e.scroll).padStart(4) +
      ' dedans=' + String(e.dedans).padStart(4) +
      ' CHAMP=' + String(e.champY).padStart(5) +
      ' foc=' + (e.actif ? 'o' : 'n') +
      ' ech=' + e.echelle +
      ' var=' + e.variable
    );
    journal.textContent = lignes.join('\n');
    journal.scrollTop = journal.scrollHeight;
    return e;
  }

  function afficherVerdict(e) {
    var clavierVu = e && (e.inner - e.visible) > 120;
    if (pire > 4) {
      verdict.dataset.etat = 'glisse';
      verdict.textContent = 'Mode ' + mode + ' : le champ a bougé de ' + pire + ' px'
        + (clavierVu ? '' : ' — et le clavier n\'a JAMAIS été détecté');
    } else {
      verdict.dataset.etat = 'tient';
      verdict.textContent = 'Mode ' + mode + ' : le champ n\'a pas bougé'
        + (clavierVu ? '' : ' (clavier jamais détecté)');
    }
  }

  function poser(px) {
    if (px === null) { racine.style.removeProperty('--hauteur-app'); return; }
    racine.style.setProperty('--hauteur-app', Math.round(px) + 'px');
    // `AjusteurHauteur` fait exactement ceci : sans lui, la sonde ne teste pas ce qui tourne.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }

  // ── Échantillonnage au chronomètre : c'est LUI qui remplace les événements ─────────────────
  function battre(etiquette, duree) {
    if (minuteur) clearInterval(minuteur);
    var fin = Date.now() + duree;
    minuteur = setInterval(function () {
      noter(etiquette);
      if (Date.now() > fin) { clearInterval(minuteur); minuteur = null; }
    }, 150);
  }

  function surFocus() {
    focalise = true;
    pire = 0;
    t0 = Date.now();
    lignes.push('── mode ' + mode + ' ' + '─'.repeat(30));
    var e = noter('focus');
    reference = e.champY; // la position AVANT que quoi que ce soit ne bouge
    if (mode === 'C') {
      // 410 px mesures le 03/09 sur l iPhone de Victor. On rogne genereusement : trop court ne
      // fait jamais glisser, trop long si.
      var devinee = retenue() || 410;
      poser(window.innerHeight - devinee - 20);
      noter('C:devine');
    }
    battre('  tic', 2500);
  }

  function surResize() {
    var e = noter('RESIZE');
    var retrait = e.inner - e.visible;
    if (retrait > 120 && focalise) retenir(retrait);
    if ((mode === 'B' || mode === 'C') && retrait > 120) { poser(e.visible); noter('  cale'); }
  }

  function surBlur() {
    focalise = false;
    noter('blur');
    battre('  tic', 900);
    setTimeout(function () {
      poser(null);
      reference = null;
      afficherVerdict(noter('fin'));
    }, 1100);
  }

  champ.addEventListener('focus', surFocus);
  champ.addEventListener('blur', surBlur);
  if (vue) {
    vue.addEventListener('resize', surResize);
    vue.addEventListener('scroll', function () { noter('vv-scroll'); });
  }
  window.addEventListener('scroll', function () { noter('pageScroll'); });
  if (dedans) dedans.addEventListener('scroll', function () { noter('DEDANS'); });

  document.getElementById('modes').addEventListener('click', function (ev) {
    var carte = ev.target.closest('.mode');
    if (!carte) return;
    mode = carte.dataset.mode;
    [].forEach.call(document.querySelectorAll('.mode'), function (m) {
      m.dataset.actif = m === carte ? 'oui' : 'non';
    });
    poser(null);
    pire = 0;
    reference = null;
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
    var texte = [
      'Sonde v3 — ' + new Date().toLocaleString('fr-FR'),
      'écran ' + screen.width + '×' + screen.height + ' · dpr ' + window.devicePixelRatio,
      'standalone : ' + (window.navigator.standalone === true ? 'OUI (écran d\'accueil)' : 'non (onglet Safari)'),
      ''
    ].join('\n') + lignes.join('\n');
    var fini = function (ok) {
      bouton.textContent = ok ? 'Copié' : 'Sélectionne le journal';
      setTimeout(function () { bouton.textContent = 'Copier le rapport'; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).then(function () { fini(true); }, function () { fini(false); });
    } else { fini(false); }
  });

  // Bandeau : la mesure qui compte est celle du mode application, pas celle d'un onglet.
  if (window.navigator.standalone !== true) {
    var avis = document.createElement('div');
    avis.className = 'verdict';
    avis.style.marginTop = '8px';
    avis.textContent = 'Tu es dans un onglet Safari. Pokza tourne en mode application : Partager → Sur l\'écran d\'accueil, puis refais la mesure depuis là.';
    verdict.parentNode.insertBefore(avis, verdict.nextSibling);
  }

  cadrans(etat());
})();
