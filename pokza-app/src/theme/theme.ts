export const colors = {
  feedBackground: '#EDEAE2',
  tableFelt: '#16233D',
  tableFeltLight: '#1C2C4C',
  tableRail: '#0E1830',
  cardBack: '#111111',
  cardBackBorder: '#C9A227',
  cardFace: '#FFFFFF',
  cardTextRed: '#C0392B',
  cardTextBlack: '#111111',
  gold: '#C9A227',
  goldBright: '#E8C93B',
  action: '#E8571F',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B63',
  textOnFelt: '#EDEAE2',
  textOnFeltMuted: 'rgba(237,234,226,0.6)',
  foldOverlay: 'rgba(14,24,48,0.55)',
  // États de siège (hiérarchie claire : héros / actif / gagnant / plié)
  seatDefault: '#0E1830',
  seatHero: '#1C2C4C',
  seatFolded: '#0A1223',
} as const;

// Traits, fonds teintés et icônes estompées : tous dérivés du MÊME navy que le feutre de la table,
// rendu semi-transparent sur le beige du feed. Ils étaient auparavant écrits à la main dans chaque
// fichier — 118 fois, avec 18 opacités différentes dont beaucoup indiscernables entre elles (0,14
// contre 0,15, 0,04 contre 0,05). Ces valeurs sont désormais les seules autorisées : ajouter une
// nouvelle opacité navy ailleurs dans le code recrée exactement le problème.
//
// Les trois familles sont volontairement séparées : un contour de bouton et un fond de bulle n'ont
// aucune raison de bouger ensemble le jour où l'un des deux est retouché.
const navy = (opacity: number) => `rgba(22,35,61,${opacity})`;

/** Traits : contours de boutons et de champs, filets de séparation. */
export const borders = {
  /** Séparation à peine suggérée. */
  subtle: navy(0.1),
  /** Filet entre deux lignes d'une liste — le plus courant. */
  hairline: navy(0.15),
  /** Contour d'un bouton ou d'un champ. */
  default: navy(0.25),
  /** Contour appuyé, quand il doit se voir avant le texte qu'il entoure. */
  strong: navy(0.35),
} as const;

/** Fonds teintés : pastilles, bulles, zones inertes. */
export const tints = {
  faint: navy(0.05),
  light: navy(0.1),
  medium: navy(0.15),
  /** Piste des interrupteurs natifs — imposée par le composant, pas un fond comme les autres. */
  switchTrack: navy(0.18),
  /** Voile sombre derrière du texte blanc (bandeau du scanner de QR code). */
  scrim: navy(0.85),
} as const;

/** Teinte des icônes secondaires (champs de connexion, décor). */
export const iconMuted = navy(0.45);

// Rayons et espacements alignés sur DESIGN_SYSTEM.md (base 4px)
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Jetons alignés sur la palette officielle (gold/orange/navy) plutôt que des couleurs
// "poker cliché" arbitraires — cohérence visuelle avec le reste du produit.
export const chipColors = {
  1: '#5C7AA8',
  5: '#3B6FD6',
  10: '#E8571F',
  25: '#C9A227',
  100: '#16233D',
  1000: '#E8C93B',
  5000: '#F5F5F5',
} as const;

// Cash game uniquement : couleurs de jetons "réelles" par dénomination (1 bleu, 5 rouge,
// 25 vert, 100 noir, 1000 jaune) — le tournoi garde `chipColors` ci-dessus.
export const cashChipColors = {
  1: '#3B6FD6',
  5: '#C0392B',
  25: '#2E8B57',
  100: '#111111',
  1000: '#E8C93B',
} as const;

export const fonts = {
  serif: 'Fraunces_600SemiBold',
  serifRegular: 'Fraunces_400Regular',
  sans: 'System',
} as const;

/**
 * ⚠️ TOUT `TextInput` DOIT ÊTRE À 16px AU MINIMUM — ce n'est pas un choix esthétique.
 *
 * Safari iOS zoome automatiquement sur un champ dont la police calculée est inférieure à 16px,
 * et **ne dézoome jamais** ensuite : la page reste agrandie, y compris après un retour arrière.
 * C'est le bug le plus visible qu'ait rencontré la bêta, sur 11 objets de style d'un coup.
 *
 * Le viewport n'est PAS un recours : depuis iOS 10, Safari ignore `maximum-scale` et
 * `user-scalable=no` pour des raisons d'accessibilité. Les ajouter ne ferait que casser le zoom
 * à deux doigts sur Android. La taille de police est le seul levier réel.
 *
 * Attention aux styles composés : `style={[styles.input, styles.description]}` prend le
 * `fontSize` du DERNIER objet qui en définit un. Un champ peut donc repasser sous 16 sans que
 * sa propre définition ne mente. Le relevé se refait avec `python3 scripts/zoom-scan.py`,
 * lancé depuis la racine du dépôt : il liste tout champ sous 16px, styles composés résolus.
 */
export const typography = {
  authorName: { fontFamily: fonts.sans, fontWeight: '700' as const, fontSize: 16 },
  dateLocation: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 12 },
  contextLine: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 12 },
  postTitle: { fontFamily: fonts.sans, fontWeight: '700' as const, fontSize: 19 },
  description: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 14, lineHeight: 20 },
  voteQuestion: { fontFamily: fonts.sans, fontWeight: '600' as const, fontSize: 14 },
  potAmount: { fontFamily: fonts.serif, fontSize: 13 },
  stackAmount: { fontFamily: fonts.serif, fontSize: 13 },
  seatName: { fontFamily: fonts.sans, fontWeight: '700' as const, fontSize: 12 },
} as const;
