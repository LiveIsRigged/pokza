/**
 * CE QU'UN LIEN POKZA RACONTE QUAND IL EST COLLÉ AILLEURS
 * (chantier social, lot 6 · 23-24/09/2026)
 *
 * MESURÉ AVANT D'ÉCRIRE UNE LIGNE, sur pokza.app en ligne : `/`, `/post/abc`, `/g/xyz` et
 * `/invite/123` rendaient TOUS LES QUATRE le même fichier de 6 214 octets, avec `<title>Pokza</title>`
 * et pas une seule balise `og:`. Un lien d'invitation collé dans un WhatsApp de home game s'affichait
 * donc « pokza.app » et rien d'autre : ni qui invite, ni quel groupe, ni image. Les trois pages
 * d'atterrissage livrées les 19 et 23/09 sont faites pour être partagées — elles arrivaient nues.
 *
 * L'export statique ne peut pas corriger ça : `expo export` produit UN SEUL index.html pour toutes
 * les URL, et un robot d'aperçu n'exécute pas le JavaScript. Il faut donc écrire les balises côté
 * serveur, à la volée. C'est exactement ce que le commentaire en tête de `wrangler.jsonc` annonçait.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI TIENT CE FICHIER DEBOUT
 *
 * · **Il ne s'exécute que sur quatre chemins.** `run_worker_first` (cf. wrangler.jsonc) laisse tout
 *   le reste — le bundle, les polices, les icônes, la page d'accueil — filer droit vers les fichiers
 *   statiques sans jamais réveiller ce code. Un octet de moins facturé, et surtout un octet de moins
 *   à casser.
 * · **Il échoue toujours ouvert.** Base lente, fonction absente, jeton périmé, réponse illisible :
 *   on renvoie la page telle quelle. Un aperçu manquant est un désagrément ; une page blanche sur un
 *   lien d'invitation est une porte fermée. Chaque `catch` de ce fichier est là pour ça.
 * · **Il ne lit rien de plus que l'app.** Les trois `rpc` sont les fonctions `security definer`
 *   déjà appelables sans compte, et `posts` est la SEULE table que `anon` garde depuis
 *   `anon-liste-blanche.sql`. Ce Worker ne demande aucun droit nouveau.
 * · **Aucun nom d'auteur sur une main.** Ni `fetchPublicPost` ni `post_by_share_token` ne le rendent,
 *   et la page elle-même ne l'affiche pas. Comme `posts` est lisible sans compte, un nom d'auteur
 *   dans l'aperçu se récolterait en deux requêtes : lister les mains, puis lire chaque `og:`. Ce
 *   serait F-08 rouvert par la fenêtre. Une main dit donc « Main partagée sur Pokza », point.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA LANGUE (24/09, question de Victor : « aucun moyen d'y remédier ? »)
 *
 * On ne peut PAS connaître la langue de celui qui REÇOIT le lien : c'est un robot sans compte qui
 * vient chercher l'aperçu. On connaît en revanche celle de celui qui l'ENVOIE, et elle est déjà en
 * base — `profiles.language`, réécrite à chaque ouverture de l'app, et `posts.language`, détectée à
 * la publication. C'est le signal que Victor a proposé, et c'est le seul qui existe.
 *
 * Les phrases ne sont PAS recopiées ici : `worker-textes.json` est GÉNÉRÉ depuis les catalogues de
 * l'app par `scripts/i18n-apercu.js`, et `scripts/i18n-audit.js` sort en erreur s'il dérive. Deux
 * des quatre sont d'ailleurs les clés mêmes qu'affichent les pages d'atterrissage : ce qu'on lit
 * dans WhatsApp est ce qu'on lit après le clic, mot pour mot, dans les deux langues à la fois.
 *
 * ⚠️ Ce qu'on ne sait toujours pas faire : un Français qui invite un Allemand lui enverra une carte
 * française. Aucune donnée ne dit le contraire avant le clic — et après le clic, l'app, elle, parle
 * la langue du téléphone.
 */

import TEXTES from './worker-textes.json';

// Les noms sont ceux du `.env` de l'app, à la lettre : une seule source pour l'adresse et la clé,
// et `wrangler dev` lit ce même fichier sans qu'on ait rien à y ajouter. En ligne, elles viennent
// du tableau de bord Cloudflare — cf. l'avertissement en tête de `wrangler.jsonc`, qui dit aussi
// pourquoi des SECRETS et pas des variables.
const VARS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

const DEFAUT = 'fr';
const LOCALES = { fr: 'fr_FR', en: 'en_US', de: 'de_DE', es: 'es_ES' };

/**
 * La langue à employer, à partir de ce que la base a rendu.
 * `posts.language` vaut parfois `zxx` — le code ISO de « pas de texte à analyser », posé par le
 * modèle de traduction sur une main sans description. Il ne correspond à aucun catalogue, donc il
 * retombe ici, comme une colonne nulle ou une langue qu'on ne traduit pas encore.
 */
function langue(valeur) {
  const l = String(valeur || '').slice(0, 2).toLowerCase();
  return TEXTES[l] ? l : DEFAUT;
}

const textes = (l) => TEXTES[l] || TEXTES[DEFAUT];

/** Les catalogues écrivent `{nom}` et `{groupe}` ; ici il n'y a pas de moteur i18n pour les lire. */
function remplir(modele, valeurs) {
  return String(modele).replace(/\{(\w+)\}/g, (entier, nom) =>
    valeurs[nom] === undefined ? entier : valeurs[nom]
  );
}

/** Au-delà, toutes les messageries coupent — autant couper nous-mêmes, sur un mot et non au milieu. */
function borne(texte, max) {
  const t = (texte || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const coupe = t.slice(0, max - 1);
  return coupe.slice(0, coupe.lastIndexOf(' ') > max / 2 ? coupe.lastIndexOf(' ') : coupe.length) + '…';
}

/** Ces valeurs sont écrites par des gens : un titre de main ou un nom de groupe peut contenir
 *  n'importe quoi. Elles partent dans des attributs HTML — elles sont échappées, sans exception. */
function echapper(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Une réponse ou rien. Deux secondes de plafond : au-delà, la page part sans aperçu plutôt que de
 *  faire attendre quelqu'un qui, lui, a vraiment ouvert le lien. */
async function interroger(url, cle, chemin, corps) {
  const reponse = await fetch(url.replace(/\/+$/, '') + chemin, {
    method: corps ? 'POST' : 'GET',
    headers: {
      apikey: cle,
      authorization: `Bearer ${cle}`,
      accept: 'application/json',
      ...(corps ? { 'content-type': 'application/json' } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(2000),
  });
  if (!reponse.ok) return null;
  const données = await reponse.json();
  return Array.isArray(données) ? données[0] || null : données;
}

/**
 * Le titre, la description et la langue d'un chemin — ou une CHAÎNE disant pourquoi il n'y a rien.
 * Les quatre cas correspondent aux quatre portes qu'un visiteur SANS COMPTE peut pousser.
 *
 * Cette raison ressort en en-tête `x-pokza-apercu`, et ce n'est pas du confort : de l'extérieur,
 * « le Worker ne tourne pas » et « le Worker tourne mais ne voit pas ses variables » rendent
 * exactement la même page. Le 23/09 il a fallu un déploiement de plus pour distinguer les deux.
 * En-tête absent = le Worker ne s'exécute pas ; `variables-absentes` = il s'exécute mais les deux
 * valeurs ne lui parviennent pas (des variables de BUILD ne sont pas lisibles à l'exécution).
 */
async function apercu(url, env) {
  const [porte, cle] = url.pathname.split('/').filter(Boolean);
  const base = env[VARS[0]];
  const anon = env[VARS[1]];
  if (!base || !anon) return 'variables-absentes';
  if (!cle) return 'chemin-sans-cle';

  if (porte === 'g') {
    // Le lien d'un groupe. Le titre EST la phrase de la page d'atterrissage — la même clé de
    // catalogue (`accueil_groupe.titre`), pas une copie : ce qu'on lit dans WhatsApp et ce qu'on lit
    // après le clic ne peuvent plus diverger. La langue est celle de l'HÔTE, celui qui a envoyé le
    // lien, pas du fondateur — comme la page, qui dit « Paul t'invite » parce que c'est Paul que
    // Kevin connaît.
    const g = await interroger(base, anon, '/rest/v1/rpc/group_link_preview', { p_token: cle });
    if (!g || !g.group_name) return 'groupe-introuvable';
    const l = langue(g.host_language);
    return {
      langue: l,
      titre: remplir(textes(l).groupe, { nom: g.host_name, groupe: g.group_name }),
      description: textes(l).phrase,
    };
  }

  if (porte === 'invite') {
    const p = await interroger(base, anon, '/rest/v1/rpc/profile_invite_preview', { p_user: cle });
    if (!p || !p.host_name) return 'profil-introuvable';
    const l = langue(p.host_language);
    return {
      langue: l,
      titre: remplir(textes(l).profil, { nom: p.host_name }),
      description: textes(l).phrase,
    };
  }

  if (porte === 's') {
    // Une main rendue partageable par son auteur sans être publique. Victor a tranché le 23/09 :
    // aperçu COMPLET, comme une main publique — celui qui colle le lien a déjà choisi de montrer la
    // main aux gens de la conversation. Le `X-Robots-Tag: noindex` de `public/_headers` reste, lui :
    // « les gens à qui on a donné le lien » et « les résultats de recherche » ne sont pas le même
    // public, et c'est cette ligne-là qu'on ne franchit pas.
    const m = await interroger(base, anon, '/rest/v1/rpc/post_by_share_token', { p_token: cle });
    if (!m || !m.title) return 'partage-introuvable';
    const l = langue(m.language);
    return { langue: l, titre: m.title, description: textes(l).main };
  }

  if (porte === 'post') {
    // La seule lecture directe d'une table de tout ce fichier — et la seule que `anon` ait encore.
    // Le filtre `visibility=eq.public` recopie `fetchPublicPost` : une main de groupe ouverte par son
    // identifiant ne doit pas plus avoir d'aperçu qu'elle n'a de page.
    const q = `/rest/v1/posts?id=eq.${encodeURIComponent(cle)}&visibility=eq.public&select=title,language&limit=1`;
    const m = await interroger(base, anon, q);
    if (!m || !m.title) return 'main-introuvable';
    const l = langue(m.language);
    return { langue: l, titre: m.title, description: textes(l).main };
  }

  return 'chemin-inconnu';
}

function balises(a, url) {
  const titre = echapper(borne(a.titre, 70));
  const description = echapper(borne(a.description, 160));
  // Une vignette par langue : la phrase y est PEINTE, une carte française sous un texte allemand
  // sentirait le bricolage. `apercu.png` reste la française, parce que des aperçus partis le 23/09
  // désignent encore cette URL-là.
  const image = `${url.origin}/apercu-${a.langue}.png`;
  return `
    <meta property="og:site_name" content="Pokza" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${LOCALES[a.langue] || LOCALES[DEFAUT]}" />
    <meta property="og:url" content="${echapper(url.origin + url.pathname)}" />
    <meta property="og:title" content="${titre}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Pokza" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titre}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="description" content="${description}" />`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Les deux partent ENSEMBLE : la page n'attend alors que la plus lente des deux, pas leur somme.
    const page = env.ASSETS.fetch(request);
    const a = await apercu(url, env).catch((e) => `echec: ${e && e.name}`);
    const reponse = await page;

    const balisé = new Response(reponse.body, reponse);
    // Toujours posé, même quand tout va bien : c'est la seule trace qui dise de l'extérieur si ce
    // fichier s'exécute, et pourquoi il n'a rien écrit. Il ne révèle rien qu'un robot ne puisse
    // déjà déduire de la page.
    balisé.headers.set('x-pokza-apercu', typeof a === 'string' ? a : `ok:${a.langue}`);

    if (typeof a === 'string' || !(reponse.headers.get('content-type') || '').includes('text/html')) {
      return balisé;
    }

    // Le HTML dépend maintenant du chemin ET du contenu de la base. Une minute suffit à absorber la
    // rafale de robots que déclenche un lien collé dans une conversation active, sans qu'un groupe
    // renommé traîne longtemps un vieux nom.
    balisé.headers.set('cache-control', 'public, max-age=60');
    return new HTMLRewriter()
      .on('html', { element: (e) => e.setAttribute('lang', a.langue) })
      .on('title', { element: (e) => e.setInnerContent(borne(a.titre, 70)) })
      .on('head', { element: (e) => e.append(balises(a, url), { html: true }) })
      .transform(balisé);
  },
};
