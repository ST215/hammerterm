import { useMemo } from "react";
import { prepare, layout } from "@chenglou/pretext";
import {
  getFontString,
  getLineHeight,
  type TextSize,
  type FontWeight,
} from "@shared/pretext-fonts";

/**
 * Pretext-powered text layout hook.
 * - `prepare()` runs only when text/font changes (expensive, ~0.1ms).
 * - `layout()` runs on every width change (pure arithmetic, ~0.0002ms).
 * Safe to call on every resize frame without triggering DOM reflows.
 */
export function usePretextLayout(
  text: string,
  size: TextSize,
  weight: FontWeight = "normal",
  maxWidth: number,
) {
  const fontStr = getFontString(size, weight);
  const lh = getLineHeight(size);

  const prepared = useMemo(() => prepare(text, fontStr), [text, fontStr]);
  const result = useMemo(
    () => layout(prepared, maxWidth, lh),
    [prepared, maxWidth, lh],
  );

  return result;
}
