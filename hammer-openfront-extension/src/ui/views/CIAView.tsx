import { useMemo, useCallback, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { record } from "../../recorder";
import { useContentWidth } from "@ui/hooks/useContentWidth";
import { short, comma } from "@shared/utils";
import { computeRollingRates, computeRelationships, classifyAlerts } from "@shared/logic/cia";
import { Section, StatCard, Badge, PercentBar, PresetButton, PretextText } from "@ui/components/ds";
import type { CIAFeedFilter } from "@store/slices/cia";
import { CIA_BIG_GOLD_THRESHOLD, CIA_BIG_TROOPS_THRESHOLD } from "@shared/constants";

import { timeAgo, nameColor } from "@shared/ui-helpers";

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

interface AidEntry {
  name: string;
  gold: number;
  troops: number;
  goldCount: number;
  troopsCount: number;
  totalCount: number;
  total: number;
  lastTs: number;
  pct: number;
}

function buildAidList(
  transfers: { ts: number; type: string; senderName: string; receiverName: string; amount: number }[],
  myName: string,
  effectiveWindow: number,
  direction: "incoming" | "outgoing",
): AidEntry[] {
  const cutoff = Date.now() - effectiveWindow;
  const map = new Map<string, Omit<AidEntry, "name" | "pct">>();
  let grandTotal = 0;

  for (const t of transfers) {
    if (t.ts < cutoff || t.type === "port") continue;
    const matchName =
      direction === "incoming"
        ? t.receiverName === myName ? t.senderName : null
        : t.senderName === myName ? t.receiverName : null;
    if (!matchName) continue;

    const prev = map.get(matchName) || { gold: 0, troops: 0, goldCount: 0, troopsCount: 0, totalCount: 0, total: 0, lastTs: 0 };
    if (t.type === "gold") { prev.gold += t.amount; prev.goldCount++; }
    else { prev.troops += t.amount; prev.troopsCount++; }
    prev.totalCount++;
    prev.total = prev.gold + prev.troops;
    prev.lastTs = Math.max(prev.lastTs, t.ts);
    grandTotal += t.amount;
    map.set(matchName, prev);
  }

  return [...map.entries()]
    .map(([name, data]) => ({ name, ...data, pct: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

export default function CIAView() {
  const ciaRenders = useRef(0);
  ciaRenders.current++;
  record("render", "CIAView", { n: ciaRenders.current });

  const me = useMyPlayer();
  const ciaState = useStore((s) => s.ciaState);
  // Non-reactive read — playersById is only used for name coloring (cosmetic).
  // CIAView re-renders from ciaState changes (new transfers), which is the right trigger.
  const playersById = useStore.getState().playersById;
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);
  const ciaWindowMs = useStore((s) => s.ciaWindowMs);
  const ciaFeedFilter = useStore((s) => s.ciaFeedFilter);
  const setCIAWindow = useStore((s) => s.setCIAWindow);
  const setCIAFeedFilter = useStore((s) => s.setCIAFeedFilter);

  const contentWidth = useContentWidth();

  const { transfers } = ciaState;
  const myName = me?.displayName || me?.name || "";

  const effectiveWindow = ciaWindowMs === 0 ? Date.now() : ciaWindowMs;

  // Rolling rates for my economy
  const myRates = useMemo(
    () => computeRollingRates(transfers, effectiveWindow, myName),
    [transfers, effectiveWindow, myName],
  );

  // Detailed aid lists with counts, timing, percentages
  const incoming = useMemo(
    () => buildAidList(transfers, myName, effectiveWindow, "incoming"),
    [transfers, myName, effectiveWindow],
  );

  const outgoing = useMemo(
    () => buildAidList(transfers, myName, effectiveWindow, "outgoing"),
    [transfers, myName, effectiveWindow],
  );

  // Dossier summary stats
  const dossier = useMemo(() => {
    const uniqueSupporters = incoming.length;
    const uniqueRecipients = outgoing.length;
    const totalInCount = incoming.reduce((s, e) => s + e.totalCount, 0);
    const totalOutCount = outgoing.reduce((s, e) => s + e.totalCount, 0);
    return {
      totalGoldIn: myRates.goldIn,
      totalTroopsIn: myRates.troopsIn,
      totalGoldOut: myRates.goldOut,
      totalTroopsOut: myRates.troopsOut,
      uniqueSupporters,
      uniqueRecipients,
      totalInCount,
      totalOutCount,
    };
  }, [myRates, incoming, outgoing]);

  // Relationships (for threat board)
  const relationships = useMemo(
    () => computeRelationships(transfers, ciaState.playerTotals, playersById, myTeam, myAllies, effectiveWindow),
    [transfers, ciaState.playerTotals, playersById, myTeam, myAllies, effectiveWindow],
  );

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

  const windowLabel = WINDOW_OPTIONS.find((w) => w.ms === ciaWindowMs)?.label ?? "5m";
  const topIncoming = incoming.length > 0 ? incoming[0].total : 1;
  const topOutgoing = outgoing.length > 0 ? outgoing[0].total : 1;

  return (
    <div>
      {/* Controls — at the top for quick window switching */}
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
            Clear
          </button>
        </div>
      </Section>

      {/* Section 1: My Dossier — the narcissist dashboard */}
      <Section title="My Dossier">
        <div className="grid grid-cols-2 gap-1">
          <StatCard
            label="Gold Received"
            value={short(dossier.totalGoldIn)}
            color="text-hammer-gold"
            sub={dossier.totalInCount > 0 ? `${comma(dossier.totalInCount)} sends` : "none"}
          />
          <StatCard
            label="Troops Received"
            value={short(dossier.totalTroopsIn)}
            color="text-hammer-blue"
            sub={`from ${dossier.uniqueSupporters} player${dossier.uniqueSupporters !== 1 ? "s" : ""}`}
          />
          <StatCard
            label="Gold Sent"
            value={short(dossier.totalGoldOut)}
            color="text-hammer-gold"
            sub={dossier.totalOutCount > 0 ? `${comma(dossier.totalOutCount)} sends` : "none"}
          />
          <StatCard
            label="Troops Sent"
            value={short(dossier.totalTroopsOut)}
            color="text-hammer-blue"
            sub={`to ${dossier.uniqueRecipients} player${dossier.uniqueRecipients !== 1 ? "s" : ""}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <StatCard
            label="Net Gold"
            value={short(dossier.totalGoldIn - dossier.totalGoldOut)}
            color={dossier.totalGoldIn - dossier.totalGoldOut >= 0 ? "text-hammer-green" : "text-hammer-red"}
            sub={dossier.totalGoldIn - dossier.totalGoldOut >= 0 ? "surplus" : "deficit"}
          />
          <StatCard
            label="Net Troops"
            value={short(dossier.totalTroopsIn - dossier.totalTroopsOut)}
            color={dossier.totalTroopsIn - dossier.totalTroopsOut >= 0 ? "text-hammer-green" : "text-hammer-red"}
            sub={dossier.totalTroopsIn - dossier.totalTroopsOut >= 0 ? "surplus" : "deficit"}
          />
        </div>
      </Section>

      {/* Section 2: Incoming Aid — who is helping ME */}
      <Section title="Incoming Aid" count={incoming.length}>
        {incoming.length === 0 ? (
          <div className="text-hammer-dim text-2xs">No one has sent you anything yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {incoming.map((f, i) => (
              <div key={f.name} className="bg-hammer-raised rounded px-2 py-1 border border-hammer-border-subtle">
                {/* Row 1: Rank + Name + badges + time */}
                <div className="flex items-center justify-between mb-0_5">
                  <div className="flex items-center gap-1 truncate mr-2">
                    <span className="text-2xs text-hammer-dim w-3 shrink-0 text-right">{i + 1}.</span>
                    <PretextText text={f.name} size="2xs" weight="medium" maxWidth={contentWidth * 0.35} className={nameColor(f.name, playersById, myTeam, myAllies)} as="span" />
                    {i === 0 && f.pct >= 25 && <Badge label="TOP" color="gold" />}
                    {f.pct >= 50 && <Badge label={`${f.pct.toFixed(0)}%`} color="purple" />}
                  </div>
                  <span className="text-2xs text-hammer-dim shrink-0">{timeAgo(f.lastTs, " ago")}</span>
                </div>
                {/* Row 2: Gold + Troops breakdown with send counts */}
                <div className="flex items-center gap-3 text-2xs mb-0_5">
                  {f.gold > 0 && (
                    <span className="text-hammer-gold">
                      {short(f.gold)}g <span className="text-hammer-dim">({f.goldCount}x)</span>
                    </span>
                  )}
                  {f.troops > 0 && (
                    <span className="text-hammer-blue">
                      {short(f.troops)}t <span className="text-hammer-dim">({f.troopsCount}x)</span>
                    </span>
                  )}
                  <span className="ml-auto text-hammer-muted">{short(f.total)} total</span>
                </div>
                {/* Row 3: Percent bar — share relative to top feeder */}
                <PercentBar value={f.total} max={topIncoming} color="bg-hammer-green" />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section 3: Outgoing Aid — who I'm helping */}
      <Section title="Outgoing Aid" count={outgoing.length}>
        {outgoing.length === 0 ? (
          <div className="text-hammer-dim text-2xs">You haven't sent anything yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {outgoing.map((s, i) => (
              <div key={s.name} className="bg-hammer-raised rounded px-2 py-1 border border-hammer-border-subtle">
                <div className="flex items-center justify-between mb-0_5">
                  <div className="flex items-center gap-1 truncate mr-2">
                    <span className="text-2xs text-hammer-dim w-3 shrink-0 text-right">{i + 1}.</span>
                    <PretextText text={s.name} size="2xs" weight="medium" maxWidth={contentWidth * 0.35} className={nameColor(s.name, playersById, myTeam, myAllies)} as="span" />
                    {i === 0 && s.pct >= 25 && <Badge label="TOP" color="cyan" />}
                  </div>
                  <span className="text-2xs text-hammer-dim shrink-0">{timeAgo(s.lastTs, " ago")}</span>
                </div>
                <div className="flex items-center gap-3 text-2xs mb-0_5">
                  {s.gold > 0 && (
                    <span className="text-hammer-gold">
                      {short(s.gold)}g <span className="text-hammer-dim">({s.goldCount}x)</span>
                    </span>
                  )}
                  {s.troops > 0 && (
                    <span className="text-hammer-blue">
                      {short(s.troops)}t <span className="text-hammer-dim">({s.troopsCount}x)</span>
                    </span>
                  )}
                  <span className="ml-auto text-hammer-muted">{short(s.total)} total</span>
                </div>
                <PercentBar value={s.total} max={topOutgoing} color="bg-hammer-blue" />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section 4: Threat Board */}
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
                      <PretextText text={a.title} size="2xs" maxWidth={contentWidth * 0.7} className="text-hammer-text" />
                      <PretextText text={a.detail} size="2xs" maxWidth={contentWidth * 0.7} className="text-hammer-dim" />
                    </div>
                    <span className="text-hammer-dim ml-auto shrink-0">{timeAgo(a.ts)}</span>
                  </div>
                ))}
              </div>
            )}

            {feedingNonAlly.length > 0 && (
              <div className="mt-2">
                <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">
                  Cross-Team Transfers
                  <span className="ml-1 text-hammer-dim">({feedingNonAlly.length})</span>
                </div>
                <div className="flex flex-col gap-0_5">
                  {feedingNonAlly.slice(0, 8).map((r) => (
                    <div key={r.name} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0_5 border border-hammer-border-subtle text-2xs">
                      <PretextText text={r.name} size="2xs" maxWidth={contentWidth * 0.35} className={nameColor(r.name, playersById, myTeam, myAllies)} as="span" />
                      <span className="text-hammer-warn">{"\u2192"} {r.feedsNonAllyDetail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Section 5: Intelligence Feed */}
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
              const involvesMe = t.senderName === myName || t.receiverName === myName;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-1 text-2xs px-1 py-px rounded ${isLarge ? "bg-hammer-warn/5" : involvesMe ? "bg-hammer-green/5" : ""}`}
                >
                  <span className="text-hammer-dim w-4 shrink-0 text-right">{timeAgo(t.ts)}</span>
                  <div className={`w-1 h-1 rounded-full shrink-0 ${t.type === "gold" ? "bg-hammer-gold" : "bg-hammer-blue"}`} />
                  <PretextText text={t.senderName} size="2xs" maxWidth={contentWidth * 0.25} className={nameColor(t.senderName, playersById, myTeam, myAllies)} as="span" />
                  <span className="text-hammer-dim">{"\u2192"}</span>
                  <PretextText text={t.receiverName} size="2xs" maxWidth={contentWidth * 0.25} className={nameColor(t.receiverName, playersById, myTeam, myAllies)} as="span" />
                  <span className={`ml-auto shrink-0 ${t.type === "gold" ? "text-hammer-gold" : "text-hammer-blue"}`}>
                    {short(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 6: World Economy */}
      <Section title="World Economy">
        <div className="grid grid-cols-3 gap-1">
          <StatCard label="Gold Rate" value={short(worldEcon.goldRate)} color="text-hammer-gold" sub={`in ${windowLabel}`} cols={3} />
          <StatCard label="Troop Rate" value={short(worldEcon.troopRate)} color="text-hammer-blue" sub={`in ${windowLabel}`} cols={3} />
          <StatCard label="Active Flows" value={String(worldEcon.activeFlows)} color="text-hammer-green" cols={3} />
        </div>

        {topFlows.length > 0 && (
          <div className="mt-2">
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1">Top Flows</div>
            <div className="flex flex-col gap-0_5">
              {topFlows.slice(0, 10).map((flow, i) => (
                <div key={i} className="flex items-center gap-1 text-2xs">
                  <span className="text-hammer-dim w-3 text-right shrink-0">{i + 1}.</span>
                  <PretextText text={flow.sender} size="2xs" maxWidth={contentWidth * 0.25} className={nameColor(flow.sender, playersById, myTeam, myAllies)} as="span" />
                  <span className="text-hammer-dim">{"\u2192"}</span>
                  <PretextText text={flow.receiver} size="2xs" maxWidth={contentWidth * 0.25} className={nameColor(flow.receiver, playersById, myTeam, myAllies)} as="span" />
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
                      <PretextText text={p.name} size="2xs" maxWidth={contentWidth * 0.35} className={nameColor(p.name, playersById, myTeam, myAllies)} as="span" />
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
    </div>
  );
}
