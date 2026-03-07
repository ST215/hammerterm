interface BadgeProps {
  label: string;
  color?: "green" | "blue" | "gold" | "red" | "warn" | "purple" | "cyan" | "muted";
  active?: boolean;
  onClick?: () => void;
}

const COLOR_MAP: Record<string, string> = {
  green: "bg-hammer-green/15 text-hammer-green",
  blue: "bg-hammer-blue/15 text-hammer-blue",
  gold: "bg-hammer-gold/15 text-hammer-gold",
  red: "bg-hammer-red/15 text-hammer-red",
  warn: "bg-hammer-warn/15 text-hammer-warn",
  purple: "bg-hammer-purple/15 text-hammer-purple",
  cyan: "bg-hammer-cyan/15 text-hammer-cyan",
  muted: "bg-hammer-dim/15 text-hammer-muted",
};

export default function Badge({ label, color = "muted", active, onClick }: BadgeProps) {
  const colorClass = COLOR_MAP[color] ?? COLOR_MAP.muted;
  const interactiveClass = onClick
    ? "cursor-pointer hover:opacity-80 transition-opacity"
    : "";
  const activeClass = active ? "ring-1 ring-current" : "";

  return (
    <span
      className={`inline-flex items-center px-1 py-0_5 rounded text-2xs font-medium ${colorClass} ${interactiveClass} ${activeClass}`}
      onClick={onClick}
    >
      {label}
    </span>
  );
}
