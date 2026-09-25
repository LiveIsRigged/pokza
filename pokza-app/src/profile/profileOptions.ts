import type { GameType } from '../types/poker';
import { langueCourante, t, type Cle } from '../i18n/traduire';

// Libellés partagés entre le formulaire de création de profil et l'affichage d'un profil consulté —
// une seule source pour ces libellés, pour ne jamais les faire diverger.
//
// Des CLÉS et non des textes : ces tables sont calculées UNE FOIS au chargement du module, donc un
// libellé figé y resterait dans la langue du démarrage.

export const FORMAT_OPTIONS = [
  { value: 'cash_live', cle: 'profil.format_cash_live' },
  { value: 'cash_online', cle: 'profil.format_cash_online' },
  { value: 'tournoi_live', cle: 'profil.format_tournoi_live' },
  { value: 'tournoi_online', cle: 'profil.format_tournoi_online' },
  { value: 'spins', cle: 'profil.format_spins' },
] as const satisfies readonly { value: string; cle: Cle }[];

// Variante préférée : sert à faire remonter dans le feed les mains de ce type (cf. vue SQL
// `posts_ranked`). Valeurs alignées sur `Variant` (types/poker.ts) — le défaut est 'nlhe'.
export const VARIANTE_OPTIONS = [
  { value: 'nlhe', cle: 'profil.variante_nlhe' },
  { value: 'plo', cle: 'profil.variante_plo' },
  { value: 'plo5', cle: 'profil.variante_plo5' },
] as const satisfies readonly { value: string; cle: Cle }[];

export const FREQUENCE_OPTIONS = [
  { value: 'tres_occasionnel', cle: 'profil.frequence_tres_occasionnel' },
  { value: 'occasionnel', cle: 'profil.frequence_occasionnel' },
  { value: 'regulier', cle: 'profil.frequence_regulier' },
  { value: 'tres_regulier', cle: 'profil.frequence_tres_regulier' },
] as const satisfies readonly { value: string; cle: Cle }[];

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
  const option = FORMAT_OPTIONS.find((o) => o.value === value);
  return option ? t(option.cle) : value;
}

/** Résumé affiché sous le pseudo sur la page de profil, tant qu'aucune description n'a été
 * écrite. Les 4 fréquences se réduisent à 2 catégories : le détail exact ("toutes les semaines"
 * vs "minimum trois fois par semaine") est utile au moment du choix dans le formulaire, mais fait
 * une phrase trop lourde ici — "régulier" / "occasionnel" suffit pour se présenter en un coup d'œil. */
export function playerSummary(formatFavori: string, frequenceJeu: string): string {
  const regulier = frequenceJeu === 'regulier' || frequenceJeu === 'tres_regulier';
  const format = formatLabel(formatFavori);
  // ⚠️ LA MINUSCULE INITIALE EST UNE CONVENTION, PAS UNE RÈGLE. Le français et l'anglais écrivent
  // « joueur régulier de cash game live » ; l'allemand met une majuscule à ses noms communs, et
  // « live Cash Game » y serait une faute. La typographie appartient à la langue.
  //
  // ÉCRIT EN LISTE D'EXCEPTIONS ET NON D'AUTORISATIONS, et c'est le correctif du 25/09/2026 : la
  // liste disait « une langue de plus se déclare ici », l'italien et le portugais ont été livrés
  // sans y être ajoutés, et affichaient « Giocatore regolare di Cash game live » — une faute de
  // typographie italienne que rien ne signalait, puisque le texte s'affichait normalement.
  //
  // La majuscule aux noms communs est le CAS RARE : l'allemand, le luxembourgeois. La minuscule est
  // la règle partout ailleurs. En nommant l'exception plutôt que la règle, une langue de plus n'a
  // plus rien à déclarer ici — et l'oubli, s'il reste possible, ne concerne que l'allemand.
  const MAJUSCULE_AUX_NOMS_COMMUNS = ['de', 'lb'];
  const formatLowerFirst = MAJUSCULE_AUX_NOMS_COMMUNS.includes(langueCourante())
    ? format
    : format.charAt(0).toLowerCase() + format.slice(1);
  return t(regulier ? 'profil.resume_regulier' : 'profil.resume_occasionnel', { format: formatLowerFirst });
}
