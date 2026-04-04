import { useMemo } from "react";
import { prepare, layout } from "@chenglou/pretext";
import { useContentWidth } from "@ui/hooks/useContentWidth";
import { getFontString, getLineHeight } from "@shared/pretext-fonts";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  cols?: 2 | 3;
}

// Approximate inner width of a StatCard cell given content width and grid columns.
function cellWidth(contentW: number, cols: 2 | 3): number {
  const gapTotal = 5 * (cols - 1); // gap-1 = 5px
  const cellOuter = (contentW - gapTotal) / cols;
  return cellOuter - 18; // card p-2 = 9px*2
}

const LABEL_FONT = getFontString("2xs", "medium");
const LABEL_LH = getLineHeight("2xs");
const VALUE_FONT = getFontString("sm", "semibold");
const VALUE_LH = getLineHeight("sm");
const SUB_FONT = getFontString("2xs", "normal");
const SUB_LH = getLineHeight("2xs");

export default function StatCard({ label, value, sub, color = "text-hammer-text", cols = 2 }: StatCardProps) {
  const contentW = useContentWidth();
  const maxW = cellWidth(contentW, cols);

  // Inline prepare+layout to avoid conditional hook calls for optional `sub`
  const labelH = useMemo(() => layout(prepare(label, LABEL_FONT), maxW, LABEL_LH).height, [label, maxW]);
  const valueH = useMemo(() => layout(prepare(value, VALUE_FONT), maxW, VALUE_LH).height, [value, maxW]);
  const subH = useMemo(() => sub ? layout(prepare(sub, SUB_FONT), maxW, SUB_LH).height : 0, [sub, maxW]);

  return (
    <div className="bg-hammer-raised rounded p-2 border border-hammer-border-subtle">
      <div
        className="text-2xs text-hammer-muted font-medium uppercase tracking-wider mb-0_5"
        style={{ height: labelH, overflow: "hidden" }}
      >
        {label}
      </div>
      <div
        className={`text-sm font-semibold ${color}`}
        style={{ height: valueH, overflow: "hidden" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-2xs text-hammer-dim mt-0_5"
          style={{ height: subH, overflow: "hidden" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
