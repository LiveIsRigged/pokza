// Lecture de la réponse du modèle — des blocs balisés, pas du JSON.
// ─────────────────────────────────────────────────────────────────
// POURQUOI PAS LE MODE JSON. Sur Workers AI il n'est garanti que pour une poignée de vieux modèles
// (« Workers AI can't guarantee that the model responds according to the requested JSON Schema »),
// et un texte de joueur est exactement ce qui casse un JSON écrit par un petit modèle : guillemets,
// retours à la ligne, emojis. Un bloc balisé ne demande aucun échappement.
//
// POURQUOI UN NONCE DANS LA BALISE. Le texte traduit est écrit par un joueur. S'il contenait
// `</t>` suivi d'un faux bloc, il pourrait fermer sa traduction et en fabriquer une pour le texte
// d'un autre. La balise porte un jeton tiré au hasard à CHAQUE appel (`<t-9f3a01c2 …>`) : on ne
// peut pas forger ce qu'on ne connaît pas.

export interface BlocLu {
  /** Code de la langue dans laquelle le modèle dit que l'ORIGINAL est écrit ; `zxx` = rien à traduire. */
  source: string;
  texte: string;
}

export interface Lecture {
  blocs: Map<string, BlocLu>;
  /** Ce qui n'empêche pas de lire, mais dit quelque chose de la tenue du modèle (le banc les compte). */
  anomalies: string[];
}

export function lireReponse(brut: string, nonce: string): Lecture {
  const anomalies: string[] = [];
  const blocs = new Map<string, BlocLu>();

  // Certains modèles pensent à voix haute avant de répondre (Qwen3, même quand on le lui déconseille).
  let reste = brut.replace(/<think>[\s\S]*?<\/think>/g, '');
  const motif = new RegExp(`<t-${nonce}\\b([^>]*)>([\\s\\S]*?)</t-${nonce}>`, 'g');

  for (const m of reste.matchAll(motif)) {
    const attributs = m[1];
    const id = /\bid\s*=\s*["']?([A-Za-z0-9_]+)/.exec(attributs)?.[1];
    // Le code doit S'ARRÊTER là : sans cette butée, `source="french"` passait pour « fre ».
    const source = /\bsource\s*=\s*["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)(?=["'\s>]|$)/.exec(attributs)?.[1];
    if (!id || !source) {
      anomalies.push(`bloc illisible : <t-… ${attributs.trim()}>`);
      continue;
    }
    if (blocs.has(id)) {
      // Le premier gagne : un second bloc au même id est au mieux une répétition, au pire une injection.
      anomalies.push(`bloc ${id} en double`);
      continue;
    }
    blocs.set(id, { source: source.toLowerCase(), texte: m[2].trim() });
  }

  reste = reste.replace(motif, '').trim();
  if (reste) anomalies.push(`texte hors des blocs : ${reste.slice(0, 80)}`);
  return { blocs, anomalies };
}
