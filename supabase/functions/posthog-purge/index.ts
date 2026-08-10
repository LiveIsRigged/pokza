// §9.5 (volet serveur) — Efface les données PostHog d'un utilisateur au moment où il supprime
// son compte. Appelée par l'app JUSTE AVANT delete_own_account (tant que le JWT est encore valide).
// Le distinct_id PostHog = l'id Supabase de l'utilisateur (cf. identifyUser dans src/analytics).
//
// Déployer AVEC vérification de JWT (défaut) — seul l'utilisateur connecté peut purger SES données :
//   supabase functions deploy posthog-purge
// Secret requis : POSTHOG_PERSONAL_API_KEY (secret !). Optionnels : POSTHOG_PROJECT_ID, POSTHOG_HOST.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PH_KEY = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
const PH_PROJECT = Deno.env.get('POSTHOG_PROJECT_ID') ?? '245076';
const PH_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://eu.posthog.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Identifie l'appelant à partir de son JWT (le distinct_id à purger = son propre id).
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return new Response('Unauthorized', { status: 401 });
  const distinctId = userData.user.id;

  // Sans clé PostHog configurée : no-op « réussi » (l'analytics peut être dormant en dev).
  if (!PH_KEY) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_posthog_key' }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const H = { Authorization: `Bearer ${PH_KEY}`, 'content-type': 'application/json' };
  const base = `${PH_HOST}/api/projects/${PH_PROJECT}/persons`;

  try {
    // 1) Retrouver la personne à partir du distinct_id.
    const lookup = await fetch(`${base}/?distinct_id=${encodeURIComponent(distinctId)}`, { headers: H });
    if (!lookup.ok) {
      console.error('PostHog lookup a échoué', lookup.status, await lookup.text());
      return new Response('PostHog lookup échoué', { status: 502 });
    }
    const found = await lookup.json();
    const person = found?.results?.[0];
    if (!person?.id) {
      // Aucune donnée pour ce compte (ex. jamais connecté après l'activation) : rien à purger.
      return new Response(JSON.stringify({ ok: true, purged: false }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    // 2) Supprimer la personne ET ses événements (droit à l'effacement).
    const del = await fetch(`${base}/${person.id}/?delete_events=true`, { method: 'DELETE', headers: H });
    if (!del.ok && del.status !== 404) {
      console.error('PostHog delete a échoué', del.status, await del.text());
      return new Response('PostHog delete échoué', { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, purged: true }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('posthog-purge exception', e);
    return new Response('Erreur', { status: 500 });
  }
});
