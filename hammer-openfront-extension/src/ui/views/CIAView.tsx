import { useMemo, useCallback } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma } from "@shared/utils";
import { computeRollingRates, computeRelationships, classifyAlerts } from "@shared/logic/cia";
import { Section, StatCard, Badge, PresetButton } from "@ui/components/ds";
import type { CIAFeedFilter } from "@store/slices/cia";
import { CIA_BIG_GOLD_THRESHOLD, CIA_BIG_TROOPS_THRESHOLD } from "@shared/constants";

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
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

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-hammer-red",
  warning: "bg-hammer-warn",
  info: "bg-hammer-blue",
  note: "bg-hammer-dim",
};

const WINDOW_OPTIONS = [
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "All", ms: 0 },
];

const FILTER_OPTIONS: { label: string; value: CIAFeedFilter }[] = [
  { label: "All", value: "all" },
  { label: "Gold", value: "gold" },
  { label: "Troops", value: "troops" },
  { label: "Large", value: "large" },
];

export default function CIAView() {
  const me = useMyPlayer();
  const ciaState = useStore((s) => s.ciaState);
  const playersById = useStore((s) => s.playersById);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);
  const ciaWindowMs = useStore((s) => s.ciaWindowMs);
  const ciaFeedFilter = useStore((s) => s.ciaFeedFilter);
  const setCIAWindow = useStore((s) => s.setCIAWindow);
  const setCIAFeedFilter = useStore((s) => s.setCIAFeedFilter);

  const { transfers } = ciaState;
  const myName = me?.displayName || me?.name || "";

  // Effective window (0 = all time)
  const effectiveWindow = ciaWindowMs === 0 ? Date.now() : ciaWindowMs;

  // Rolling rates for my economy
  const myRates = useMemo(
    () => computeRollingRates(transfers, effectiveWindow, myName),
    [transfers, effectiveWindow, myName],
  );

  // Relationships
  const relationships = useMemo(
    () => computeRelationships(transfers, ciaState.playerTotals, playersById, myTeam, myAllies, effectiveWindow),
    [transfers, ciaState.playerTotals, playersById, myTeam, myAllies, effectiveWindow],
  );

  // My feeders (people sending TO me in the window)
  const myFeedersList = useMemo(() => {
    const cutoff = Date.now() - effectiveWindow;
    const feeders = new Map<string, { gold: number; troops: number; total: number }>();
    for (const t of transfers) {
      if (t.ts < cutoff || t.type === "port") continue;
      if (t.receiverName === myName) {
        const prev = feeders.get(t.senderName) || { gold: 0, troops: 0, total: 0 };
        if (t.type === "gold") prev.gold += t.amount;
        else prev.troops += t.amount;
        prev.total = prev.gold + prev.troops;
        feeders.set(t.senderName, prev);
      }
    }
    return [...feeders.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [transfers, effectiveWindow, myName]);

  // My sends (who I'm sending to)
  const mySendsList = useMemo(() => {
    const cutoff = Date.now() - effectiveWindow;
    const sends = new Map<string, { gold: number; troops: number; total: number }>();
    for (const t of transfers) {
      if (t.ts < cutoff || t.type === "port") continue;
      if (t.senderName === myName) {
        const prev = sends.get(t.receiverName) || { gold: 0, troops: 0, total: 0 };
        if (t.type === "gold") prev.gold += t.amount;
        else prev.troops += t.amount;
        prev.total = prev.gold + prev.troops;
        sends.set(t.receiverName, prev);
      }
    }
    return [...sends.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [transfers, effectiveWindow, myName]);

  // Top income contributor percentage
  const totalIn = myRates.goldIn + myRates.troopsIn;
  const topFeederPct = myFeedersList.length > 0 && totalIn > 0
    ? (myFeedersList[0].total / totalIn * 100).toFixed(0)
    : null;

  // Alerts v2
  const alertsV2 = useMemo(
    () => classifyAlerts(transfers, playersById, myTeam, myAllies).slice(0, 20),
    [transfers, playersById, myTeam, myAllies],
  );

  // Players feeding non-ally
  const feedingNonAlly = useMemo(
    () => relationships.filter((r) => r.feedsNonAlly),
    [relationships],
  );

  // Live feed with filter
  const liveFeed = useMemo(() => {
    let filtered = transfers.filter((t) => t.type !== "port");
    if (ciaFeedFilter === "gold") filtered = filtered.filter((t) => t.type === "gold");
    else if (ciaFeedFilter === "troops") filtered = filtered.filter((t) => t.type === "troops");
    else if (ciaFeedFilter === "large") filtered = filtered.filter((t) =>
      (t.type === "gold" && t.amount >= CIA_BIG_GOLD_THRESHOLD) ||
      (t.type === "troops" && t.amount >= CIA_BIG_TROOPS_THRESHOLD),
    );
    return filtered.slice(-30).reverse();
  }, [transfers, ciaFeedFilter]);

  // World economy
  const worldEcon = useMemo(() => {
    const cutoff = Date.now() - effectiveWindow;
    let goldRate = 0, troopRate = 0;
    const flowPairs = new Set<string>();
    for (const t of transfers) {
      if (t.ts < cutoff || t.type === "port") continue;
      if (t.type === "gold") goldRate += t.amount;
      else troopRate += t.amount;
      flowPairs.add(`${t.senderName}\u2192${t.receiverName}`);
    }
    return { goldRate, troopRate, activeFlows: flowPairs.size };
  }, [transfers, effectiveWindow]);

  // Top flows (rolling window)
  const topFlows = useMemo(() => {
    const cutoff = Date.now() - effectiveWindow;
    const flows = new Map<string, { sender: string; receiver: string; gold: number; troops: number; count: number }>();
    for (const t of transfers) {
      if (t.ts < cutoff || t.type === "port") continue;
      const key = `${t.senderName}\u2192${t.receiverName}`;
      const prev = flows.get(key) || { sender: t.senderName, receiver: t.receiverName, gold: 0, troops: 0, count: 0 };
      if (t.type === "gold") prev.gold += t.amount;
      else prev.troops += t.amount;
      prev.count++;
      flows.set(key, prev);
    }
    return [...flows.values()]
      .sort((a, b) => (b.gold + b.troops) - (a.gold + a.troops))
      .slice(0, 15);
  }, [transfers, effectiveWindow]);

  // Power rankings
  const powerRankings = useMemo(() => {
    const cutoff = Date.now() - effectiveWindow;
    const players = new Map<string, { sent: number; recv: number }>();
    for (const t of transfers) {
      if (t.ts < cutoff || t.type === "port") continue;
      const sp = players.get(t.senderName) || { sent: 0, recv: 0 };
      sp.sent += t.amount;
      players.set(t.senderName, sp);
      const rp = players.get(t.receiverName) || { sent: 0, recv: 0 };
      rp.recv += t.amount;
      players.set(t.receiverName, rp);
    }
    return [...players.entries()]
      .map(([name, d]) => ({ name, sent: d.sent, recv: d.recv, net: d.sent - d.recv }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 15);
  }, [transfers, effectiveWindow]);

  const handleClearAll = useCallback(() => {
    useStore.setState({
      ciaState: {
        transfers: [],
        flowGraph: new Map(),
        playerTotals: new Map(),
        alerts: [],
        seen: new Set(),
      },
    });
  }, []);

  const netFlow = myRates.goldIn + myRates.troopsIn - myRates.goldOut - myRates.troopsOut;
  const windowLabel = WINDOW_OPTIONS.find((w) => w.ms === ciaWindowMs)?.label ?? "5m";

  return (
    <div>
      {/* Section 1: My Economy */}
      <Section title="My Economy">
        <div className="grid grid-cols-2 gap-1">
          <StatCard label="Gold In" value={short(myRates.goldIn)} color="text-hammer-green" sub={`in ${windowLabel}`} />
          <StatCard label="Troops In" value={short(myRates.troopsIn)} color="text-hammer-blue" sub={`in ${windowLabel}`} />
          <StatCard label="Gold Out" value={short(myRates.goldOut)} color="text-hammer-gold" sub={`in ${windowLabel}`} />
          <StatCard
            label="Net Flow"
            value={short(netFlow)}
            color={netFlow >= 0 ? "text-hammer-green" : "text-hammer-red"}
            sub={netFlow >= 0 ? "positive" : "negative"}
          />
        </div>

        {/* My Feeders */}
        {myFeedersList.length > 0 && (
          <div className="mt-2">
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">
              My Feeders
              <span className="ml-1 text-hammer-dim">({myFeedersList.length})</span>
            </div>
            <div className="flex flex-col gap-0_5">
              {myFeedersList.slice(0, 8).map((f, i) => (
                <div key={f.name} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
                  <div className="flex items-center gap-1 truncate mr-2">
                    <span className={nameColor(f.name, playersById, myTeam, myAllies)}>{f.name}</span>
                    {i === 0 && topFeederPct && Number(topFeederPct) >= 25 && (
                      <Badge label="TOP" color="gold" />
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {f.gold > 0 && <span className="text-hammer-gold">{short(f.gold)}g</span>}
                    {f.troops > 0 && <span className="text-hammer-blue">{short(f.troops)}t</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Sends */}
        {mySendsList.length > 0 && (
          <div className="mt-2">
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">
              My Sends
              <span className="ml-1 text-hammer-dim">({mySendsList.length})</span>
            </div>
            <div className="flex flex-col gap-0_5">
              {mySendsList.slice(0, 8).map((s) => (
                <div key={s.name} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
                  <span className={`truncate mr-2 ${nameColor(s.name, playersById, myTeam, myAllies)}`}>{s.name}</span>
                  <div className="flex gap-2 shrink-0">
                    {s.gold > 0 && <span className="text-hammer-gold">{short(s.gold)}g</span>}
                    {s.troops > 0 && <span className="text-hammer-blue">{short(s.troops)}t</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Section 2: Threat Board */}
      <Section title="Threat Board">
        {alertsV2.length === 0 && feedingNonAlly.length === 0 ? (
          <div className="text-hammer-dim text-2xs">No alerts.</div>
        ) : (
          <>
            {alertsV2.length > 0 && (
              <div className="flex flex-col gap-0_5">
                {alertsV2.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-start gap-1_5 text-2xs">
                    <div className={`w-1_5 h-1_5 rounded-full mt-0_5 shrink-0 ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.note}`} />
                    <div className="flex flex-col">
                      <span className="text-hammer-text">{a.title}</span>
                      <span className="text-hammer-dim">{a.detail}</span>
                    </div>
                    <span className="text-hammer-dim ml-auto shrink-0">{timeAgo(a.ts)}</span>
                  </div>
                ))}
              </div>
            )}

            {feedingNonAlly.length > 0 && (
              <div className="mt-2">
                <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">
                  Feeding Non-Ally
                  <span className="ml-1 text-hammer-dim">({feedingNonAlly.length})</span>
                </div>
                <div className="flex flex-col gap-0_5">
                  {feedingNonAlly.slice(0, 8).map((r) => (
                    <div key={r.name} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
                      <span className={nameColor(r.name, playersById, myTeam, myAllies)}>{r.name}</span>
                      <span className="text-hammer-warn">{"\u2192"} {r.feedsNonAllyDetail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Section 3: Intelligence Feed */}
      <Section title="Intelligence Feed" count={liveFeed.length}>
        <div className="flex items-center gap-1 mb-1">
          {FILTER_OPTIONS.map((f) => (
            <PresetButton
              key={f.value}
              label={f.label}
              active={ciaFeedFilter === f.value}
              onClick={() => setCIAFeedFilter(f.value)}
            />
          ))}
        </div>
        {liveFeed.length === 0 ? (
          <div className="text-hammer-dim text-2xs">No transfers recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-0_5">
            {liveFeed.map((t, i) => {
              const isLarge = (t.type === "gold" && t.amount >= CIA_BIG_GOLD_THRESHOLD) ||
                (t.type === "troops" && t.amount >= CIA_BIG_TROOPS_THRESHOLD);
              return (
                <div
                  key={i}
                  className={`flex items-center gap-1_5 text-2xs px-1 py-0_5 rounded ${isLarge ? "bg-hammer-warn/5" : ""}`}
                >
                  <span className="text-hammer-dim w-4 shrink-0 text-right">{timeAgo(t.ts)}</span>
                  <div className={`w-1 h-1 rounded-full shrink-0 ${t.type === "gold" ? "bg-hammer-gold" : "bg-hammer-blue"}`} />
                  <span className={nameColor(t.senderName, playersById, myTeam, myAllies)}>{t.senderName}</span>
                  <span className="text-hammer-dim">{"\u2192"}</span>
                  <span className={nameColor(t.receiverName, playersById, myTeam, myAllies)}>{t.receiverName}</span>
                  <span className={`ml-auto shrink-0 ${t.type === "gold" ? "text-hammer-gold" : "text-hammer-blue"}`}>
                    {short(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 4: World Economy */}
      <Section title="World Economy">
        <div className="grid grid-cols-3 gap-1">
          <StatCard label="Gold Rate" value={short(worldEcon.goldRate)} color="text-hammer-gold" sub={`in ${windowLabel}`} />
          <StatCard label="Troop Rate" value={short(worldEcon.troopRate)} color="text-hammer-blue" sub={`in ${windowLabel}`} />
          <StatCard label="Active Flows" value={String(worldEcon.activeFlows)} color="text-hammer-green" />
        </div>

        {topFlows.length > 0 && (
          <div className="mt-2">
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">Top Flows</div>
            <div className="flex flex-col gap-0_5">
              {topFlows.slice(0, 10).map((flow, i) => (
                <div key={i} className="flex items-center gap-1 text-2xs">
                  <span className="text-hammer-dim w-3 text-right shrink-0">{i + 1}.</span>
                  <span className={nameColor(flow.sender, playersById, myTeam, myAllies)}>{flow.sender}</span>
                  <span className="text-hammer-dim">{"\u2192"}</span>
                  <span className={nameColor(flow.receiver, playersById, myTeam, myAllies)}>{flow.receiver}</span>
                  <div className="flex gap-1 ml-auto shrink-0">
                    {flow.gold > 0 && <span className="text-hammer-gold">{short(flow.gold)}g</span>}
                    {flow.troops > 0 && <span className="text-hammer-blue">{short(flow.troops)}t</span>}
                    <span className="text-hammer-dim">({flow.count}x)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {powerRankings.length > 0 && (
          <div className="mt-2">
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">Power Rankings</div>
            <div className="flex flex-col gap-0_5">
              {powerRankings.map((p) => {
                const role = p.net > 0 ? "Feeder" : p.net < 0 ? "Receiver" : "Balanced";
                const roleColor: "green" | "blue" | "muted" = p.net > 0 ? "green" : p.net < 0 ? "blue" : "muted";
                return (
                  <div key={p.name} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
                    <div className="flex items-center gap-1 truncate mr-2">
                      <span className={nameColor(p.name, playersById, myTeam, myAllies)}>{p.name}</span>
                      <Badge label={role} color={roleColor} />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <span className="text-hammer-green">{short(p.sent)}{"\u2191"}</span>
                      <span className="text-hammer-red">{short(p.recv)}{"\u2193"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* Section 5: Controls */}
      <Section title="Controls">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-2xs text-hammer-muted mr-1">Window:</span>
            {WINDOW_OPTIONS.map((w) => (
              <PresetButton
                key={w.ms}
                label={w.label}
                active={ciaWindowMs === w.ms}
                onClick={() => setCIAWindow(w.ms)}
              />
            ))}
          </div>
          <button
            onClick={handleClearAll}
            className="px-2 py-0_5 text-2xs border border-hammer-red/40 bg-hammer-red/10 text-hammer-red rounded cursor-pointer hover:bg-hammer-red/20 transition-colors"
          >
            Clear Data
          </button>
        </div>
      </Section>
    </div>
  );
}
