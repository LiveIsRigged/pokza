export const MIN_PASSWORD_LENGTH = 8;

/** Règle unique partagée entre l'inscription et la réinitialisation (NewPasswordScreen) — pas de
 * jeu de règles dupliqué qui pourrait diverger. `confirmPassword` est optionnel : la réinitialisation
 * n'a qu'un seul champ tant qu'on ne rajoute pas la double saisie là aussi. */
export function passwordError(password: string, confirmPassword?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return 'Les mots de passe ne correspondent pas.';
  }
  return null;
}
