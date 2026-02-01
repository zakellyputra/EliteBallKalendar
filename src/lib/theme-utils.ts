// Utility for generating dynamic gradient styles based on theme
export const brandGradient = {
  background: 'linear-gradient(to bottom right, var(--brand-primary), var(--brand-secondary))',
  backgroundClip: 'text' as const,
  WebkitBackgroundClip: 'text' as const,
  color: 'transparent',
};

export const brandGradientBg = {
  background: 'linear-gradient(to bottom right, var(--brand-primary), var(--brand-secondary))',
};

export const brandGradientBgHorizontal = {
  background: 'linear-gradient(to right, var(--brand-primary), var(--brand-secondary))',
};
