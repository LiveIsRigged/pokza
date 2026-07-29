import { Platform } from 'react-native';

/** Une intention de navigation extraite d'un lien ouvert de l'extérieur (partage, QR, invitation). */
export type DeepLinkRoute =
  | { type: 'invite'; userId: string }
  | { type: 'post'; postId: string };

/**
 * Origine web réelle sur laquelle bâtir les liens partagés : en dev c'est `http://localhost:8081`,
 * en prod le domaine déployé — on la lit à l'exécution plutôt que de coder un domaine en dur, pour
 * que les liens fonctionnent partout où l'app tourne. Sur mobile natif il n'y a pas d'URL de
 * navigateur : on retombe sur le domaine cible (les liens créés depuis un téléphone pointent vers
 * le futur site public).
 */
export function webOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://pokza.app';
}

/**
 * Traduit le chemin de l'URL courante (web uniquement) en intention de navigation. Formats gérés :
 * `/invite/:userId` (ouvrir le profil de la personne pour l'ajouter) et `/post/:postId` (ouvrir la
 * main partagée). Renvoie `null` sur tout autre chemin, ou sur mobile natif.
 */
export function readInitialDeepLink(): DeepLinkRoute | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location?.pathname ?? '';
  const inviteMatch = path.match(/^\/invite\/([^/]+)\/?$/);
  if (inviteMatch) return { type: 'invite', userId: decodeURIComponent(inviteMatch[1]) };
  const postMatch = path.match(/^\/post\/([^/]+)\/?$/);
  if (postMatch) return { type: 'post', postId: decodeURIComponent(postMatch[1]) };
  return null;
}

/**
 * Remet l'URL à la racine sans recharger la page, une fois le lien consommé — sinon un
 * rafraîchissement rejouerait la navigation, et le bouton retour du navigateur renverrait sur le
 * lien d'invitation plutôt que sur l'écran précédent de l'app.
 */
export function clearDeepLinkFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.history.replaceState(null, '', '/');
  } catch {
    // `history` indisponible hors contexte navigateur — sans conséquence.
  }
}
