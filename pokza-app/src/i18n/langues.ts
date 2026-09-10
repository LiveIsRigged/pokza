/**
 * Langues servies par Pokza. **Une langue n'entre ici que le jour où son catalogue existe** : la
 * déclarer avant reviendrait à proposer un choix qui affiche de l'anglais partout.
 *
 * Le français est la langue SOURCE (celle dans laquelle les textes sont écrits), l'anglais est la
 * langue de REPLI — celle que voit quiconque parle une langue que nous ne servons pas encore. Les
 * deux rôles sont distincts et c'est voulu : le repli doit rester complet en permanence, la source
 * est la seule qu'on modifie à la main.
 */
export const LANGUES = {
  fr: 'Français',
  en: 'English',
} as const;

export type Langue = keyof typeof LANGUES;

/** La langue dans laquelle les textes sont écrits, et contre laquelle les autres sont datées. */
export const LANGUE_SOURCE: Langue = 'fr';

/** Ce que voit un utilisateur dont la langue n'existe pas encore (décision du 10/09/2026). */
export const LANGUE_REPLI: Langue = 'en';

export function estLangueServie(code: string | null | undefined): code is Langue {
  return typeof code === 'string' && code in LANGUES;
}
