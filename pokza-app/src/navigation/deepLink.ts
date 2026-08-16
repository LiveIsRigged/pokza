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
/**
 * Un lien ouvert de l'extérieur est la SEULE donnée de l'app qui vienne d'un inconnu : n'importe
 * qui peut en fabriquer un et l'envoyer à quelqu'un. L'identifiant qu'il porte est donc vérifié
 * ici, à la frontière, plutôt que dans chacun des écrans qui s'en servent ensuite.
 *
 * ⚠️ Ce n'est pas une simple politesse d'affichage. Cet identifiant finit interpolé dans des
 * filtres PostgREST construits par concaténation de chaînes (`fetchFriendStatus`,
 * `deleteFriendRelation` : `.or('and(sender_id.eq.<id>,…)')`). Une valeur contenant une parenthèse
 * ou une virgule n'y est pas une valeur : c'est de la SYNTAXE de filtre. La RLS reste le vrai
 * rempart — elle ne laisse toucher que ses propres lignes — mais un filtre élargi pourrait porter
 * une action volontaire sur plus de lignes que celle visée. Refuser tout ce qui n'est pas un UUID
 * ferme la question à la source, pour tous les usages présents et futurs de cette valeur.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readInitialDeepLink(): DeepLinkRoute | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location?.pathname ?? '';
  const inviteMatch = path.match(/^\/invite\/([^/]+)\/?$/);
  if (inviteMatch) {
    const userId = decodeURIComponent(inviteMatch[1]);
    return UUID.test(userId) ? { type: 'invite', userId } : null;
  }
  const postMatch = path.match(/^\/post\/([^/]+)\/?$/);
  if (postMatch) {
    const postId = decodeURIComponent(postMatch[1]);
    return UUID.test(postId) ? { type: 'post', postId } : null;
  }
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
