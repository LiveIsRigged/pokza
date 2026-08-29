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
  /** Nom affiché dans la feuille de sélection. */
  nom: string;
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
  { code: 'EUR', nom: 'Euro',                sigle: '€',   avant: false, espace: false, abrege: false },
  { code: 'USD', nom: 'Dollar',              sigle: '$',   avant: true,  espace: false, abrege: false },
  { code: 'GBP', nom: 'Livre sterling',      sigle: '£',   avant: true,  espace: false, abrege: false },
  { code: 'CZK', nom: 'Couronne tchèque',    sigle: 'Kč',  avant: false, espace: true,  abrege: false },
  { code: 'BRL', nom: 'Real brésilien',      sigle: 'R$',  avant: true,  espace: false, abrege: false },
  { code: 'CHF', nom: 'Franc suisse',        sigle: 'CHF', avant: true,  espace: true,  abrege: false },
  { code: 'PLN', nom: 'Złoty',               sigle: 'zł',  avant: false, espace: true,  abrege: false },
  { code: 'SEK', nom: 'Couronne scandinave', sigle: 'kr',  avant: false, espace: true,  abrege: false },
  { code: 'INR', nom: 'Roupie indienne',     sigle: '₹',   avant: true,  espace: false, abrege: false },
  { code: 'JPY', nom: 'Yen / Yuan',          sigle: '¥',   avant: true,  espace: false, abrege: true  },
  { code: 'PHP', nom: 'Peso philippin',      sigle: '₱',   avant: true,  espace: false, abrege: false },
  { code: 'TRY', nom: 'Livre turque',        sigle: '₺',   avant: true,  espace: false, abrege: false },
  { code: 'RUB', nom: 'Rouble',              sigle: '₽',   avant: false, espace: false, abrege: false },
  { code: 'KRW', nom: 'Won',                 sigle: '₩',   avant: true,  espace: false, abrege: true  },
  { code: 'THB', nom: 'Baht',                sigle: '฿',   avant: true,  espace: false, abrege: false },
  { code: 'HUF', nom: 'Forint',              sigle: 'Ft',  avant: false, espace: true,  abrege: true  },
  { code: 'RON', nom: 'Leu roumain',         sigle: 'lei', avant: false, espace: true,  abrege: false },
  { code: 'UAH', nom: 'Hryvnia',             sigle: '₴',   avant: false, espace: false, abrege: false },
  { code: 'ZAR', nom: 'Rand',                sigle: 'R',   avant: true,  espace: false, abrege: false },
  { code: 'ILS', nom: 'Shekel',              sigle: '₪',   avant: true,  espace: false, abrege: false },
  { code: 'AED', nom: 'Dirham',              sigle: 'AED', avant: true,  espace: true,  abrege: false },
  { code: 'MYR', nom: 'Ringgit',             sigle: 'RM',  avant: true,  espace: false, abrege: false },
  { code: 'BGN', nom: 'Lev',                 sigle: 'лв',  avant: false, espace: true,  abrege: false },
  { code: 'VND', nom: 'Dong',                sigle: '₫',   avant: false, espace: false, abrege: true  },
  { code: 'IDR', nom: 'Rupiah',              sigle: 'Rp',  avant: true,  espace: false, abrege: true  },
  { code: 'GEL', nom: 'Lari',                sigle: '₾',   avant: false, espace: false, abrege: false },
  { code: 'KZT', nom: 'Tenge',               sigle: '₸',   avant: false, espace: false, abrege: true  },
  { code: 'PEN', nom: 'Sol',                 sigle: 'S/',  avant: true,  espace: false, abrege: false },
  { code: 'NGN', nom: 'Naira',               sigle: '₦',   avant: true,  espace: false, abrege: true  },
  { code: 'CRC', nom: 'Colón',               sigle: '₡',   avant: true,  espace: false, abrege: true  },
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
