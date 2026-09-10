import { langueCourante } from '../i18n/traduire';
import type { Langue } from '../i18n/langues';

// Liste ISO 3166-1 alpha-2 servant au sélecteur de pays du profil. On ne stocke que le code à deux
// lettres (ex. « FR ») : le drapeau ET LE NOM en sont dérivés à l'affichage.
//
// Les noms venaient d'une table figée en français, elle-même « générée via Intl.DisplayNames('fr') »
// — la traduction ne fait que revenir à la source. Vérifié avant de basculer : sur les 243 pays,
// `Intl.DisplayNames('fr')` rend AUJOURD'HUI exactement les mêmes noms que la table, zéro écart.
// Le gain n'est pas le fichier économisé, c'est que chaque nouvelle langue arrive sans ressaisir
// 243 noms — et sans risquer les fautes que 243 lignes recopiées à la main garantissent.
//
// Le TRI dépend de la langue : « Allemagne » se classe en A, « Germany » en G, « Deutschland » en D.
// D'où `Intl.Collator`, qui connaît aussi les règles locales (le å suédois se classe après le z).

export interface Country {
  /** Code ISO 3166-1 alpha-2, toujours en majuscules (ex. « FR », « BE »). */
  code: string;
  name: string;
}

const CODES: string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AR', 'AS', 'AT', 'AU',
  'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ',
  'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA',
  'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR',
  'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO',
  'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN',
  'GP', 'GQ', 'GR', 'GT', 'GU', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY',
  'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO',
  'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT',
  'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD',
  'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TG', 'TH', 'TJ', 'TK', 'TL',
  'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY',
  'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT',
  'ZA', 'ZM', 'ZW',
];

/** Une liste par langue : la calculer à chaque rendu du sélecteur coûterait 243 appels `Intl`. */
const parLangue = new Map<Langue, { liste: Country[]; parCode: Map<string, Country> }>();

function pour(langue: Langue) {
  const dejaLa = parLangue.get(langue);
  if (dejaLa) return dejaLa;

  let nommer: (code: string) => string;
  try {
    const noms = new Intl.DisplayNames([langue], { type: 'region' });
    // `of()` peut rendre `undefined` pour un code que la plateforme ne connaît pas.
    nommer = (code) => noms.of(code) ?? code;
  } catch {
    // Moteur sans ICU (Hermes compilé sans, sur Android) : le sélecteur affiche les codes plutôt
    // que rien, et la recherche par code continue de fonctionner.
    nommer = (code) => code;
  }

  const liste = CODES.map((code) => ({ code, name: nommer(code) }));
  try {
    const collateur = new Intl.Collator(langue);
    liste.sort((a, b) => collateur.compare(a.name, b.name));
  } catch {
    liste.sort((a, b) => a.name.localeCompare(b.name));
  }

  const calcule = { liste, parCode: new Map(liste.map((p) => [p.code, p])) };
  parLangue.set(langue, calcule);
  return calcule;
}

/** Les pays nommés et triés dans la langue courante. */
export function listeDesPays(): Country[] {
  return pour(langueCourante()).liste;
}

/**
 * Emoji drapeau dérivé du code : chaque lettre est convertie en son « symbole indicateur régional »
 * (A→🇦 …), et la paire forme le drapeau (🇫🇷). Rendu natif sur iOS/Android/macOS ; sous Windows,
 * l'OS n'a pas de glyphes de drapeau et affiche les deux lettres — comportement acceptable, jamais
 * cassé. Renvoie '' pour un code invalide.
 */
export function flagEmoji(code?: string | null): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  const base = 0x1f1e6; // 🇦
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

export function countryByCode(code?: string | null): Country | undefined {
  if (!code) return undefined;
  return pour(langueCourante()).parCode.get(code.toUpperCase());
}

/** Libellé prêt à l'affichage : « 🇫🇷 France ». Renvoie '' si le code est absent ou inconnu. */
export function countryLabel(code?: string | null): string {
  const country = countryByCode(code);
  if (!country) return '';
  return `${flagEmoji(country.code)} ${country.name}`;
}
