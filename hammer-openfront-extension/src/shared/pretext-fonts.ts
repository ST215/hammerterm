const FONT_FAMILY = "'JetBrains Mono', ui-monospace, monospace";

const SIZES = {
  "2xs": { size: 11, lh: 16 },
  xs: { size: 12, lh: 18 },
  sm: { size: 13, lh: 20 },
  base: { size: 14, lh: 20 },
  lg: { size: 15, lh: 22 },
  xl: { size: 17, lh: 24 },
  "2xl": { size: 21, lh: 28 },
} as const;

const WEIGHTS = { normal: 400, medium: 500, semibold: 600 } as const;

export type TextSize = keyof typeof SIZES;
export type FontWeight = keyof typeof WEIGHTS;

export function getFontString(size: TextSize, weight: FontWeight = "normal"): string {
  const s = SIZES[size];
  return `${WEIGHTS[weight]} ${s.size}px ${FONT_FAMILY}`;
}

export function getLineHeight(size: TextSize): number {
  return SIZES[size].lh;
}
