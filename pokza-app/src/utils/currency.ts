import type { Cle } from '../i18n/traduire';

/**
 * LES DEVISES DE POKZA — une entrée par SIGLE, pas par pays.
 *
 * Le dollar américain, canadien, australien, néo-zélandais, singapourien, hongkongais (donc Macao),
 * mexicain et argentin s'écrivent tous « $ » : ils ne font qu'une ligne. Même chose pour le yen et
 * le yuan (« ¥ ») et pour les couronnes suédoise, norvégienne, danoise et islandaise (« kr »). Le
 * code ISO n'est là que comme identifiant stable de la LIGNE ; il nomme la devise la plus courante
 * de sa famille, pas la seule. Pokza ne convertit jamais rien : la devise n'est qu'une unité
 * d'écriture, elle n'a ni taux ni arithmétique.
 *
 * L'ordre du tableau est celui de l'écran : classé par importance pour le poker, pas par
 * alphabet — les trois premières couvrent la quasi-totalité des mains.
 */

/** Identifiant stable d'une ligne du tableau (cf. `DEVISES`). */
export type CodeDevise =
  | 'EUR' | 'USD' | 'GBP' | 'CZK' | 'BRL' | 'CHF' | 'PLN' | 'SEK' | 'INR' | 'JPY'
  | 'PHP' | 'TRY' | 'RUB' | 'KRW' | 'THB' | 'HUF' | 'RON' | 'UAH' | 'ZAR' | 'ILS'
  | 'AED' | 'MYR' | 'BGN' | 'VND' | 'IDR' | 'GEL' | 'KZT' | 'PEN' | 'NGN' | 'CRC';

export interface Devise {
  code: CodeDevise;
  /** Clé du nom affiché dans la feuille de sélection — un texte figé ici resterait dans la langue
   *  du démarrage, la table étant calculée au chargement du module. */
  cle: Cle;
  sigle: string;
  /** Le sigle se pose DEVANT le nombre ("$10") plutôt que derrière ("10€"). */
  avant: boolean;
  /** Une espace sépare le sigle du nombre ("100 Kč", "CHF 100") — les sigles de plusieurs lettres. */
  espace: boolean;
  /**
   * Montants naturellement à six chiffres ou plus : on les abrège MÊME en cash game (« 4M₫ »),
   * alors que l'argent réel ne s'abrège jamais ailleurs (cf. `formatChipAmount`). Un tapis de 100BB
   * vaut 4 000 000 en dong et 200 000 en won, là où il vaut 500 en euro : sans ça, chaque siège
   * porterait sept chiffres. Jamais en euro ni en dollar — décision de Victor, 30/08/2026.
   */
  abrege: boolean;
}

/** Aucune main ne peut être sans devise : c'est elle qu'on lit quand rien n'est dit (cf. `devise`). */
export const DEVISE_PAR_DEFAUT: CodeDevise = 'EUR';

export const DEVISES: Devise[] = [
  { code: 'EUR', cle: 'devise.eur',                sigle: '€',   avant: false, espace: false, abrege: false },
  { code: 'USD', cle: 'devise.usd',              sigle: '$',   avant: true,  espace: false, abrege: false },
  { code: 'GBP', cle: 'devise.gbp',      sigle: '£',   avant: true,  espace: false, abrege: false },
  { code: 'CZK', cle: 'devise.czk',    sigle: 'Kč',  avant: false, espace: true,  abrege: false },
  { code: 'BRL', cle: 'devise.brl',      sigle: 'R$',  avant: true,  espace: false, abrege: false },
  { code: 'CHF', cle: 'devise.chf',        sigle: 'CHF', avant: true,  espace: true,  abrege: false },
  { code: 'PLN', cle: 'devise.pln',               sigle: 'zł',  avant: false, espace: true,  abrege: false },
  { code: 'SEK', cle: 'devise.sek', sigle: 'kr',  avant: false, espace: true,  abrege: false },
  { code: 'INR', cle: 'devise.inr',     sigle: '₹',   avant: true,  espace: false, abrege: false },
  { code: 'JPY', cle: 'devise.jpy',          sigle: '¥',   avant: true,  espace: false, abrege: true  },
  { code: 'PHP', cle: 'devise.php',      sigle: '₱',   avant: true,  espace: false, abrege: false },
  { code: 'TRY', cle: 'devise.try',        sigle: '₺',   avant: true,  espace: false, abrege: false },
  { code: 'RUB', cle: 'devise.rub',              sigle: '₽',   avant: false, espace: false, abrege: false },
  { code: 'KRW', cle: 'devise.krw',                 sigle: '₩',   avant: true,  espace: false, abrege: true  },
  { code: 'THB', cle: 'devise.thb',                sigle: '฿',   avant: true,  espace: false, abrege: false },
  { code: 'HUF', cle: 'devise.huf',              sigle: 'Ft',  avant: false, espace: true,  abrege: true  },
  { code: 'RON', cle: 'devise.ron',         sigle: 'lei', avant: false, espace: true,  abrege: false },
  { code: 'UAH', cle: 'devise.uah',             sigle: '₴',   avant: false, espace: false, abrege: false },
  { code: 'ZAR', cle: 'devise.zar',                sigle: 'R',   avant: true,  espace: false, abrege: false },
  { code: 'ILS', cle: 'devise.ils',              sigle: '₪',   avant: true,  espace: false, abrege: false },
  { code: 'AED', cle: 'devise.aed',              sigle: 'AED', avant: true,  espace: true,  abrege: false },
  { code: 'MYR', cle: 'devise.myr',             sigle: 'RM',  avant: true,  espace: false, abrege: false },
  { code: 'BGN', cle: 'devise.bgn',                 sigle: 'лв',  avant: false, espace: true,  abrege: false },
  { code: 'VND', cle: 'devise.vnd',                sigle: '₫',   avant: false, espace: false, abrege: true  },
  { code: 'IDR', cle: 'devise.idr',              sigle: 'Rp',  avant: true,  espace: false, abrege: true  },
  { code: 'GEL', cle: 'devise.gel',                sigle: '₾',   avant: false, espace: false, abrege: false },
  { code: 'KZT', cle: 'devise.kzt',               sigle: '₸',   avant: false, espace: false, abrege: true  },
  { code: 'PEN', cle: 'devise.pen',                 sigle: 'S/',  avant: true,  espace: false, abrege: false },
  { code: 'NGN', cle: 'devise.ngn',               sigle: '₦',   avant: true,  espace: false, abrege: true  },
  { code: 'CRC', cle: 'devise.crc',               sigle: '₡',   avant: true,  espace: false, abrege: true  },
];

const PAR_CODE: Record<string, Devise> = Object.fromEntries(DEVISES.map((d) => [d.code, d]));

/**
 * PAS DE TROU POSSIBLE : tout ce qui n'est pas une devise connue redevient l'euro. C'est ce qui
 * permet à `Hand.currency` de rester optionnel — les mains publiées avant l'arrivée du sélecteur
 * n'en portent aucune, et continuent de s'afficher exactement comme avant, sans migration.
 */
export function devise(code?: string | null): Devise {
  return (code && PAR_CODE[code]) || PAR_CODE[DEVISE_PAR_DEFAUT];
}

/** Accole le sigle à un nombre DÉJÀ écrit : "10" → "10€", "$10", "100 Kč", "CHF 100". */
export function habillerMontant(nombre: string, d: Devise): string {
  const espace = d.espace ? ' ' : '';
  return d.avant ? `${d.sigle}${espace}${nombre}` : `${nombre}${espace}${d.sigle}`;
}
