import { useRef, useMemo } from "react";
import { useStore } from "@store/index";
import { short, comma } from "@shared/utils";
import type { DonationRecord, PortRecord } from "@shared/types";

interface SortedEntry {
  name: string;
  gold: number;
  troops: number;
  total: number;
}

interface SortedPort {
  name: string;
  totalGold: number;
  times: number[];
  gpm: number;
}

function useSortedEntries(map: Map<string, DonationRecord>): SortedEntry[] {
  return useMemo(() => {
    const entries: SortedEntry[] = [];
    for (const [name, rec] of map) {
      entries.push({
        name,
        gold: rec.gold,
        troops: rec.troops,
        total: rec.gold + rec.troops,
      });
    }
    entries.sort((a, b) => b.total - a.total);
    return entries;
  }, [map]);
}

function useSortedPorts(map: Map<string, PortRecord>): SortedPort[] {
  return useMemo(() => {
    const entries: SortedPort[] = [];
    for (const [name, rec] of map) {
      entries.push({
        name,
        totalGold: rec.totalGold,
        times: rec.times,
        gpm: rec.gpm,
      });
    }
    entries.sort((a, b) => b.totalGold - a.totalGold);
    return entries;
  }, [map]);
}

function StatCard({
  label,
  gold,
  troops,
  goldOnly,
}: {
  label: string;
  gold: number;
  troops?: number;
  goldOnly?: boolean;
}) {
  return (
    <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
      <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-0_5">
        {label}
      </div>
      <div className="flex flex-col gap-0_5">
        <span className="text-hammer-gold text-sm font-mono">
          {short(gold)} gold
        </span>
        {!goldOnly && (
          <span className="text-hammer-green text-sm font-mono">
            {short(troops ?? 0)} troops
          </span>
        )}
      </div>
    </div>
  );
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

export default function SummaryView() {
  const inbound = useStore((s) => s.inbound);
  const outbound = useStore((s) => s.outbound);
  const ports = useStore((s) => s.ports);

  const sessionStartRef = useRef(Date.now());

  const sortedInbound = useSortedEntries(inbound);
  const sortedOutbound = useSortedEntries(outbound);
  const sortedPorts = useSortedPorts(ports);

  // Aggregate stats
  const totals = useMemo(() => {
    let inGold = 0;
    let inTroops = 0;
    for (const e of sortedInbound) {
      inGold += e.gold;
      inTroops += e.troops;
    }
    let outGold = 0;
    let outTroops = 0;
    for (const e of sortedOutbound) {
      outGold += e.gold;
      outTroops += e.troops;
    }
    let portGold = 0;
    for (const e of sortedPorts) {
      portGold += e.totalGold;
    }
    return { inGold, inTroops, outGold, outTroops, portGold };
  }, [sortedInbound, sortedOutbound, sortedPorts]);

  const netGold = totals.inGold - totals.outGold;

  const hasData =
    sortedInbound.length > 0 ||
    sortedOutbound.length > 0 ||
    sortedPorts.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-hammer-muted font-mono text-sm py-8">
        <div className="text-lg mb-1">No donations yet</div>
        <div className="text-2xs">
          Donation data will appear here as it is recorded.
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Stat Grid */}
      <div className="grid grid-cols-2 gap-1">
        <StatCard
          label="From Players"
          gold={totals.inGold}
          troops={totals.inTroops}
        />
        <StatCard label="From Ports" gold={totals.portGold} goldOnly />
        <StatCard
          label="Sent"
          gold={totals.outGold}
          troops={totals.outTroops}
        />
        <StatCard
          label="Net (Players)"
          gold={netGold}
          goldOnly
        />
      </div>

      {/* Inbound (Players) */}
      {sortedInbound.length > 0 && (
        <Section title="Inbound (Players)">
          <div className="flex flex-col gap-0_5">
            {sortedInbound.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border"
              >
                <span className="text-hammer-text truncate mr-2 text-xs">
                  {e.name}
                </span>
                <div className="flex gap-2 shrink-0">
                  {e.gold > 0 && (
                    <span
                      className="text-hammer-gold text-2xs"
                      title={comma(e.gold)}
                    >
                      {short(e.gold)}g
                    </span>
                  )}
                  {e.troops > 0 && (
                    <span
                      className="text-hammer-green text-2xs"
                      title={comma(e.troops)}
                    >
                      {short(e.troops)}t
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Outbound */}
      {sortedOutbound.length > 0 && (
        <Section title="Outbound">
          <div className="flex flex-col gap-0_5">
            {sortedOutbound.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border"
              >
                <span className="text-hammer-text truncate mr-2 text-xs">
                  {e.name}
                </span>
                <div className="flex gap-2 shrink-0">
                  {e.gold > 0 && (
                    <span
                      className="text-hammer-gold text-2xs"
                      title={comma(e.gold)}
                    >
                      {short(e.gold)}g
                    </span>
                  )}
                  {e.troops > 0 && (
                    <span
                      className="text-hammer-green text-2xs"
                      title={comma(e.troops)}
                    >
                      {short(e.troops)}t
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Port Income */}
      {sortedPorts.length > 0 && (
        <Section title="Port Income">
          <div className="flex flex-col gap-0_5">
            {sortedPorts.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border"
              >
                <span className="text-hammer-blue truncate mr-2 text-xs">
                  {p.name}
                </span>
                <div className="flex gap-2 shrink-0">
                  <span
                    className="text-hammer-gold text-2xs"
                    title={comma(p.totalGold)}
                  >
                    {short(p.totalGold)}g
                  </span>
                  <span className="text-hammer-muted text-2xs">
                    {p.times.length}x
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
