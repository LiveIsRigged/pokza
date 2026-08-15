// F-16 — Proxy de recherche GIF.
//
// PROBLÈME CORRIGÉ : la clé d'API GIPHY était inlinée dans le bundle JS servi à tous les
// visiteurs (`EXPO_PUBLIC_GIPHY_API_KEY`). N'importe qui pouvait la lire et consommer le quota
// du compte Pokza — voire le faire suspendre.
//
// La clé vit désormais UNIQUEMENT ici, dans un secret Supabase, et n'est jamais transmise au
// client. Le client demande « cherche ça », la fonction interroge GIPHY et ne renvoie que le
// strict nécessaire à l'affichage.
//
// ⚠️ `verify_jwt = true` NE SUFFIT PAS pour réserver cette fonction aux comptes connectés : la
// clé publiable est un JWT parfaitement valide, et elle est publique par construction. C'était
// exactement le mécanisme de F-01. On vérifie donc l'utilisateur explicitement ci-dessous.
//
// Déploiement :  supabase functions deploy giphy --project-ref <ref>
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const GIPHY_API_KEY = Deno.env.get('GIPHY_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';
const LIMIT = '24';
// `pg-13` exclut le contenu explicite. Aligné sur ce que faisait le client avant le proxy.
const RATING = 'pg-13';
// Une recherche GIF plus longue que ça n'a pas de sens ; borne la charge utile transmise.
const MAX_QUERY_LENGTH = 100;

interface GiphyImageVariant {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  images: { fixed_width: GiphyImageVariant; original: GiphyImageVariant };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  if (!GIPHY_API_KEY) {
    // Sans clé, on le dit clairement côté serveur plutôt que de renvoyer une liste vide qui
    // ferait croire à une absence de résultats.
    return json({ error: 'Recherche de GIF indisponible : GIPHY_API_KEY absente.' }, 500);
  }

  // ── Le compte doit être réellement connecté ───────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Authentification requise.' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Authentification requise.' }, 401);

  // ── Ce que le client a le droit de demander ───────────────────────────────────────────
  let body: { path?: unknown; q?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  // Liste blanche stricte : le client ne choisit pas librement le chemin appelé chez GIPHY.
  const path = body.path === 'search' ? 'search' : 'trending';
  const q = typeof body.q === 'string' ? body.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (path === 'search' && q.length === 0) {
    return json({ error: 'Recherche vide.' }, 400);
  }

  const params = new URLSearchParams({ api_key: GIPHY_API_KEY, limit: LIMIT, rating: RATING });
  if (path === 'search') params.set('q', q);

  let upstream: Response;
  try {
    upstream = await fetch(`${GIPHY_BASE_URL}/${path}?${params.toString()}`);
  } catch {
    return json({ error: 'La recherche de GIF a échoué.' }, 502);
  }
  if (!upstream.ok) return json({ error: 'La recherche de GIF a échoué.' }, 502);

  const payload = await upstream.json();
  // On ne relaie PAS la réponse brute de GIPHY : uniquement les cinq champs que l'app affiche.
  // Moins de données transférées, et aucune surprise si GIPHY enrichit sa réponse un jour.
  const gifs = (payload.data as GiphyGif[] ?? []).map((gif) => ({
    id: gif.id,
    previewUrl: gif.images.fixed_width.url,
    url: gif.images.original.url,
    width: Number(gif.images.original.width),
    height: Number(gif.images.original.height),
  }));

  return json({ gifs });
});
