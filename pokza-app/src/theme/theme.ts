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
