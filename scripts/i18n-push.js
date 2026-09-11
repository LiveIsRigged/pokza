// Les textes des notifications push, DÉRIVÉS du catalogue au lieu d'être recopiés.
// ──────────────────────────────────────────────────────────────────────────────
// Le push est fabriqué côté serveur, par une Edge Function Deno qui vit hors du bundle de l'app :
// elle ne peut pas importer `fr.json`. Les 14 phrases y existaient donc EN DOUBLE, écrites à la
// main des deux côtés — et rien ne signalait qu'on en avait modifié une seule.
//
// Ce script supprime la recopie sans supprimer la copie : le fichier reste, mais il est GÉNÉRÉ.
// `i18n-audit.js` vérifie qu'il correspond au catalogue et sort en erreur sinon.
//
//   node scripts/i18n-push.js            → réécrit supabase/functions/send-push/textes.json
//   node scripts/i18n-push.js --verifier → ne réécrit rien, sort en erreur s'il a dérivé
//
// À relancer après toute modification d'une clé `notif.*`, puis redéployer la fonction :
//   supabase functions deploy send-push --no-verify-jwt --project-ref <REF>

const fs = require('fs');
const path = require('path');

const CATALOGUES = path.join(__dirname, '..', 'pokza-app', 'src', 'i18n', 'catalogues');
const CIBLE = path.join(__dirname, '..', 'supabase', 'functions', 'send-push', 'textes.json');

// Ce dont la fonction a besoin, et rien de plus : les 13 types de notification, la variante avec
// lieu, et le repli quand l'auteur n'a pas de nom. Les clés y perdent leur préfixe `notif.` pour
// que le `switch` de la fonction reste lisible.
const NECESSAIRES = [
  'post_like', 'comment_like', 'post_comment', 'comment_reply',
  'friend_request', 'friend_accept', 'friend_posted', 'friend_posted_lieu',
  'group_invite', 'group_accept', 'group_posted',
  'report_resolved', 'content_removed', 'account_sanctioned',
  'quelquun',
];

const langues = fs
  .readdirSync(CATALOGUES)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.source.json'))
  .map((f) => f.replace(/\.json$/, ''));

const sortie = {};
const manquantes = [];
for (const langue of langues) {
  const cat = JSON.parse(fs.readFileSync(path.join(CATALOGUES, `${langue}.json`), 'utf8'));
  const textes = {};
  for (const nom of NECESSAIRES) {
    const valeur = cat[`notif.${nom}`];
    // Une langue incomplète n'est pas une erreur : la fonction retombera sur l'anglais, comme
    // l'app. Seul le français (source) et l'anglais (repli) doivent être entiers.
    if (typeof valeur === 'string') textes[nom] = valeur;
    else if (langue === 'fr' || langue === 'en') manquantes.push(`${langue} : notif.${nom}`);
  }
  sortie[langue] = textes;
}

if (manquantes.length > 0) {
  console.error('✗ clés absentes du catalogue source ou de repli :');
  for (const m of manquantes) console.error(`      ${m}`);
  process.exit(2);
}

const contenu = JSON.stringify(sortie, null, 2) + '\n';

if (process.argv.includes('--verifier')) {
  const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
  if (actuel !== contenu) {
    console.error('✗ supabase/functions/send-push/textes.json a dérivé du catalogue.');
    console.error('  Relancer : node scripts/i18n-push.js   puis redéployer la fonction.');
    process.exit(1);
  }
  console.log('✓ les textes du push correspondent au catalogue');
  process.exit(0);
}

fs.writeFileSync(CIBLE, contenu, 'utf8');
console.log(`✓ ${langues.length} langue(s) × ${NECESSAIRES.length} textes → ${path.relative(path.join(__dirname, '..'), CIBLE)}`);
console.log('  Ne pas le modifier à la main : il est régénéré. Redéployer la fonction ensuite.');
