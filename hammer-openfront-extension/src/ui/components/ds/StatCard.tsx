interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export default function StatCard({ label, value, sub, color = "text-hammer-text" }: StatCardProps) {
  return (
    <div className="bg-hammer-raised rounded p-2 border border-hammer-border-subtle">
      <div className="text-2xs text-hammer-muted font-medium uppercase tracking-wider mb-0_5">
        {label}
      </div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      {sub && (
        <div className="text-2xs text-hammer-dim mt-0_5">{sub}</div>
      )}
    </div>
  );
}
