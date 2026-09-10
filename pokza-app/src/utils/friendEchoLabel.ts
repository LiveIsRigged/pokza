import type { FriendEcho } from '../types/poker';
import { t } from '../i18n/traduire';

/**
 * La phrase affichée au-dessus d'une main du feed.
 *
 * Un seul pseudo, jamais deux : les pseudos sont libres, deux d'affilée débordent la ligne sur
 * iPhone et la mention passerait sur deux lignes — or le feed est déjà trop chargé verticalement.
 *
 * « un autre ami » et pas « 1 autre ami » : un chiffre isolé se lit comme une erreur d'affichage.
 * La règle survit à la traduction parce qu'elle est portée par la forme SINGULIER de la clé, et non
 * par un `if` dans le code — une langue peut donc l'exprimer à sa façon.
 *
 * Quatre phrases ENTIÈRES plutôt qu'un verbe recollé à un gabarit : « aimé » et « commenté »
 * s'accordent en français, se placent ailleurs dans la phrase en allemand, et le morceau isolé
 * n'aurait aucun sens pour un traducteur qui le verrait seul dans une liste.
 */
export function friendEchoLabel(echo: FriendEcho): string {
  const commentaire = echo.kind === 'comment';
  if (echo.otherCount === 0) {
    return t(commentaire ? 'echo.commente_seul' : 'echo.aime_seul', { nom: echo.name });
  }
  return t(commentaire ? 'echo.commente_groupe' : 'echo.aime_groupe', {
    nom: echo.name,
    count: echo.otherCount,
  });
}
