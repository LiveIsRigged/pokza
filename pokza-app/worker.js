/**
 * CE QU'UN LIEN POKZA RACONTE QUAND IL EST COLLÉ AILLEURS
 * (chantier social, lot 6 · 23/09/2026)
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
 *   `anon-liste-blanche.sql`. Ce Worker ne demande aucun droit nouveau, et aucun SQL n'a été écrit
 *   pour lui.
 * · **Aucun nom d'auteur sur une main.** Ni `fetchPublicPost` ni `post_by_share_token` ne le rendent,
 *   et la page elle-même ne l'affiche pas. Comme `posts` est lisible sans compte, un nom d'auteur
 *   dans l'aperçu se récolterait en deux requêtes : lister les mains, puis lire chaque `og:`. Ce
 *   serait F-08 rouvert par la fenêtre. Une main dit donc « Une main partagée sur Pokza », point.
 *
 * ⚠️ L'APERÇU EST EN FRANÇAIS, toujours. Un robot d'aperçu n'a ni compte ni langue fiable (son
 * `Accept-Language` est absent ou vaut `*`), et les catalogues i18n vivent dans le bundle de l'app,
 * pas ici. Traduire voudrait dire recopier ces phrases hors de portée de `scripts/i18n-audit.js`,
 * qui ne les verrait plus dériver. À revoir le jour où quelqu'un partage un lien hors de France.
 */

// Les noms sont ceux du `.env` de l'app, à la lettre : une seule source pour l'adresse et la clé,
// et `wrangler dev` lit ce même fichier sans qu'on ait rien à y ajouter. La clé anon n'est pas un
// secret (elle est dans le bundle, donc lisible par qui ouvre Pokza) mais elle n'est pas non plus
// dans le dépôt : `npm run deploy:web` la passe en `--var` depuis le `.env` local.
const VARS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

const PHRASE = 'Le réseau des joueurs de poker : partage tes mains, rejoue-les et demande l\'avis de la communauté.';
const MAIN = 'Une main partagée sur Pokza. Rejoue-la coup par coup.';

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
 * Le titre et la description d'un chemin, ou `null` s'il n'y a rien à en dire.
 * Les quatre cas correspondent aux quatre portes qu'un visiteur SANS COMPTE peut pousser.
 */
async function apercu(url, env) {
  const [porte, cle] = url.pathname.split('/').filter(Boolean);
  const base = env[VARS[0]];
  const anon = env[VARS[1]];
  if (!base || !anon || !cle) return null;

  if (porte === 'g') {
    // Le lien d'un groupe. Le titre reprend MOT POUR MOT la phrase de la page d'atterrissage
    // (`groupes.accueil_titre`) : ce qu'on lit dans WhatsApp et ce qu'on lit après le clic doivent
    // être la même phrase, sinon le clic ressemble à une erreur.
    const g = await interroger(base, anon, '/rest/v1/rpc/group_link_preview', { p_token: cle });
    if (!g || !g.group_name) return null;
    return {
      titre: `${g.host_name} t'invite dans ${g.group_name}`,
      description: `${g.member_count} membre${g.member_count > 1 ? 's' : ''}. ${PHRASE}`,
    };
  }

  if (porte === 'invite') {
    const p = await interroger(base, anon, '/rest/v1/rpc/profile_invite_preview', { p_user: cle });
    if (!p || !p.host_name) return null;
    // À zéro main, on ne dit pas « 0 main partagée » : ce serait un argument contre soi. Même règle
    // que l'écran (`InvitationProfilScreen`), qui masque la ligne dans ce cas.
    const mains = p.hand_count > 0 ? `${p.hand_count} main${p.hand_count > 1 ? 's' : ''} partagée${p.hand_count > 1 ? 's' : ''}. ` : '';
    return { titre: `${p.host_name} t'invite sur Pokza`, description: mains + PHRASE };
  }

  if (porte === 's') {
    // Une main rendue partageable par son auteur sans être publique. Victor a tranché le 23/09 :
    // aperçu COMPLET, comme une main publique — celui qui colle le lien a déjà choisi de montrer la
    // main aux gens de la conversation. Le `X-Robots-Tag: noindex` de `public/_headers` reste, lui :
    // « les gens à qui on a donné le lien » et « les résultats de recherche » ne sont pas le même
    // public, et c'est cette ligne-là qu'on ne franchit pas.
    const m = await interroger(base, anon, '/rest/v1/rpc/post_by_share_token', { p_token: cle });
    return m && m.title ? { titre: m.title, description: MAIN } : null;
  }

  if (porte === 'post') {
    // La seule lecture directe d'une table de tout ce fichier — et la seule que `anon` ait encore.
    // Le filtre `visibility=eq.public` recopie `fetchPublicPost` : une main de groupe ouverte par son
    // identifiant ne doit pas plus avoir d'aperçu qu'elle n'a de page.
    const q = `/rest/v1/posts?id=eq.${encodeURIComponent(cle)}&visibility=eq.public&select=title&limit=1`;
    const m = await interroger(base, anon, q);
    return m && m.title ? { titre: m.title, description: MAIN } : null;
  }

  return null;
}

function balises(a, url) {
  const titre = echapper(borne(a.titre, 70));
  const description = echapper(borne(a.description, 160));
  const image = `${url.origin}/apercu.png`;
  return `
    <meta property="og:site_name" content="Pokza" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="fr_FR" />
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
    const a = await apercu(url, env).catch(() => null);
    const reponse = await page;

    if (!a || !(reponse.headers.get('content-type') || '').includes('text/html')) return reponse;

    const balisé = new Response(reponse.body, reponse);
    // Le HTML dépend maintenant du chemin ET du contenu de la base. Une minute suffit à absorber la
    // rafale de robots que déclenche un lien collé dans une conversation active, sans qu'un groupe
    // renommé traîne longtemps un vieux nom.
    balisé.headers.set('cache-control', 'public, max-age=60');
    return new HTMLRewriter()
      .on('title', { element: (e) => e.setInnerContent(borne(a.titre, 70)) })
      .on('head', { element: (e) => e.append(balises(a, url), { html: true }) })
      .transform(balisé);
  },
};
