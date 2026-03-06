import { useMemo } from "react";
import { useStore } from "@store/index";
import { short, fmtDuration } from "@shared/utils";
import type { FeedEntry } from "@store/slices/donations";

interface MergedEntry extends FeedEntry {
  direction: "in" | "out";
}

export default function FeedView() {
  const feedIn = useStore((s) => s.feedIn);
  const feedOut = useStore((s) => s.feedOut);

  const merged = useMemo((): MergedEntry[] => {
    const all: MergedEntry[] = [];
    for (const e of feedIn) {
      all.push({ ...e, direction: "in" });
    }
    for (const e of feedOut) {
      all.push({ ...e, direction: "out" });
    }
    all.sort((a, b) => b.ts - a.ts);
    return all.slice(0, 200);
  }, [feedIn, feedOut]);

  if (merged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-hammer-muted font-mono text-sm py-8">
        <div className="text-lg mb-1">No feed entries yet</div>
        <div className="text-2xs">
          Live donation activity will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Color Legend */}
      <div className="flex items-center gap-3 mb-2 text-2xs">
        <div className="flex items-center gap-0_5">
          <div className="w-2 h-2 rounded-full bg-hammer-green" />
          <span className="text-hammer-muted">Incoming</span>
        </div>
        <div className="flex items-center gap-0_5">
          <div className="w-2 h-2 rounded-full bg-hammer-gold" />
          <span className="text-hammer-muted">Outgoing</span>
        </div>
      </div>

      {/* Feed Entries */}
      <div className="flex flex-col gap-0_5">
        {merged.map((e, i) => {
          const isIn = e.direction === "in";
          const borderColor = isIn
            ? "border-l-hammer-green"
            : "border-l-hammer-gold";
          const dirLabel = isIn ? "IN" : "OUT";
          const dirColor = isIn ? "text-hammer-green" : "text-hammer-gold";
          const typeIcon = e.type === "gold" ? "g" : "t";
          const amountColor =
            e.type === "gold" ? "text-hammer-gold" : "text-hammer-green";
          const ago = fmtDuration(Date.now() - e.ts);

          return (
            <div
              key={`${e.ts}-${e.name}-${e.direction}-${i}`}
              className={`flex items-center bg-hammer-surface rounded border border-hammer-border border-l-2 ${borderColor} px-2 py-0_5`}
            >
              {/* Direction */}
              <span
                className={`text-2xs font-bold w-6 shrink-0 ${dirColor}`}
              >
                {dirLabel}
              </span>

              {/* Time ago */}
              <span className="text-2xs text-hammer-muted w-12 shrink-0 text-right mr-2">
                {ago}
              </span>

              {/* Player name */}
              <span className="text-xs text-hammer-text truncate flex-1 mr-2">
                {e.name}
              </span>

              {/* Amount */}
              <span className={`text-2xs shrink-0 ${amountColor}`}>
                {short(e.amount)}
                {typeIcon}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
