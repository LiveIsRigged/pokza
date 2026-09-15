// Ce qui se traduit dans une main et dans un commentaire, et comment la réponse revient à l'écran.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Décision du 15/09 : UN bouton par main traduit d'un coup le titre, la description et le sondage
// (question ET options) ; un bouton par commentaire traduit son texte. Le lieu, le nom du tournoi et
// la main elle-même ne se traduisent pas : ce sont des noms propres et des données.
//
// ⚠️ LES OPTIONS DE SONDAGE REVIENNENT DANS L'ORDRE, jamais comme un dictionnaire texte → texte.
// L'app affiche la traduction mais ENREGISTRE le vote avec l'option d'origine : la base refuse tout
// vote dont le texte n'est pas une option de la main (F-10). Deux options identiques (« Oui », « Oui »)
// ou une option qui se traduit comme sa voisine ne doivent pas pouvoir se mélanger.

import type { ElementATraduire } from './consigne.ts';
import type { ResultatElement } from './moteur.ts';

export interface TextesPost {
  titre: string;
  description?: string | null;
  question?: string | null;
  options?: string[] | null;
}

/** Les textes d'une main, dans l'ordre où la carte les montre. Les champs vides ne partent pas. */
export function elementsDuPost(p: TextesPost): ElementATraduire[] {
  const elements: ElementATraduire[] = [{ id: 'titre', texte: p.titre }];
  if (p.description?.trim()) elements.push({ id: 'description', texte: p.description });
  if (p.question?.trim()) elements.push({ id: 'question', texte: p.question });
  (p.options ?? []).forEach((option, i) => elements.push({ id: `option${i + 1}`, texte: option }));
  return elements;
}

/**
 * Tout ou rien (décision du 15/09) : une main à moitié traduite ne s'affiche jamais. Un seul texte
 * refusé par les garde-fous ou sauté par le modèle fait échouer le lot.
 */
export function lotComplet(resultats: ResultatElement[]): boolean {
  return resultats.every((r) => r.statut === 'traduit' || r.statut === 'identique');
}

/** Rien n'a changé : tout était déjà dans la langue du lecteur, ou sans rien à traduire. */
export function toutIdentique(resultats: ResultatElement[]): boolean {
  return resultats.length > 0 && resultats.every((r) => r.statut === 'identique');
}

export interface TraductionPost {
  titre: string;
  description: string | null;
  question: string | null;
  options: string[];
}

/**
 * Le post tel qu'il s'affichera traduit : chaque texte traduit, ou l'original quand il était déjà
 * lisible (« Fold » reste « Fold »). `texteDe` rend la traduction retenue pour un id, ou null.
 */
export function assemblerPost(p: TextesPost, texteDe: (id: string) => string | null): TraductionPost {
  return {
    titre: texteDe('titre') ?? p.titre,
    description: p.description?.trim() ? texteDe('description') ?? p.description : null,
    question: p.question?.trim() ? texteDe('question') ?? p.question : null,
    options: (p.options ?? []).map((option, i) => texteDe(`option${i + 1}`) ?? option),
  };
}
