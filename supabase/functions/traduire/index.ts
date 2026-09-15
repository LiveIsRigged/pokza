// Edge Function `traduire`
// ========================
// Trois portes, trois appelants, une seule chaîne de traduction (`moteur.ts`) :
//
//   • mode « traduire »  — l'app : bouton « Traduire » d'une main ou d'un commentaire. Jeton du
//     lecteur, revérifié ici (comme `giphy`). La main est relue AVEC ce jeton : la RLS décide s'il a
//     le droit de la voir, la fonction ne traduit jamais ce qu'il ne pourrait pas lire.
//   • mode « detecter »  — le trigger pg_net posé par docs/dev/traduction-detection.sql, à chaque
//     publication : fait lire la langue par le modèle et la réécrit. Secret partagé.
//   • mode « rattraper » — `select public.rattraper_langues()` dans l'éditeur SQL, pour les textes
//     publiés avant la détection. Secret partagé.
//
// Secrets (Dashboard → Edge Functions → Secrets, ou `supabase secrets set`) :
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN  — jeton « Workers AI » (Read + Edit), plan Workers FREE
// Le secret des triggers n'est PAS un secret de fonction : la base le tire elle-même au hasard
// (vault `traduire_webhook_secret`) et la fonction le lit par `traduire_secret_webhook()`, réservée à
// la service_role. Personne n'a à le connaître ni à le recopier (cf. traduction-detection.sql).
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
//
// Déploiement (verify_jwt = false dans config.toml : chaque mode s'authentifie lui-même) :
//   supabase functions deploy traduire --project-ref <REF>
//
// ⚠️ ZÉRO CENTIME. Sur Workers Free, le quota épuisé répond 3036 et n'est jamais facturé : la
// fonction le note dans `traduction_budget` et n'appelle plus avant 00:00 UTC. Si le compte passait
// un jour en Workers Paid, cette garantie tomberait (cf. cloudflare.ts).
//
// Limite connue, assumée pour la bêta : rien ne plafonne le nombre de traductions NEUVES qu'un même
// compte peut demander dans la journée. Le pire cas est un quota brûlé jusqu'à minuit UTC — pas une
// facture. Un plafond par personne serait une valeur produit : à trancher avant l'ouverture publique.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isUuid } from '../_shared/reasons.ts';
import type { Identifiants } from './cloudflare.ts';
import { appelerCloudflare, ErreurCloudflare } from './cloudflare.ts';
import type { ElementATraduire } from './consigne.ts';
import { langueDeBase, nomLangue } from './consigne.ts';
import { construireDetection, lireDetection, longueurDetection } from './detection.ts';
import { empreinte } from './empreinte.ts';
import { MODELE_PRODUCTION, trouverModele } from './modeles.ts';
import type { ResultatElement, ResultatLot } from './moteur.ts';
import { traduireLot } from './moteur.ts';
import type { TextesPost } from './textes.ts';
import { assemblerPost, elementsDuPost, lotComplet, toutIdentique } from './textes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const COMPTE = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const JETON = Deno.env.get('CLOUDFLARE_API_TOKEN');

const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const modele = trouverModele(MODELE_PRODUCTION)!;

/** Taille d'un lot de détection pendant le rattrapage : une requête pour vingt textes. */
const LOT_DETECTION = 20;

type Table = 'posts' | 'comments';
type Issue =
  | { statut: 'traduit'; textes: Map<string, string | null> }
  | { statut: 'identique' | 'echec' | 'quota' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

// ── Le secret des triggers ───────────────────────────────────────────────────────────────────
let secretWebhook: string | null = null;

/** Lu une fois par instance chaude : il ne change pas (le script SQL ne le retire jamais). */
async function secretAttendu(): Promise<string | null> {
  if (secretWebhook) return secretWebhook;
  const { data, error } = await admin.rpc('traduire_secret_webhook');
  if (error || typeof data !== 'string' || data.length < 32) return null;
  secretWebhook = data;
  return data;
}

// ── Le budget ──────────────────────────────────────────────────────────────────────────────────
async function quotaEpuise(): Promise<boolean> {
  const jour = new Date().toISOString().slice(0, 10); // UTC, comme le quota de Cloudflare
  const { data } = await admin.from('traduction_budget').select('epuise_le').eq('jour', jour).maybeSingle();
  return Boolean(data?.epuise_le);
}

async function inscrire(neurons: number, epuise = false): Promise<void> {
  await admin.rpc('traduction_budget_ajouter', { p_neurons: neurons, p_epuise: epuise });
}

// ── Traduire, avec le cache ────────────────────────────────────────────────────────────────────
/**
 * Un lot complet ou rien. Une tentative de plus, silencieuse, avant d'abandonner (décision du
 * 15/09) : la plupart des refus des garde-fous sont un tirage malheureux à température 0,2.
 */
async function appelerAvecReprise(
  ids: Identifiants,
  elements: ElementATraduire[],
  cible: string,
  source: string | null,
): Promise<ResultatLot | 'echec' | 'quota'> {
  for (let essai = 1; essai <= 2; essai++) {
    try {
      const lot = await traduireLot(ids, modele, elements, cible, source);
      await inscrire(lot.reponse.neurons);
      if (lotComplet(lot.elements)) return lot;
    } catch (e) {
      if (e instanceof ErreurCloudflare && e.nature === 'quota_epuise') {
        await inscrire(0, true);
        return 'quota';
      }
      console.error('traduire :', e instanceof Error ? e.message : e);
    }
  }
  return 'echec';
}

async function traduireAvecCache(ids: Identifiants, elements: ElementATraduire[], cible: string, source: string | null): Promise<Issue> {
  const empreintes = await Promise.all(elements.map((e) => empreinte(e.texte)));
  const { data: lignes } = await admin
    .from('traductions')
    .select('empreinte, texte, langue_source')
    .eq('langue', cible)
    .in('empreinte', [...new Set(empreintes)]);
  const enCache = new Map((lignes ?? []).map((l) => [l.empreinte as string, l]));

  const resultats = new Map<string, ResultatElement>();
  const manquants: ElementATraduire[] = [];
  elements.forEach((e, i) => {
    const l = enCache.get(empreintes[i]);
    if (!l) return void manquants.push(e);
    resultats.set(e.id, { id: e.id, statut: l.texte == null ? 'identique' : 'traduit', texte: l.texte ?? undefined, source: l.langue_source });
  });

  if (manquants.length > 0) {
    if (await quotaEpuise()) return { statut: 'quota' };
    const lot = await appelerAvecReprise(ids, manquants, cible, source);
    if (lot === 'echec' || lot === 'quota') return { statut: lot };

    // Une ligne par empreinte : deux textes identiques dans la même main (« Oui », « Oui ») ne
    // doivent pas écrire deux fois la même clé dans un seul upsert, que Postgres refuserait.
    const aEcrire = new Map<string, Record<string, unknown>>();
    for (const r of lot.elements) {
      const cle = empreintes[elements.findIndex((e) => e.id === r.id)];
      aEcrire.set(cle, {
        empreinte: cle,
        langue: cible,
        texte: r.statut === 'traduit' ? r.texte : null,
        langue_source: r.source ?? 'und',
        modele: modele.id,
      });
      resultats.set(r.id, r);
    }
    const { error } = await admin.from('traductions').upsert([...aEcrire.values()], { onConflict: 'empreinte,langue' });
    if (error) console.error('cache non écrit :', error.message); // la traduction s'affiche quand même
  }

  const tous = elements.map((e) => resultats.get(e.id)!);
  if (toutIdentique(tous)) return { statut: 'identique' };
  return { statut: 'traduit', textes: new Map(tous.map((r) => [r.id, r.statut === 'traduit' ? r.texte ?? null : null])) };
}

async function modeTraduire(req: Request, corps: Record<string, unknown>, ids: Identifiants): Promise<Response> {
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jeton) return json({ error: 'Authentification requise.' }, 401);
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(jeton);
  if (!user) return json({ error: 'Authentification requise.' }, 401);

  const id = corps.id;
  if (!isUuid(id) || (corps.type !== 'post' && corps.type !== 'comment')) return json({ error: 'Requête invalide.' }, 400);

  // La langue du lecteur est celle de SON profil (synchronisée par l'app à chaque changement), pas
  // un paramètre libre : on ne peut pas faire traduire dans vingt langues pour brûler le quota.
  const { data: profil } = await admin.from('profiles').select('language').eq('id', user.id).maybeSingle();
  const demandee = typeof corps.langue === 'string' ? corps.langue : null;
  const cible = langueDeBase(profil?.language ?? demandee ?? '');
  if (!nomLangue(cible)) return json({ error: 'Langue du lecteur inconnue.' }, 400);

  // Relue avec le jeton du LECTEUR : la RLS de posts/comments tranche la visibilité.
  const lecteur = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false },
  });

  if (corps.type === 'post') {
    const { data: p } = await lecteur.from('posts').select('title, description, vote_question, vote_options, language').eq('id', id).maybeSingle();
    if (!p) return json({ error: 'Main introuvable.' }, 404);
    const textes: TextesPost = {
      titre: p.title,
      description: p.description,
      question: p.vote_question,
      options: Array.isArray(p.vote_options) ? p.vote_options.filter((o: unknown): o is string => typeof o === 'string') : null,
    };
    const issue = await traduireAvecCache(ids, elementsDuPost(textes), cible, p.language);
    if (issue.statut !== 'traduit') return json({ statut: issue.statut });
    return json({ statut: 'traduit', post: assemblerPost(textes, (cle) => issue.textes.get(cle) ?? null) });
  }

  const { data: c } = await lecteur.from('comments').select('body, language').eq('id', id).maybeSingle();
  if (!c?.body?.trim()) return json({ error: 'Commentaire introuvable.' }, 404);
  const issue = await traduireAvecCache(ids, [{ id: 'texte', texte: c.body }], cible, c.language);
  if (issue.statut !== 'traduit') return json({ statut: issue.statut });
  return json({ statut: 'traduit', texte: issue.textes.get('texte') ?? c.body });
}

// ── Détecter la langue ─────────────────────────────────────────────────────────────────────────
const COLONNES: Record<Table, string> = {
  posts: 'id, title, description, vote_question, vote_options',
  comments: 'id, body',
};

/** Le texte qui porte la langue : pour une main, ses phrases mises bout à bout. */
function texteADetecter(table: Table, ligne: Record<string, unknown>): string {
  if (table === 'comments') return String(ligne.body ?? '');
  const options = Array.isArray(ligne.vote_options) ? ligne.vote_options.map(String) : [];
  return [ligne.title, ligne.description, ligne.vote_question, ...options].filter((t) => typeof t === 'string' && t.trim()).join('\n');
}

/** Lit et écrit la langue d'un lot de lignes. Rend le nombre de lignes marquées, ou 'quota'. */
async function detecterLot(ids: Identifiants, table: Table, lignes: Record<string, unknown>[]): Promise<number | 'quota'> {
  const maintenant = new Date().toISOString();
  let marquees = 0;
  const elements: ElementATraduire[] = [];
  for (const [i, ligne] of lignes.entries()) {
    const texte = texteADetecter(table, ligne);
    if (texte.trim()) {
      elements.push({ id: `t${i}`, texte });
    } else {
      // Un commentaire fait d'une seule photo ou d'un GIF : rien à lire, rien à traduire.
      await admin.from(table).update({ language: 'zxx', language_detected_at: maintenant }).eq('id', ligne.id);
      marquees++;
    }
  }
  if (elements.length === 0) return marquees;
  if (await quotaEpuise()) return 'quota';

  const consigne = construireDetection(elements);
  try {
    const reponse = await appelerCloudflare(ids, {
      modele,
      systeme: consigne.systeme,
      utilisateur: consigne.utilisateur,
      longueurMax: longueurDetection(elements),
    });
    await inscrire(reponse.neurons);
    for (const [cle, langue] of lireDetection(reponse.texte, consigne.nonce)) {
      const ligne = lignes[Number(cle.slice(1))];
      const { error } = await admin.from(table).update({ language: langue, language_detected_at: maintenant }).eq('id', ligne.id);
      if (!error) marquees++;
    }
  } catch (e) {
    if (e instanceof ErreurCloudflare && e.nature === 'quota_epuise') {
      await inscrire(0, true);
      return 'quota';
    }
    console.error('detecter :', e instanceof Error ? e.message : e);
  }
  return marquees;
}

async function modeDetecter(corps: Record<string, unknown>, ids: Identifiants): Promise<Response> {
  const table: Table | null = corps.type === 'post' ? 'posts' : corps.type === 'comment' ? 'comments' : null;
  if (!table || !isUuid(corps.id)) return json({ error: 'Requête invalide.' }, 400);
  const { data: ligne } = await admin.from(table).select(COLONNES[table]).eq('id', corps.id).maybeSingle();
  if (!ligne) return json({ ignore: 'introuvable' });
  // Colonnes choisies dynamiquement : le client Supabase ne sait pas typer la ligne, d'où le détour.
  return json({ marquees: await detecterLot(ids, table, [ligne as unknown as Record<string, unknown>]) });
}

async function modeRattraper(corps: Record<string, unknown>, ids: Identifiants): Promise<Response> {
  const limite = Math.max(1, Math.min(200, Number(corps.limite) || 100));
  let traitees = 0;
  for (const table of ['posts', 'comments'] as const) {
    while (traitees < limite) {
      const { data: lignes } = await admin
        .from(table)
        .select(COLONNES[table])
        .is('language_detected_at', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(LOT_DETECTION, limite - traitees));
      if (!lignes || lignes.length === 0) break;
      const marquees = await detecterLot(ids, table, lignes as unknown as Record<string, unknown>[]);
      if (marquees === 'quota') return json({ traitees, arret: 'quota gratuit du jour épuisé' });
      // Aucun progrès : le modèle n'a rien rendu d'exploitable. On s'arrête plutôt que de tourner
      // sur les mêmes lignes jusqu'à la limite de temps.
      if (marquees === 0) break;
      traitees += marquees;
    }
  }
  return json({ traitees });
}

// ── Aiguillage ─────────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  if (!COMPTE || !JETON) {
    return json({ error: 'Traduction non configurée : CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN absent.' }, 503);
  }
  const ids: Identifiants = { compte: COMPTE, jeton: JETON };

  try {
    if (corps.mode === 'traduire') return await modeTraduire(req, corps, ids);

    if (corps.mode === 'detecter' || corps.mode === 'rattraper') {
      const attendu = await secretAttendu();
      if (!attendu || req.headers.get('x-webhook-secret') !== attendu) {
        return new Response('Unauthorized', { status: 401 });
      }
      return corps.mode === 'detecter' ? await modeDetecter(corps, ids) : await modeRattraper(corps, ids);
    }
    return json({ error: 'Mode inconnu.' }, 400);
  } catch (e) {
    console.error('traduire, erreur inattendue :', e instanceof Error ? e.message : e);
    return json({ statut: 'echec' }, 500);
  }
});
