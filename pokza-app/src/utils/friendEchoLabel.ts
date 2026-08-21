import type { FriendEcho } from '../types/poker';

/**
 * La phrase affichée au-dessus d'une main du feed.
 *
 * Un seul pseudo, jamais deux : les pseudos sont libres, deux d'affilée débordent la ligne sur
 * iPhone et la mention passerait sur deux lignes — or le feed est déjà trop chargé verticalement.
 *
 * « un autre ami » et pas « 1 autre ami » : un chiffre isolé se lit comme une erreur d'affichage.
 */
export function friendEchoLabel(echo: FriendEcho): string {
  const verbe = echo.kind === 'comment' ? 'commenté' : 'aimé';
  if (echo.otherCount === 0) return `${echo.name} a ${verbe} cette main`;
  const autres = echo.otherCount === 1 ? 'un autre ami' : `${echo.otherCount} autres amis`;
  return `${echo.name} et ${autres} ont ${verbe} cette main`;
}
