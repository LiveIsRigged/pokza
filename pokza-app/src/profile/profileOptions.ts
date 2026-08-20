import type { GameType } from '../types/poker';

// Labels partagés entre le formulaire de création de profil et l'affichage d'un profil consulté —
// une seule source pour ces libellés, pour ne jamais les faire diverger.

export const FORMAT_OPTIONS = [
  { value: 'cash_live', label: 'Cash game live' },
  { value: 'cash_online', label: 'Cash game online' },
  { value: 'tournoi_live', label: 'Tournois live' },
  { value: 'tournoi_online', label: 'Tournois online' },
  { value: 'spins', label: 'Spins' },
] as const;

// Variante préférée : sert à faire remonter dans le feed les mains de ce type (cf. vue SQL
// `posts_ranked`). Valeurs alignées sur `Variant` (types/poker.ts) — le défaut est 'nlhe'.
export const VARIANTE_OPTIONS = [
  { value: 'nlhe', label: "Hold'em" },
  { value: 'plo', label: 'PLO' },
  { value: 'plo5', label: 'PLO5' },
] as const;

export const FREQUENCE_OPTIONS = [
  { value: 'tres_occasionnel', label: 'Très occasionnellement (moins de deux fois par mois)' },
  { value: 'occasionnel', label: "Occasionnellement (moins d'une fois par semaine)" },
  { value: 'regulier', label: 'Régulièrement (toutes les semaines)' },
  { value: 'tres_regulier', label: 'Très régulièrement (minimum trois fois par semaine)' },
] as const;

/**
 * Type de partie présélectionné à la création d'une main, d'après le format favori du profil : un
 * spin est un sit & go hyper-turbo (blindes montantes, buy-in), donc du tournoi au même titre que
 * les deux formats « Tournois ». Toute valeur inconnue (profil ancien, champ vide) retombe sur le
 * cash game, valeur par défaut du formulaire.
 */
export function gameTypeForFormat(formatFavori: string | undefined): GameType {
  return formatFavori === 'tournoi_live' || formatFavori === 'tournoi_online' || formatFavori === 'spins'
    ? 'tournament'
    : 'cash';
}

export function formatLabel(value: string): string {
  return FORMAT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Résumé affiché sous le pseudo sur la page de profil, tant qu'aucune description n'a été
 * écrite. Les 4 fréquences se réduisent à 2 catégories : le détail exact ("toutes les semaines"
 * vs "minimum trois fois par semaine") est utile au moment du choix dans le formulaire, mais fait
 * une phrase trop lourde ici — "régulier" / "occasionnel" suffit pour se présenter en un coup d'œil. */
export function playerSummary(formatFavori: string, frequenceJeu: string): string {
  const regulier = frequenceJeu === 'regulier' || frequenceJeu === 'tres_regulier';
  const format = formatLabel(formatFavori);
  const formatLowerFirst = format.charAt(0).toLowerCase() + format.slice(1);
  return `Joueur ${regulier ? 'régulier' : 'occasionnel'} de ${formatLowerFirst}`;
}
