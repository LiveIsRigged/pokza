const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/**
 * Date façon réseau social : "à l'instant" / "il y a 10 mn" / "il y a 2h" / "Hier" / "Lundi" (si la
 * semaine passée) / date complète au-delà. Les deux premiers paliers sont en durée écoulée ; au-delà
 * de 24h on bascule sur des jours calendaires (minuit à minuit) pour que "Hier" corresponde
 * vraiment à la veille, pas à "il y a pile 24 à 48h".
 */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} mn`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfPost = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfPost.getTime()) / 86400000);

  if (diffDays === 1) return 'Hier';
  if (diffDays >= 2 && diffDays <= 6) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
