import { t } from '../i18n/traduire';

export const MIN_PASSWORD_LENGTH = 8;

/** Règle unique partagée entre l'inscription et la réinitialisation (NewPasswordScreen) — pas de
 * jeu de règles dupliqué qui pourrait diverger. `confirmPassword` est optionnel : la réinitialisation
 * n'a qu'un seul champ tant qu'on ne rajoute pas la double saisie là aussi. */
export function passwordError(password: string, confirmPassword?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return t('motdepasse.trop_court', { n: MIN_PASSWORD_LENGTH });
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return t('motdepasse.differents');
  }
  return null;
}
