import type { ReactNode } from "react";

interface DataRowProps {
  left: ReactNode;
  right: ReactNode;
  sub?: ReactNode;
}

export default function DataRow({ left, right, sub }: DataRowProps) {
  return (
    <div className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
      <div className="flex flex-col truncate mr-2">
        <span className="text-hammer-text truncate">{left}</span>
        {sub && <span className="text-hammer-dim">{sub}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}
