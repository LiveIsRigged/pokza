// Les textes des aperçus de liens, DÉRIVÉS du catalogue au lieu d'être recopiés.
// ──────────────────────────────────────────────────────────────────────────────
// `pokza-app/worker.js` fabrique les balises Open Graph des liens partagés (vignettes WhatsApp,
// Discord, Slack). Il s'exécute sur Cloudflare, hors du bundle de l'app : il ne peut pas importer
// `fr.json`. Sans ce fichier, ses quatre phrases existeraient EN DOUBLE, écrites à la main des deux
// côtés — et rien ne signalerait qu'on en a modifié une seule. C'est exactement le défaut que
// `i18n-push.js` a supprimé pour les notifications ; même patron, autre cible.
//
//   node scripts/i18n-apercu.js            → réécrit pokza-app/worker-textes.json
//   node scripts/i18n-apercu.js --verifier → ne réécrit rien, sort en erreur s'il a dérivé
//
// `i18n-audit.js` lance la seconde forme et compte un trou si ça a dérivé. Après toute modification
// d'une des quatre clés : relancer, relancer aussi `carte-apercu.py` si `apercu.phrase` a bougé
// (elle est peinte sur les vignettes), puis pousser — Cloudflare redéploie tout seul.
//
// ⚠️ DEUX DES QUATRE CLÉS SONT PARTAGÉES AVEC L'APP (`accueil_groupe.titre`, `accueil_profil.titre`)
// et c'est voulu : la phrase lue dans WhatsApp doit être celle qu'on lit après le clic, sinon le
// clic ressemble à une erreur. Les changer change les deux à la fois, ce qui est le but.

const fs = require('fs');
const path = require('path');

const CATALOGUES = path.join(__dirname, '..', 'pokza-app', 'src', 'i18n', 'catalogues');
const CIBLE = path.join(__dirname, '..', 'pokza-app', 'worker-textes.json');

// Ce dont le Worker a besoin, et rien de plus. Les noms courts sont ceux qu'il emploie.
const NECESSAIRES = {
  phrase: 'apercu.phrase',          // la phrase d'en-tête, sous chaque lien
  main: 'apercu.main',              // la description d'une main partagée
  groupe: 'accueil_groupe.titre',   // « {nom} t'invite dans le groupe {groupe} »
  profil: 'accueil_profil.titre',   // « {nom} t'invite sur Pokza »
};

const langues = fs
  .readdirSync(CATALOGUES)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.source.json'))
  .map((f) => f.replace(/\.json$/, ''));

const sortie = {};
const manquantes = [];
for (const langue of langues) {
  const cat = JSON.parse(fs.readFileSync(path.join(CATALOGUES, `${langue}.json`), 'utf8'));
  const textes = {};
  for (const [nom, cle] of Object.entries(NECESSAIRES)) {
    const valeur = cat[cle];
    // Une langue incomplète n'est pas une erreur : le Worker retombera sur le français, comme il le
    // fait déjà pour une main sans langue détectée. Seul le français, la source, doit être entier.
    if (typeof valeur === 'string') textes[nom] = valeur;
    else if (langue === 'fr') manquantes.push(`${langue} : ${cle}`);
  }
  sortie[langue] = textes;
}

if (manquantes.length > 0) {
  console.error('✗ clés absentes du catalogue source :');
  for (const m of manquantes) console.error(`      ${m}`);
  process.exit(2);
}

const contenu = JSON.stringify(sortie, null, 2) + '\n';

if (process.argv.includes('--verifier')) {
  const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
  if (actuel !== contenu) {
    console.error("✗ pokza-app/worker-textes.json a dérivé du catalogue.");
    console.error('  Relancer : node scripts/i18n-apercu.js');
    process.exit(1);
  }
  console.log('✓ les textes des aperçus correspondent au catalogue');
  process.exit(0);
}

fs.writeFileSync(CIBLE, contenu, 'utf8');
console.log(
  `✓ ${langues.length} langue(s) × ${Object.keys(NECESSAIRES).length} textes → ` +
    path.relative(path.join(__dirname, '..'), CIBLE)
);
console.log('  Ne pas le modifier à la main : il est régénéré.');
