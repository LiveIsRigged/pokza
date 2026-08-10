// §4.10 — Notification e-mail à l'équipe de modération à chaque nouveau signalement.
// Déclenché par un webhook DB (pg_net) sur INSERT dans `reports` — couvre les signalements
// in-app ET publics. Envoie un e-mail via l'API Resend vers abuse@pokza.app.
//
// Déployer SANS vérification de JWT (appelé par le trigger avec un secret dédié) :
//   supabase functions deploy report-notify --no-verify-jwt
// Secrets requis : RESEND_API_KEY, WEBHOOK_SECRET. Optionnels : ABUSE_EMAIL_TO, ABUSE_EMAIL_FROM, ADMIN_URL.
import { corsHeaders } from '../_shared/cors.ts';
import { reasonLabel } from '../_shared/reasons.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const TO = Deno.env.get('ABUSE_EMAIL_TO') ?? 'abuse@pokza.app';
const FROM = Deno.env.get('ABUSE_EMAIL_FROM') ?? 'Pokza modération <no-reply@send.pokza.app>';
const ADMIN_URL = Deno.env.get('ADMIN_URL') ?? 'https://pokza.app';

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Authentifie l'appel : seul le trigger DB (qui connaît le secret) peut déclencher un envoi.
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY manquant');
    return new Response('Email non configuré', { status: 500 });
  }

  let record: Record<string, unknown>;
  try {
    const body = await req.json();
    record = body.record ?? body; // webhook Supabase => { record }, ou payload direct
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const reason = String(record.reason ?? '');
  const priority = record.severity === 'priority';
  const source = String(record.source ?? 'app');
  const who = record.reporter_email
    ? String(record.reporter_email)
    : record.reporter_id
      ? `compte ${String(record.reporter_id)}`
      : 'anonyme';

  const subject = `${priority ? '🔴 PRIORITÉ — ' : ''}Signalement ${esc(reasonLabel(reason))} (${esc(source)})`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">Nouveau signalement Pokza</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Motif</td><td><strong>${esc(reasonLabel(reason))}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Cible</td><td>${esc(String(record.target_type ?? ''))} — <code>${esc(String(record.target_id ?? ''))}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Source</td><td>${esc(source)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Signalé par</td><td>${esc(who)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Priorité</td><td>${priority ? '🔴 oui (compte mineur)' : 'normale'}</td></tr>
        ${record.details ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Précisions</td><td>${esc(String(record.details))}</td></tr>` : ''}
      </table>
      <p style="margin:18px 0 0">
        <a href="${esc(ADMIN_URL)}" style="background:#e0b64a;color:#1a1400;text-decoration:none;
          padding:10px 16px;border-radius:8px;font-weight:700;display:inline-block">Ouvrir la modération</a>
      </p>
      <p style="color:#999;font-size:12px;margin-top:16px">ID signalement : ${esc(String(record.id ?? '—'))}</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('Resend a échoué', res.status, txt);
    return new Response('Envoi e-mail échoué', { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
