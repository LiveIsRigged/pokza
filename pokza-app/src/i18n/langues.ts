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
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  el: 'Ελληνικά',
  hu: 'Magyar',
  sv: 'Svenska',
  fi: 'Suomi',
  nb: 'Norsk',
  da: 'Dansk',
  ru: 'Русский',
  pl: 'Polski',
  uk: 'Українська',
  bg: 'Български',
  ro: 'Română',
  cs: 'Čeština',
  'zh-Hant': '繁體中文',
  sk: 'Slovenčina',
  ko: '한국어',
  ja: '日本語',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  tr: 'Türkçe',
} as const;

export type Langue = keyof typeof LANGUES;

/** La langue dans laquelle les textes sont écrits, et contre laquelle les autres sont datées. */
export const LANGUE_SOURCE: Langue = 'fr';

/** Ce que voit un utilisateur dont la langue n'existe pas encore (décision du 10/09/2026). */
export const LANGUE_REPLI: Langue = 'en';

export function estLangueServie(code: string | null | undefined): code is Langue {
  return typeof code === 'string' && code in LANGUES;
}

/** LANGUES indexé en minuscules, pour retrouver « zh-Hant » à partir de « zh-hant ». */
const PAR_CODE_MINUSCULE = new Map<string, Langue>(
  (Object.keys(LANGUES) as Langue[]).map((c) => [c.toLowerCase(), c])
);

/**
 * Le code SERVI qui correspond à `code`, à la casse près — ou null.
 *
 * ⚠️ LA CASSE N'EST PAS DÉCORATIVE dans un code de langue. BCP-47 écrit la langue en minuscules,
 * l'écriture en Capitale (« Hant ») et la région en MAJUSCULES (« TW ») — mais les plateformes ne
 * la respectent pas toujours, et un `code in LANGUES` fait échouer « zh-hant » sur « zh-Hant ».
 * Tant qu'aucune langue servie n'avait de sous-étiquette, la question ne se posait pas : mettre
 * le code en minuscules suffisait. Le chinois traditionnel l'a posée.
 */
export function resoudreLangue(code: string | null | undefined): Langue | null {
  if (typeof code !== 'string' || code === '') return null;
  return PAR_CODE_MINUSCULE.get(code.toLowerCase()) ?? null;
}
