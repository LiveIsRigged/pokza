import { langueCourante, t } from '../i18n/traduire';

/**
 * Date façon réseau social : "à l'instant" / "il y a 10 mn" / "il y a 2h" / "Hier" / "Lundi" (si la
 * semaine passée) / date complète au-delà. Les deux premiers paliers sont en durée écoulée ; au-delà
 * de 24h on bascule sur des jours calendaires (minuit à minuit) pour que "Hier" corresponde
 * vraiment à la veille, pas à "il y a pile 24 à 48h".
 *
 * Les jours de la semaine et la date longue ne sont PAS dans le catalogue : `Intl` les connaît dans
 * toutes les langues, les traduire à la main serait 7 + 12 entrées à ressaisir par langue, pour un
 * résultat moins bon. Seule retouche : la majuscule initiale, parce que `Intl` rend « lundi » en
 * français alors que l'app affiche « Lundi » depuis toujours — sans elle, traduire ferait
 * régresser le français.
 */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);

  if (diffMin < 1) return t('date.a_l_instant');
  if (diffMin < 60) return t('date.il_y_a_minutes', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('date.il_y_a_heures', { count: diffH });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfPost = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfPost.getTime()) / 86400000);

  if (diffDays === 1) return t('date.hier');
  const langue = langueCourante();
  if (diffDays >= 2 && diffDays <= 6) {
    return majuscule(d.toLocaleDateString(langue, { weekday: 'long' }));
  }
  return d.toLocaleDateString(langue, { day: 'numeric', month: 'long', year: 'numeric' });
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}
