interface PercentBarProps {
  value: number;
  max: number;
  color?: string;
}

export default function PercentBar({ value, max, color = "bg-hammer-green" }: PercentBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-hammer-bg rounded h-1_5 overflow-hidden">
      <div
        className={`h-full rounded transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
