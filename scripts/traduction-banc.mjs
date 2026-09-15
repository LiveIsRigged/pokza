// Banc de traduction — la fidélité et le coût des modèles GRATUITS de Workers AI, mesurés sur du poker.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// On ne choisit pas un modèle sur son étiquette. Ce banc fait passer le corpus piégé
// (`traduction-corpus.json`) dans la chaîne EXACTE de la production (`moteur.ts`) et relève, par
// modèle : les pièges déjoués, les rejets des garde-fous, les blocs perdus, et les neurons RÉELS
// rendus par Cloudflare — y compris la réflexion qu'un modèle « raisonneur » facture en sortie.
//
//   node scripts/traduction-banc.mjs --a-blanc --tour tri       consignes et coût ESTIMÉ, zéro appel
//   node scripts/traduction-banc.mjs --sonde                    1 appel minuscule par modèle
//   node scripts/traduction-banc.mjs --tour tri                 les unités `tri`, tous les modèles, en allemand
//   node scripts/traduction-banc.mjs --modeles gemma-4,mistral-small     le corpus complet, toutes cibles
//   options : --unites t01,t10   --cibles en,de   --budget 8000
//
// ⚠️ LE BUDGET EST CELUI DU JOUR UTC, TOUS PASSAGES CONFONDUS. Chaque neuron dépensé est inscrit
// dans `scripts/traduction/journal.json` ; un passage refuse de démarrer un appel qui ferait
// dépasser `--budget` (8 000 par défaut, sous les 10 000 gratuits). Sur le plan Workers Free le
// dépassement est de toute façon refusé par Cloudflare ; ce plafond existe pour le cas où le compte
// serait passé au plan payant sans qu'on le sache — là, un dépassement se facturerait.
//
// Identifiants : CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN dans l'environnement, ou dans
// `~/.pokza-cloudflare` (HORS du dépôt, exprès : le dépôt est public). Le jeton n'est jamais affiché.
// Résultats : `scripts/traduction/banc-<horodatage>.json` (ignoré par git).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELES, trouverModele } from '../supabase/functions/traduire/modeles.ts';
import { construireConsigne } from '../supabase/functions/traduire/consigne.ts';
import { traduireLot } from '../supabase/functions/traduire/moteur.ts';
import { ErreurCloudflare } from '../supabase/functions/traduire/cloudflare.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIES = path.join(ICI, 'traduction');
const JOURNAL = path.join(SORTIES, 'journal.json');
const CORPUS = JSON.parse(fs.readFileSync(path.join(ICI, 'traduction-corpus.json'), 'utf8'));

const option = (nom) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : null;
};
const drapeau = (nom) => process.argv.includes(`--${nom}`);
const sortir = (message) => {
  console.error(message);
  process.exit(1);
};

function lireIdentifiants() {
  const valeurs = { CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN };
  const fichier = path.join(os.homedir(), '.pokza-cloudflare');
  if (fs.existsSync(fichier)) {
    for (const ligne of fs.readFileSync(fichier, 'utf8').split('\n')) {
      const m = /^\s*(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN)\s*=\s*["']?([^"'\s]+)["']?\s*$/.exec(ligne);
      if (m && !valeurs[m[1]]) valeurs[m[1]] = m[2];
    }
  }
  const { CLOUDFLARE_ACCOUNT_ID: compte, CLOUDFLARE_API_TOKEN: jeton } = valeurs;
  return compte && jeton ? { compte, jeton } : null;
}

/** Grossier et PESSIMISTE (3,2 caractères par token) : il ne sert qu'à refuser un appel de trop. */
function estimer(modele, consigne) {
  const entree = (consigne.systeme.length + consigne.utilisateur.length) / 3.2;
  const sortie = (consigne.utilisateur.length / 3.2) * 1.3 + (modele.raisonne ? 400 : 0);
  return (entree * modele.prix.entree + sortie * modele.prix.sortie) / 1_000_000;
}

// ── Le plan ────────────────────────────────────────────────────────────────────────────────────
const tour = option('tour');
if (!tour && !option('modeles') && !drapeau('sonde')) sortir('Choisis --tour tri, --sonde, ou --modeles <liste>.');
const modeles = (option('modeles')?.split(',') ?? MODELES.map((m) => m.court)).map(
  (court) => trouverModele(court) ?? sortir(`Modèle inconnu : ${court} (connus : ${MODELES.map((m) => m.court).join(', ')})`),
);
let unites = CORPUS.unites;
if (tour === 'tri') unites = unites.filter((u) => u.tri);
const seules = option('unites')?.split(',');
if (seules) unites = unites.filter((u) => seules.includes(u.id));
const cibles = option('cibles')?.split(',') ?? (tour === 'tri' ? ['de'] : null);
const plan = unites.flatMap((u) => u.cibles.filter((c) => !cibles || cibles.includes(c)).map((cible) => ({ unite: u, cible })));

fs.mkdirSync(SORTIES, { recursive: true });
const jour = new Date().toISOString().slice(0, 10);
const journal = fs.existsSync(JOURNAL) ? JSON.parse(fs.readFileSync(JOURNAL, 'utf8')) : {};
const budget = Number(option('budget') ?? 8000);
let depense = journal[jour] ?? 0;
const inscrire = (neurons) => {
  depense += neurons;
  journal[jour] = Math.round(depense * 1000) / 1000;
  fs.writeFileSync(JOURNAL, JSON.stringify(journal, null, 2));
};

// ── À blanc : ce que coûterait le plan, sans un seul appel ─────────────────────────────────────
if (drapeau('a-blanc')) {
  console.log(`${plan.length} appels par modèle (${unites.length} unités). Estimation pessimiste :\n`);
  for (const m of modeles) {
    const total = plan.reduce((n, { unite, cible }) => n + estimer(m, construireConsigne(unite.elements, cible, unite.source_probable)), 0);
    console.log(`  ${m.court.padEnd(14)} ~${Math.round(total)} neurons`);
  }
  const exemple = construireConsigne(plan[0].unite.elements, plan[0].cible, plan[0].unite.source_probable);
  console.log(`\nConsigne de ${plan[0].unite.id} → ${plan[0].cible} (${exemple.systeme.length} caractères) :\n\n${exemple.systeme}\n\n${exemple.utilisateur}`);
  console.log(`\nDéjà dépensé aujourd'hui (UTC ${jour}) : ${Math.round(depense)} / budget ${budget}.`);
  process.exit(0);
}

const ids = lireIdentifiants();
if (!ids) sortir('Identifiants absents : CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN (environnement ou ~/.pokza-cloudflare).');

async function appeler(modele, elements, cible, source) {
  const estimation = estimer(modele, construireConsigne(elements, cible, source)) * 2;
  if (depense + estimation > budget) return { refus: `budget : ${Math.round(depense)} dépensés + ~${Math.round(estimation)} > ${budget}` };
  for (let essai = 1; ; essai++) {
    try {
      const lot = await traduireLot(ids, modele, elements, cible, source);
      inscrire(lot.reponse.neurons);
      return { lot };
    } catch (e) {
      const nature = e instanceof ErreurCloudflare ? e.nature : 'inattendue';
      if (essai === 1 && ['capacite', 'trop_de_requetes', 'reseau'].includes(nature)) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      return { erreur: { nature, message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

// ── Sonde : chaque modèle accepte-t-il nos paramètres, et que facture-t-il pour « gg » ? ───────
if (drapeau('sonde')) {
  for (const m of modeles) {
    const { lot, erreur, refus } = await appeler(m, [{ id: 'c1', texte: 'gg, bien joué' }], 'en', 'fr');
    if (refus || erreur) {
      console.log(`✗ ${m.court.padEnd(14)} ${refus ?? `${erreur.nature} — ${erreur.message}`}`);
      continue;
    }
    const e = lot.elements[0];
    console.log(`✓ ${m.court.padEnd(14)} ${e.statut.padEnd(9)} « ${e.texte ?? ''} »  entrée ${lot.reponse.usage.entree} / sortie ${lot.reponse.usage.sortie} tokens${lot.reponse.usageExact ? '' : ' (estimés)'} = ${lot.reponse.neurons.toFixed(2)} neurons, ${lot.reponse.dureeMs} ms${lot.anomalies.length ? `  ⚠ ${lot.anomalies.join(' ; ')}` : ''}`);
  }
  console.log(`\nDépensé aujourd'hui (UTC ${jour}) : ${depense.toFixed(1)} neurons.`);
  process.exit(0);
}

// ── Les pièges ─────────────────────────────────────────────────────────────────────────────────
function juger(unite, cible, lot) {
  const constats = [];
  const texte = (id) => lot.elements.find((e) => e.id === id)?.texte ?? null;
  for (const p of unite.pieges ?? []) {
    if (p.cible && p.cible !== cible) continue;
    const t = texte(p.element);
    const echecs = [];
    if (t === null) echecs.push('bloc absent');
    else {
      const bas = t.toLowerCase();
      for (const mot of p.interdit ?? []) if (bas.includes(mot.toLowerCase())) echecs.push(`contient « ${mot} »`);
      for (const mot of p.interdit_casse ?? []) if (t.includes(mot)) echecs.push(`contient « ${mot} » (casse)`);
      if (p.un_de && !p.un_de.some((mot) => bas.includes(mot.toLowerCase()))) echecs.push(`aucun de : ${p.un_de.join(' / ')}`);
    }
    constats.push({ element: p.element, ok: echecs.length === 0, echecs });
  }
  for (const [cle, attendu] of Object.entries(unite.statuts ?? {})) {
    const [id, pour] = cle.split('@');
    if (pour && pour !== cible) continue;
    const obtenu = lot.elements.find((e) => e.id === id)?.statut;
    constats.push({ element: id, ok: obtenu === attendu, echecs: obtenu === attendu ? [] : [`statut ${obtenu}, attendu ${attendu}`] });
  }
  for (const e of unite.elements) {
    const t = texte(e.id);
    const lignes = (s) => (s.match(/\n/g) ?? []).length;
    if (t !== null && lignes(e.texte) > 0 && lignes(t) !== lignes(e.texte)) {
      constats.push({ element: e.id, ok: false, echecs: [`${lignes(t)} retours à la ligne au lieu de ${lignes(e.texte)}`] });
    }
  }
  return constats;
}

// ── Le passage ─────────────────────────────────────────────────────────────────────────────────
const resultats = [];
const exclus = new Map();
let arret = null;
console.log(`${plan.length} appels × ${modeles.length} modèles — budget du jour ${budget}, déjà dépensé ${Math.round(depense)}.\n`);

for (const { unite, cible } of plan) {
  if (arret) break;
  for (const m of modeles) {
    if (exclus.has(m.court)) continue;
    const { lot, erreur, refus } = await appeler(m, unite.elements, cible, unite.source_probable);
    if (refus) {
      arret = refus;
      break;
    }
    if (erreur) {
      console.log(`✗ ${unite.id}→${cible} ${m.court} : ${erreur.nature} — ${erreur.message}`);
      if (erreur.nature === 'quota_epuise') {
        arret = 'quota gratuit du jour épuisé (3036)';
        break;
      }
      if (['plan_payant_requis', 'requete_refusee', 'reponse_illisible'].includes(erreur.nature)) exclus.set(m.court, erreur.message);
      resultats.push({ unite: unite.id, cible, modele: m.court, erreur });
      continue;
    }
    const constats = juger(unite, cible, lot);
    const rates = constats.filter((c) => !c.ok);
    resultats.push({
      unite: unite.id,
      cible,
      modele: m.court,
      elements: lot.elements,
      constats,
      anomalies: lot.anomalies,
      retenus: lot.consigne.retenus,
      usage: lot.reponse.usage,
      usageExact: lot.reponse.usageExact,
      neurons: lot.reponse.neurons,
      dureeMs: lot.reponse.dureeMs,
      brut: lot.reponse.texte,
    });
    const statuts = lot.elements.map((e) => e.statut[0]).join('');
    console.log(`${rates.length ? '·' : '✓'} ${unite.id}→${cible} ${m.court.padEnd(14)} [${statuts}] ${lot.reponse.neurons.toFixed(1)} n${rates.length ? `  ${rates.map((c) => `${c.element}: ${c.echecs.join(', ')}`).join(' | ')}` : ''}`);
  }
}

const fichier = path.join(SORTIES, `banc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(fichier, JSON.stringify({ jour, tour, modeles: modeles.map((m) => m.court), resultats }, null, 2));

console.log('\n── Par modèle ──');
for (const m of modeles) {
  const r = resultats.filter((x) => x.modele === m.court && !x.erreur);
  if (exclus.has(m.court)) console.log(`${m.court.padEnd(14)} EXCLU : ${exclus.get(m.court)}`);
  if (r.length === 0) continue;
  const constats = r.flatMap((x) => x.constats);
  const elements = r.flatMap((x) => x.elements);
  const neurons = r.reduce((n, x) => n + x.neurons, 0);
  const compte = (statut) => elements.filter((e) => e.statut === statut).length;
  console.log(
    `${m.court.padEnd(14)} pièges ${constats.filter((c) => c.ok).length}/${constats.length}` +
      ` · rejetés ${compte('rejete')} · absents ${compte('absent')} · identiques ${compte('identique')}` +
      ` · anomalies ${r.reduce((n, x) => n + x.anomalies.length, 0)}` +
      ` · ${(neurons / r.length).toFixed(1)} n/appel · sortie ${Math.round(r.reduce((n, x) => n + x.usage.sortie, 0) / r.length)} tokens/appel` +
      ` · ${Math.round(r.reduce((n, x) => n + x.dureeMs, 0) / r.length)} ms`,
  );
}
if (arret) console.log(`\nARRÊTÉ : ${arret}`);
console.log(`\nDépensé aujourd'hui (UTC ${jour}) : ${depense.toFixed(1)} neurons. Détail : ${path.relative(process.cwd(), fichier)}`);
