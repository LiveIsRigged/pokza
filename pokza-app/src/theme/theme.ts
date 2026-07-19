export const colors = {
  feedBackground: '#EDEAE2',
  tableFelt: '#16233D',
  tableRail: '#0E1830',
  cardBack: '#111111',
  cardBackBorder: '#C9A227',
  cardFace: '#FFFFFF',
  cardTextRed: '#C0392B',
  cardTextBlack: '#111111',
  gold: '#C9A227',
  action: '#E8571F',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B63',
  textOnFelt: '#EDEAE2',
  textOnFeltMuted: 'rgba(237,234,226,0.6)',
  foldOverlay: 'rgba(14,24,48,0.55)',
} as const;

export const chipColors = {
  1: '#3B6FD6',
  5: '#C0392B',
  10: '#E8571F',
  25: '#2E8B57',
  100: '#111111',
  1000: '#E8C93B',
  5000: '#F5F5F5',
} as const;

export const fonts = {
  serif: 'Fraunces_600SemiBold',
  serifRegular: 'Fraunces_400Regular',
  sans: 'System',
} as const;

export const typography = {
  authorName: { fontFamily: fonts.sans, fontWeight: '700' as const, fontSize: 16 },
  dateLocation: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 10 },
  contextLine: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 10 },
  postTitle: { fontFamily: fonts.sans, fontWeight: '700' as const, fontSize: 18 },
  voteQuestion: { fontFamily: fonts.sans, fontWeight: '400' as const, fontSize: 12 },
  potAmount: { fontFamily: fonts.serif, fontSize: 12 },
  stackAmount: { fontFamily: fonts.serif, fontSize: 11 },
} as const;
