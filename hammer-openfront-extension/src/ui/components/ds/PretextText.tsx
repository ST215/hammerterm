import { usePretextLayout } from "@ui/hooks/usePretextLayout";
import type { TextSize, FontWeight } from "@shared/pretext-fonts";

interface PretextTextProps {
  text: string;
  size: TextSize;
  weight?: FontWeight;
  maxWidth: number;
  className?: string;
  as?: "div" | "span";
}

export default function PretextText({
  text,
  size,
  weight = "normal",
  maxWidth,
  className,
  as: Tag = "div",
}: PretextTextProps) {
  const { height } = usePretextLayout(text, size, weight, maxWidth);

  return (
    <Tag className={className} style={{ height, overflow: "hidden" }}>
      {text}
    </Tag>
  );
}
