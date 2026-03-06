import { useMemo } from "react";
import { useStore } from "@store/index";
import { short, comma, fmtSec } from "@shared/utils";
import type { PortRecord } from "@shared/types";

interface PortEntry {
  name: string;
  totalGold: number;
  gpm: number;
  avgIntSec: number;
  lastIntSec: number;
  tradeCount: number;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="text-xs text-hammer-muted uppercase tracking-wider mb-1 border-b border-hammer-border pb-0_5">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function PortsView() {
  const ports = useStore((s) => s.ports);

  const sortedPorts = useMemo((): PortEntry[] => {
    const entries: PortEntry[] = [];
    for (const [name, rec] of ports) {
      entries.push({
        name,
        totalGold: rec.totalGold,
        gpm: rec.gpm,
        avgIntSec: rec.avgIntSec,
        lastIntSec: rec.lastIntSec,
        tradeCount: rec.times.length,
      });
    }
    entries.sort((a, b) => b.gpm - a.gpm);
    return entries;
  }, [ports]);

  const stats = useMemo(() => {
    if (sortedPorts.length === 0) return null;
    let totalGold = 0;
    let totalGpm = 0;
    for (const p of sortedPorts) {
      totalGold += p.totalGold;
      totalGpm += p.gpm;
    }
    const avgGpm =
      sortedPorts.length > 0 ? totalGpm / sortedPorts.length : 0;
    return {
      totalPorts: sortedPorts.length,
      avgGpm,
      totalGold,
    };
  }, [sortedPorts]);

  const bestPort = sortedPorts.length > 0 ? sortedPorts[0] : null;

  if (sortedPorts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-hammer-muted font-mono text-sm py-8">
        <div className="text-lg mb-1">No port data yet</div>
        <div className="text-2xs">
          Port income will appear here as trades are recorded.
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Best Port Recommendation */}
      {bestPort && (
        <div className="bg-hammer-surface rounded p-2 border border-hammer-border mb-2">
          <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-0_5">
            Best Port (Highest GPM)
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hammer-green text-sm font-bold truncate mr-2">
              {bestPort.name}
            </span>
            <span className="text-hammer-gold text-sm shrink-0">
              {bestPort.gpm.toFixed(1)} g/min
            </span>
          </div>
          <div className="text-2xs text-hammer-muted mt-0_5">
            {comma(bestPort.totalGold)} gold total from {bestPort.tradeCount}{" "}
            trades
          </div>
        </div>
      )}

      {/* Port Statistics */}
      {stats && (
        <Section title="Port Statistics">
          <div className="grid grid-cols-3 gap-1">
            <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
              <div className="text-2xs text-hammer-muted uppercase mb-0_5">
                Total Ports
              </div>
              <div className="text-sm text-hammer-blue">
                {stats.totalPorts}
              </div>
            </div>
            <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
              <div className="text-2xs text-hammer-muted uppercase mb-0_5">
                Avg Gold/Min
              </div>
              <div className="text-sm text-hammer-gold">
                {stats.avgGpm.toFixed(1)}
              </div>
            </div>
            <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
              <div className="text-2xs text-hammer-muted uppercase mb-0_5">
                Total Income
              </div>
              <div className="text-sm text-hammer-gold">
                {short(stats.totalGold)}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Port Details */}
      <Section title="Port Details">
        <div className="flex flex-col gap-1">
          {sortedPorts.map((p) => (
            <div
              key={p.name}
              className="bg-hammer-surface rounded p-2 border border-hammer-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-hammer-blue text-xs font-bold truncate mr-2">
                  {p.name}
                </span>
                <span className="text-hammer-gold text-2xs shrink-0">
                  {p.gpm.toFixed(1)} g/min
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-2xs">
                <div className="flex justify-between">
                  <span className="text-hammer-muted">Total Gold</span>
                  <span className="text-hammer-gold" title={comma(p.totalGold)}>
                    {short(p.totalGold)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-muted">Trades</span>
                  <span className="text-hammer-text">{p.tradeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-muted">Avg Interval</span>
                  <span className="text-hammer-text">
                    {p.avgIntSec > 0 ? fmtSec(p.avgIntSec) : "---"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hammer-muted">Last Interval</span>
                  <span className="text-hammer-text">
                    {p.lastIntSec > 0 ? fmtSec(p.lastIntSec) : "---"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
