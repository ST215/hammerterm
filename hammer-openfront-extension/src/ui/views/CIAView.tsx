import { useMemo } from "react";
import { useStore } from "@store/index";
import { short, comma } from "@shared/utils";
import { asIsAlly } from "@shared/logic/player-helpers";
import type { CIAFlowEntry, CIAPlayerTotal } from "@shared/types";

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function nameColor(
  name: string,
  playersById: Map<string, any>,
  myTeam: number | null,
  myAllies: Set<number>,
): string {
  for (const p of playersById.values()) {
    const pName = p.displayName || p.name || "";
    if (pName === name) {
      if (p.team != null && myTeam != null && p.team === myTeam) return "text-hammer-blue";
      if (p.smallID != null && myAllies.has(p.smallID)) return "text-hammer-green";
      return "text-hammer-text";
    }
  }
  return "text-hammer-text";
}

export default function CIAView() {
  const ciaState = useStore((s) => s.ciaState);
  const gps30 = useStore((s) => s.gps30);
  const gpm60 = useStore((s) => s.gpm60);
  const gpm120 = useStore((s) => s.gpm120);
  const playersById = useStore((s) => s.playersById);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);

  const { transfers, flowGraph, playerTotals, alerts } = ciaState;

  // Stat totals
  const stats = useMemo(() => {
    let totalGold = 0;
    let totalTroops = 0;
    for (const flow of flowGraph.values()) {
      totalGold += flow.gold;
      totalTroops += flow.troops;
    }
    return {
      transferCount: transfers.length,
      totalGold,
      totalTroops,
      connections: flowGraph.size,
    };
  }, [transfers.length, flowGraph]);

  // Alerts sorted desc
  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => b.ts - a.ts).slice(0, 10),
    [alerts],
  );

  // Top flows sorted by total
  const topFlows = useMemo(() => {
    const entries = [...flowGraph.values()];
    entries.sort((a, b) => (b.gold + b.troops) - (a.gold + a.troops));
    return entries.slice(0, 15);
  }, [flowGraph]);

  // Rankings
  const rankings = useMemo(() => {
    const entries = [...playerTotals.entries()];
    const senders = entries
      .map(([name, t]) => ({ name, total: t.sentGold + t.sentTroops, ...t }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const receivers = entries
      .map(([name, t]) => ({ name, total: t.recvGold + t.recvTroops, ...t }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    return { senders, receivers };
  }, [playerTotals]);

  // Net balance
  const netBalance = useMemo(() => {
    const entries = [...playerTotals.entries()];
    const balances = entries.map(([name, t]) => {
      const sent = t.sentGold + t.sentTroops;
      const recv = t.recvGold + t.recvTroops;
      return { name, net: sent - recv, sent, recv };
    });
    balances.sort((a, b) => b.net - a.net);
    const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.net)));
    return { balances, maxAbs };
  }, [playerTotals]);

  // Economy pulse
  const economyPulse = useMemo(() => {
    const now = Date.now();
    const recent = transfers.filter((t) => now - t.ts < 60_000);
    const goldPerMin = recent.filter((t) => t.type === "gold").reduce((s, t) => s + t.amount, 0);
    const troopsPerMin = recent.filter((t) => t.type === "troops").reduce((s, t) => s + t.amount, 0);
    return {
      goldPerMin,
      troopsPerMin,
      transfersPerMin: recent.length,
    };
  }, [transfers]);

  // Live feed: last 30 non-port transfers
  const liveFeed = useMemo(
    () =>
      transfers
        .filter((t) => t.type !== "port")
        .slice(-30)
        .reverse(),
    [transfers],
  );

  function handleClearAll() {
    useStore.setState({
      ciaState: {
        transfers: [],
        flowGraph: new Map(),
        playerTotals: new Map(),
        alerts: [],
        seen: new Set(),
      },
    });
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Legend */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Legend</div>
        <div className="flex flex-wrap gap-8 text-xs">
          <span className="text-hammer-gold">Gold = gold transfers</span>
          <span className="text-hammer-blue">Troops = troop transfers</span>
          <span className="text-hammer-red">Betrayal = teammate feeding enemy</span>
          <span className="text-hammer-gold">Big = large transfers</span>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Transfers", value: comma(stats.transferCount), color: "text-hammer-text" },
          { label: "Gold Flow", value: short(stats.totalGold), color: "text-hammer-gold" },
          { label: "Troop Flow", value: short(stats.totalTroops), color: "text-hammer-blue" },
          { label: "Connections", value: String(stats.connections), color: "text-hammer-green" },
        ].map((s) => (
          <div key={s.label} className="bg-hammer-card border border-hammer-border p-8 flex flex-col items-center gap-4">
            <span className="text-hammer-muted text-xs">{s.label}</span>
            <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Alerts</div>
        {sortedAlerts.length === 0 ? (
          <div className="text-hammer-muted text-xs">No alerts yet.</div>
        ) : (
          sortedAlerts.map((a, i) => (
            <div key={i} className="flex items-start gap-8 text-xs">
              <span className="text-hammer-muted whitespace-nowrap">{timeAgo(a.ts)}</span>
              <span
                className={
                  a.level === "betrayal"
                    ? "text-hammer-red"
                    : a.level === "big"
                      ? "text-hammer-gold"
                      : "text-hammer-text"
                }
              >
                {a.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Top Resource Flows */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Top Resource Flows</div>
        {topFlows.length === 0 ? (
          <div className="text-hammer-muted text-xs">No flows recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {topFlows.map((flow, i) => {
              const sColor = nameColor(flow.sender, playersById, myTeam, myAllies);
              const rColor = nameColor(flow.receiver, playersById, myTeam, myAllies);
              const totalCount = flow.goldCount + flow.troopsCount;
              return (
                <div key={i} className="flex items-center gap-4 text-xs">
                  <span className="text-hammer-muted w-4 text-right">{i + 1}.</span>
                  <span className={sColor}>{flow.sender}</span>
                  <span className="text-hammer-muted">{"\u2192"}</span>
                  <span className={rColor}>{flow.receiver}</span>
                  <span className="text-hammer-gold">{short(flow.gold)}g</span>
                  <span className="text-hammer-blue">{short(flow.troops)}t</span>
                  <span className="text-hammer-muted">({totalCount}x)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-2 gap-8">
        {/* Most Generous */}
        <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
          <div className="text-hammer-gold text-sm font-bold">Most Generous</div>
          {rankings.senders.length === 0 ? (
            <div className="text-hammer-muted text-xs">No data.</div>
          ) : (
            rankings.senders.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-hammer-muted">{i + 1}.</span>
                  <span className={nameColor(s.name, playersById, myTeam, myAllies)}>
                    {s.name}
                  </span>
                </div>
                <span className="text-hammer-gold">{short(s.total)}</span>
              </div>
            ))
          )}
        </div>

        {/* Most Fed */}
        <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
          <div className="text-hammer-red text-sm font-bold">Most Fed</div>
          {rankings.receivers.length === 0 ? (
            <div className="text-hammer-muted text-xs">No data.</div>
          ) : (
            rankings.receivers.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-hammer-muted">{i + 1}.</span>
                  <span className={nameColor(r.name, playersById, myTeam, myAllies)}>
                    {r.name}
                  </span>
                </div>
                <span className="text-hammer-red">{short(r.total)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Net Balance */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Net Balance</div>
        <div className="flex gap-8 text-xs text-hammer-muted">
          <span>Positive = feeder</span>
          <span>Negative = parasite</span>
        </div>
        {netBalance.balances.length === 0 ? (
          <div className="text-hammer-muted text-xs">No data.</div>
        ) : (
          netBalance.balances.map((b, i) => {
            const pct = Math.abs(b.net) / netBalance.maxAbs;
            const barWidth = Math.max(2, Math.round(pct * 100));
            const isPositive = b.net >= 0;
            return (
              <div key={i} className="flex items-center gap-4 text-xs">
                <span
                  className={`w-24 truncate ${nameColor(b.name, playersById, myTeam, myAllies)}`}
                >
                  {b.name}
                </span>
                <div className="flex-1 flex items-center gap-4">
                  <div className="flex-1 h-2 bg-hammer-bg border border-hammer-border relative overflow-hidden">
                    <div
                      className={isPositive ? "bg-hammer-green" : "bg-hammer-red"}
                      style={{
                        position: "absolute",
                        [isPositive ? "left" : "right"]: "50%",
                        width: `${barWidth / 2}%`,
                        top: 0,
                        bottom: 0,
                      }}
                    />
                  </div>
                </div>
                <span className={isPositive ? "text-hammer-green" : "text-hammer-red"}>
                  {isPositive ? "+" : ""}{short(b.net)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Economy Pulse */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Economy Pulse</div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="flex flex-col items-center gap-4">
            <span className="text-hammer-muted">Gold/min</span>
            <span className="text-hammer-gold font-bold">{short(economyPulse.goldPerMin)}</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <span className="text-hammer-muted">Troops/min</span>
            <span className="text-hammer-blue font-bold">{short(economyPulse.troopsPerMin)}</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <span className="text-hammer-muted">Transfers/min</span>
            <span className="text-hammer-text font-bold">{economyPulse.transfersPerMin}</span>
          </div>
        </div>
        <div className="text-xs text-hammer-muted">
          Gold rates: {short(gps30)}/30s | {short(gpm60)}/60s | {short(gpm120)}/120s
        </div>
      </div>

      {/* Live Feed */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Live Feed</div>
        {liveFeed.length === 0 ? (
          <div className="text-hammer-muted text-xs">No transfers recorded yet.</div>
        ) : (
          liveFeed.map((t, i) => {
            const sColor = nameColor(t.senderName, playersById, myTeam, myAllies);
            const rColor = nameColor(t.receiverName, playersById, myTeam, myAllies);
            return (
              <div key={i} className="flex items-center gap-4 text-xs">
                <span className="text-hammer-muted whitespace-nowrap">{timeAgo(t.ts)}</span>
                <span className={sColor}>{t.senderName}</span>
                <span className="text-hammer-muted">{"\u2192"}</span>
                <span className={rColor}>{t.receiverName}</span>
                <span className={t.type === "gold" ? "text-hammer-gold" : "text-hammer-blue"}>
                  {short(t.amount)} {t.type}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-end">
        <button
          onClick={handleClearAll}
          className="px-12 py-4 text-xs font-mono border border-hammer-red bg-hammer-red/10 text-hammer-red cursor-pointer hover:bg-hammer-red/20"
        >
          Clear All Data
        </button>
      </div>
    </div>
  );
}
