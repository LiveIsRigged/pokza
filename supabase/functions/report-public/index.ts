// §5.2 — Signalement PUBLIC, sans compte.
// GET  : sert un formulaire HTML autonome (motif, cible, e-mail facultatif, précisions).
// POST : valide et insère un `reports` avec source='public_form' via le service-role (bypass RLS).
// L'insertion déclenche le webhook DB -> fonction `report-notify` (e-mail à abuse@pokza.app).
//
// Déployer SANS vérification de JWT (public) :  supabase functions deploy report-public --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { REPORT_REASONS, REASON_VALUES, TARGET_TYPES, isUuid } from '../_shared/reasons.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function page(body: string, status = 200): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Signaler un contenu — Pokza</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:#0f1115;color:#e8eaed;display:flex;justify-content:center;padding:24px}
  main{width:100%;max-width:560px}
  h1{font-size:22px;margin:8px 0 4px}
  p.lead{color:#9aa0a6;margin:0 0 20px;font-size:14px;line-height:1.5}
  label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
  input,select,textarea{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #2a2f3a;
    background:#171a21;color:#e8eaed;font-size:15px}
  textarea{min-height:96px;resize:vertical}
  .hp{position:absolute;left:-9999px}
  button{margin-top:22px;width:100%;padding:13px;border:0;border-radius:10px;background:#e0b64a;
    color:#1a1400;font-size:16px;font-weight:700;cursor:pointer}
  .muted{color:#9aa0a6;font-size:12px;margin-top:6px}
  .card{background:#151821;border:1px solid #232836;border-radius:16px;padding:22px}
  a{color:#e0b64a}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, 'content-type': 'text/html; charset=utf-8' },
  });
}

function formPage(prefillType = '', prefillId = '', error = ''): Response {
  const options = REPORT_REASONS.map((r) => `<option value="${r.value}">${esc(r.label)}</option>`).join('');
  const typeOpt = (v: string, label: string) =>
    `<option value="${v}"${prefillType === v ? ' selected' : ''}>${label}</option>`;
  return page(`
    <h1>Signaler un contenu</h1>
    <p class="lead">Ce formulaire permet de signaler un contenu Pokza <strong>sans avoir de compte</strong>.
      Notre équipe examine chaque signalement. Pour une urgence légale, écris à
      <a href="mailto:abuse@pokza.app">abuse@pokza.app</a>.</p>
    ${error ? `<p style="color:#ff6b6b;font-size:14px">${esc(error)}</p>` : ''}
    <form class="card" method="POST" action="">
      <label for="target_type">Type de contenu</label>
      <select id="target_type" name="target_type" required>
        ${typeOpt('post', 'Une main / publication')}
        ${typeOpt('comment', 'Un commentaire')}
        ${typeOpt('user', 'Un compte / profil')}
      </select>

      <label for="target_id">Identifiant du contenu</label>
      <input id="target_id" name="target_id" value="${esc(prefillId)}" placeholder="ex. 3f2a…"
        required autocomplete="off">
      <p class="muted">Visible dans l'adresse du contenu partagé (…/post/&lt;identifiant&gt;).</p>

      <label for="reason">Motif</label>
      <select id="reason" name="reason" required>${options}</select>

      <label for="details">Précisions (facultatif)</label>
      <textarea id="details" name="details" maxlength="2000"
        placeholder="Décris le problème en quelques mots"></textarea>

      <label for="reporter_email">Ton e-mail (facultatif)</label>
      <input id="reporter_email" name="reporter_email" type="email" autocomplete="off"
        placeholder="pour un éventuel suivi">

      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Envoyer le signalement</button>
    </form>
  `);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    return formPage(url.searchParams.get('type') ?? '', url.searchParams.get('id') ?? '');
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // Accepte formulaire (navigateur) ou JSON (appel programmatique).
  let f: Record<string, string> = {};
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      f = await req.json();
    } else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) f[k] = typeof v === 'string' ? v : '';
    }
  } catch {
    return page(`<div class="card"><h1>Erreur</h1><p>Requête invalide.</p></div>`, 400);
  }

  // Honeypot : un bot remplit ce champ caché -> on fait semblant d'accepter, sans rien insérer.
  if ((f.website ?? '').trim() !== '') {
    return page(`<div class="card"><h1>Merci</h1><p>Ton signalement a bien été transmis.</p></div>`);
  }

  const target_type = (f.target_type ?? '').trim();
  const target_id = (f.target_id ?? '').trim();
  const reason = (f.reason ?? '').trim();
  const details = (f.details ?? '').trim().slice(0, 2000) || null;
  const reporter_email = (f.reporter_email ?? '').trim().slice(0, 320) || null;

  if (!TARGET_TYPES.has(target_type)) return formPage(target_type, target_id, 'Type de contenu invalide.');
  if (!isUuid(target_id)) return formPage(target_type, target_id, "Identifiant du contenu invalide.");
  if (!REASON_VALUES.has(reason)) return formPage(target_type, target_id, 'Motif invalide.');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { error } = await admin.from('reports').insert({
    reporter_id: null,
    reporter_email,
    source: 'public_form',
    target_type,
    target_id,
    reason,
    details,
  });

  if (error) {
    console.error('report-public insert failed', error);
    return page(`<div class="card"><h1>Oups</h1><p>Le signalement n'a pas pu être enregistré.
      Réessaie plus tard ou écris à <a href="mailto:abuse@pokza.app">abuse@pokza.app</a>.</p></div>`, 500);
  }

  return page(`<div class="card"><h1>Merci 🙏</h1>
    <p>Ton signalement a bien été transmis à l'équipe de modération. Nous l'examinerons rapidement.</p></div>`);
});
