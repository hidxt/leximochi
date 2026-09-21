export const tokens = {
  color: {
    background: '#FFFDF7',
    surface: '#FFFFFF',
    primary: '#FF8A3D',
    primaryDark: '#E06A1F',
    accent: '#4EC5A5',
    textPrimary: '#2B2118',
    textSecondary: '#6B5B4B',
    danger: '#E5484D',
    border: '#EADFD2',
    gold: '#F5C542',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
  duration: { fast: 120, normal: 240, slow: 480 },
} as const;

export type DesignTokens = typeof tokens;
