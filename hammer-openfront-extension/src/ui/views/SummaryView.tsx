import { useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops, fmtSec } from "@shared/utils";
import { Section, StatCard, PercentBar } from "@ui/components/ds";
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
  gpm: number;
  tradeCount: number;
  avgIntSec: number;
}

function useSortedEntries(map: Map<string, DonationRecord>): SortedEntry[] {
  return useMemo(() => {
    const entries: SortedEntry[] = [];
    for (const [, rec] of map) {
      entries.push({
        name: rec.displayName,
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
        gpm: rec.gpm,
        tradeCount: rec.times.length,
        avgIntSec: rec.avgIntSec,
      });
    }
    entries.sort((a, b) => b.gpm - a.gpm);
    return entries;
  }, [map]);
}

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}", "4.", "5."];

export default function SummaryView() {
  const me = useMyPlayer();
  const inbound = useStore((s) => s.inbound);
  const outbound = useStore((s) => s.outbound);
  const ports = useStore((s) => s.ports);
  const gps30 = useStore((s) => s.gps30);
  const gpm60 = useStore((s) => s.gpm60);
  const gpm120 = useStore((s) => s.gpm120);

  const sortedInbound = useSortedEntries(inbound);
  const sortedOutbound = useSortedEntries(outbound);
  const sortedPorts = useSortedPorts(ports);

  const myName = me?.displayName || me?.name || "Unknown";
  const myTroops = dTroops(me?.troops);
  const myGold = Number(me?.gold ?? 0);
  const myTiles = me?.tilesOwned ?? 0;

  const totals = useMemo(() => {
    let inGold = 0, inTroops = 0, inCount = 0;
    for (const [, rec] of inbound) {
      inGold += rec.gold;
      inTroops += rec.troops;
      inCount += rec.count;
    }
    let outGold = 0, outTroops = 0, outCount = 0;
    for (const [, rec] of outbound) {
      outGold += rec.gold;
      outTroops += rec.troops;
      outCount += rec.count;
    }
    let portGold = 0;
    for (const e of sortedPorts) portGold += e.totalGold;

    const totalRecv = inGold + inTroops;
    const totalSent = outGold + outTroops;
    const net = totalRecv - totalSent;
    const totalTx = inCount + outCount;
    const efficiency = totalSent > 0 ? ((totalRecv / totalSent) * 100).toFixed(1) : "---";

    return { inGold, inTroops, outGold, outTroops, portGold, totalRecv, totalSent, net, efficiency, totalTx };
  }, [inbound, outbound, sortedPorts]);

  const topSupporters = useMemo(() => sortedInbound.slice(0, 5), [sortedInbound]);

  return (
    <div>
      {/* Current Status */}
      <Section title="Status">
        <div className="bg-hammer-raised rounded p-2 border border-hammer-border-subtle">
          <div className="flex items-center justify-between mb-1">
            <span className="text-hammer-green text-sm font-semibold">{myName}</span>
            <span className="text-2xs text-hammer-dim">{comma(myTiles)} tiles</span>
          </div>
          <div className="mb-0_5">
            <div className="flex items-center justify-between text-2xs mb-0_5">
              <span className="text-hammer-muted">Troops</span>
              <span className="text-hammer-text">{comma(myTroops)}</span>
            </div>
            <PercentBar value={myTroops} max={myTroops || 1} />
          </div>
          <div className="flex items-center justify-between text-2xs">
            <span className="text-hammer-muted">Gold</span>
            <span className="text-hammer-gold">{comma(myGold)}</span>
          </div>
        </div>
      </Section>

      {/* Session Totals */}
      <Section title="Session Totals">
        <div className="grid grid-cols-2 gap-1">
          <StatCard
            label="Received"
            value={short(totals.totalRecv)}
            sub={`${short(totals.inGold)}g + ${short(totals.inTroops)}t`}
            color="text-hammer-green"
          />
          <StatCard
            label="Sent"
            value={short(totals.totalSent)}
            sub={`${short(totals.outGold)}g + ${short(totals.outTroops)}t`}
            color="text-hammer-red"
          />
          <StatCard
            label="Net Balance"
            value={short(totals.net)}
            color={totals.net >= 0 ? "text-hammer-green" : "text-hammer-red"}
          />
          <StatCard
            label="Efficiency"
            value={totals.efficiency === "---" ? "---" : `${totals.efficiency}%`}
            sub="recv / sent"
            color="text-hammer-blue"
          />
        </div>
      </Section>

      {/* Gold Rate */}
      <Section title="Gold Rate">
        <div className="grid grid-cols-3 gap-1">
          <StatCard label="GPS (30s)" value={short(gps30)} color="text-hammer-gold" />
          <StatCard label="GPM (60s)" value={short(gpm60)} color="text-hammer-gold" />
          <StatCard label="GPM (120s)" value={short(gpm120)} color="text-hammer-gold" />
        </div>
      </Section>

      {/* Top Supporters */}
      {topSupporters.length > 0 && (
        <Section title="Top Supporters" count={sortedInbound.length}>
          <div className="flex flex-col gap-0_5">
            {topSupporters.map((e, i) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs w-5 shrink-0">{MEDALS[i] ?? `${i + 1}.`}</span>
                  <span className="text-hammer-text text-xs truncate">{e.name}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {e.gold > 0 && (
                    <span className="text-hammer-gold text-2xs" title={comma(e.gold)}>
                      {short(e.gold)}g
                    </span>
                  )}
                  {e.troops > 0 && (
                    <span className="text-hammer-green text-2xs" title={comma(e.troops)}>
                      {short(e.troops)}t
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Inbound */}
      {sortedInbound.length > 5 && (
        <Section title="All Inbound" count={sortedInbound.length}>
          <div className="flex flex-col gap-0_5">
            {sortedInbound.slice(5).map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle"
              >
                <span className="text-hammer-text truncate mr-2 text-xs">{e.name}</span>
                <div className="flex gap-2 shrink-0">
                  {e.gold > 0 && (
                    <span className="text-hammer-gold text-2xs" title={comma(e.gold)}>
                      {short(e.gold)}g
                    </span>
                  )}
                  {e.troops > 0 && (
                    <span className="text-hammer-green text-2xs" title={comma(e.troops)}>
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
        <Section title="Outbound" count={sortedOutbound.length}>
          <div className="flex flex-col gap-0_5">
            {sortedOutbound.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle"
              >
                <span className="text-hammer-text truncate mr-2 text-xs">{e.name}</span>
                <div className="flex gap-2 shrink-0">
                  {e.gold > 0 && (
                    <span className="text-hammer-gold text-2xs" title={comma(e.gold)}>
                      {short(e.gold)}g
                    </span>
                  )}
                  {e.troops > 0 && (
                    <span className="text-hammer-green text-2xs" title={comma(e.troops)}>
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
        <Section title="Port Income" count={sortedPorts.length}>
          <div className="grid grid-cols-3 gap-1 mb-1">
            <StatCard label="Total Ports" value={String(sortedPorts.length)} color="text-hammer-blue" />
            <StatCard label="Port Income" value={short(totals.portGold)} color="text-hammer-gold" />
            <StatCard
              label="Best GPM"
              value={sortedPorts[0] ? sortedPorts[0].gpm.toFixed(1) : "0"}
              sub={sortedPorts[0]?.name}
              color="text-hammer-green"
            />
          </div>
          <div className="flex flex-col gap-0_5">
            {sortedPorts.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle"
              >
                <span className="text-hammer-blue truncate mr-2 text-xs">{p.name}</span>
                <div className="flex gap-2 shrink-0">
                  <span className="text-hammer-gold text-2xs" title={comma(p.totalGold)}>
                    {short(p.totalGold)}g
                  </span>
                  <span className="text-hammer-muted text-2xs">
                    {p.gpm.toFixed(1)}/m
                  </span>
                  <span className="text-hammer-dim text-2xs">
                    {p.tradeCount}x
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
