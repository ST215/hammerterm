import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

export default function Section({ title, count, children }: SectionProps) {
  return (
    <div className="mt-3 first:mt-0" data-section={title}>
      <div className="text-xs text-hammer-muted font-medium uppercase tracking-wider mb-1_5 border-b border-hammer-border pb-0_5 flex items-center justify-between">
        <span>{title}</span>
        {count != null && (
          <span className="text-2xs text-hammer-dim">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
