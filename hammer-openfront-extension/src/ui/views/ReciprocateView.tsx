import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, dTroops, num } from "@shared/utils";
import { handleQuickReciprocate } from "@content/automation/reciprocate-engine";
import { getPhase, getSelfMod } from "@shared/logic/palantir";
import { Section, StatCard, PresetButton, Badge, PercentBar } from "@ui/components/ds";
import type { PalantirDecision } from "@store/slices/reciprocate";

const PCT_OPTIONS = [10, 25, 50, 75, 100] as const;

const PHASE_CONFIG = {
  conserving: { label: "CONSERVING", color: "gold" as const, mod: 0.6 },
  growing: { label: "GROWING", color: "green" as const, mod: 1.2 },
  dominant: { label: "DOMINANT", color: "purple" as const, mod: 1.5 },
} as const;

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function loyaltyDots(sendCount: number): string {
  const filled = Math.min(sendCount, 10);
  return "\u25CF".repeat(filled) + "\u25CB".repeat(10 - filled);
}

function PalantirDecisionCard({ p }: { p: PalantirDecision }) {
  const phaseCfg = PHASE_CONFIG[p.phase];
  const sacPct = Math.round(p.sacrificeRatio * 100);

  return (
    <div className="flex flex-col gap-1 mt-1.5">
      {/* Sacrifice bar */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-hammer-muted w-14">Sacrifice</span>
        <div className="flex-1">
          <PercentBar value={sacPct} max={100} color={sacPct > 50 ? "bg-hammer-green" : sacPct > 10 ? "bg-hammer-gold" : "bg-hammer-red"} />
        </div>
        <span className="text-2xs text-hammer-text w-20 text-right">
          {sacPct}% ({short(p.donorTroops > 0 ? p.donorTroops : 0)})
        </span>
      </div>

      {/* Loyalty */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-hammer-muted w-14">Loyalty</span>
        <span className="text-2xs text-hammer-gold tracking-tighter">{loyaltyDots(p.sendCount)}</span>
        <span className="text-2xs text-hammer-dim ml-auto">{p.loyaltyMultiplier.toFixed(2)}x ({p.sendCount}x)</span>
      </div>

      {/* Team */}
      {p.teammateMultiplier > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-2xs text-hammer-muted w-14">Team</span>
          <Badge label="TM" color="blue" />
          <span className="text-2xs text-hammer-dim ml-auto">{p.teammateMultiplier}x</span>
        </div>
      )}

      {/* Phase */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-hammer-muted w-14">Phase</span>
        <Badge label={phaseCfg.label} color={phaseCfg.color} />
        <span className="text-2xs text-hammer-dim ml-auto">{p.selfMod}x</span>
      </div>

      {/* Calculation flow */}
      <div className="text-2xs text-hammer-dim border-t border-hammer-border-subtle pt-1 mt-0.5">
        {short(p.rawAmount)} raw → {short(p.flooredAmount)} floor → {short(p.cappedAmount)} cap
      </div>
    </div>
  );
}

export default function ReciprocateView() {
  const enabled = useStore((s) => s.reciprocateEnabled);
  const toggleEnabled = useStore((s) => s.toggleReciprocateEnabled);
  const mode = useStore((s) => s.reciprocateMode);
  const setMode = useStore((s) => s.setReciprocateMode);
  const autoPct = useStore((s) => s.reciprocateAutoPct);
  const setAutoPct = useStore((s) => s.setReciprocateAutoPct);
  const onTroops = useStore((s) => s.reciprocateOnTroops);
  const toggleOnTroops = useStore((s) => s.toggleReciprocateOnTroops);
  const onGold = useStore((s) => s.reciprocateOnGold);
  const toggleOnGold = useStore((s) => s.toggleReciprocateOnGold);
  const popupsEnabled = useStore((s) => s.reciprocatePopupsEnabled);
  const togglePopups = useStore((s) => s.toggleReciprocatePopupsEnabled);
  const notifyDuration = useStore((s) => s.reciprocateNotifyDuration);
  const setNotifyDuration = useStore((s) => s.setReciprocateNotifyDuration);
  const history = useStore((s) => s.reciprocateHistory);
  const pending = useStore((s) => s.reciprocatePending);
  const inbound = useStore((s) => s.inbound);
  const feedIn = useStore((s) => s.feedIn);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);
  const playersById = useStore((s) => s.playersById);

  const me = useMyPlayer();
  const myTroops = me ? dTroops(me.troops) : 0;
  const myGold = me ? num(me.gold) : 0;
  const myRawTroops = me ? Number(me.troops || 0) : 0;

  // Current power phase for Palantir status display
  const phase = getPhase(myRawTroops);
  const phaseCfg = PHASE_CONFIG[phase];

  // Build sent-back totals from reciprocate history
  const sentBackByDonor = new Map<string, { troops: number; gold: number }>();
  for (const entry of history) {
    const existing = sentBackByDonor.get(entry.donorId) || { troops: 0, gold: 0 };
    if (entry.troopsSent) existing.troops += entry.troopsSent;
    if (entry.goldSent) existing.gold += entry.goldSent;
    sentBackByDonor.set(entry.donorId, existing);
  }

  // Build donor list from inbound
  const donors = Array.from(inbound.entries())
    .map(([id, rec]) => {
      const lastFeed = feedIn.find((f) => f.name === rec.displayName);
      const lastTs = lastFeed?.ts ?? rec.last?.getTime() ?? 0;
      const sentBack = sentBackByDonor.get(id);
      return { id, name: rec.displayName, rec, lastTs, sentBack };
    })
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 15);

  function getTag(playerId: string): { label: string; color: string } | null {
    const p = playersById.get(playerId);
    if (!p) return null;
    if (p.team != null && myTeam != null && p.team === myTeam)
      return { label: "TM", color: "text-hammer-blue" };
    if (p.smallID != null && myAllies.has(p.smallID))
      return { label: "AL", color: "text-hammer-green" };
    return null;
  }

  // Cross-resource: figure out what to send back based on what was received
  function handleManualSend(donorId: string, donorName: string, pct: number, receivedType: "troops" | "gold") {
    const sendType = receivedType === "troops" ? "gold" : "troops";
    handleQuickReciprocate(donorId, donorName, pct, null, sendType);
  }

  // Palantir history entries (most recent with decision data)
  const palantirHistory = history.filter((e) => e.palantir).slice(0, 10);

  const recentHistory = history.slice(0, 15);

  return (
    <div>
      {/* Settings */}
      <Section title="Settings">
        {/* Enable / Mode row */}
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={toggleEnabled}
            className={`px-2 py-0.5 text-xs font-mono font-bold border-none cursor-pointer rounded ${
              enabled
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-hammer-red/20 text-hammer-red"
            }`}
          >
            {enabled ? "ENABLED" : "DISABLED"}
          </button>
          <div className="flex gap-1 ml-auto">
            <PresetButton label="Manual" active={mode === "manual"} onClick={() => setMode("manual")} />
            <PresetButton label="Auto" active={mode === "auto"} onClick={() => setMode("auto")} />
            <PresetButton label="Palantir" active={mode === "palantir"} onClick={() => setMode("palantir")} />
          </div>
        </div>

        {/* Trigger options */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-2xs text-hammer-muted">Trigger on:</span>
          <button
            onClick={toggleOnTroops}
            className={`px-1.5 py-0.5 text-2xs font-mono border-none cursor-pointer rounded ${
              onTroops ? "bg-hammer-blue/20 text-hammer-blue" : "bg-transparent text-hammer-dim"
            }`}
          >
            Troops {onTroops ? "ON" : "OFF"}
          </button>
          <button
            onClick={toggleOnGold}
            className={`px-1.5 py-0.5 text-2xs font-mono border-none cursor-pointer rounded ${
              onGold ? "bg-hammer-gold/20 text-hammer-gold" : "bg-transparent text-hammer-dim"
            }`}
          >
            Gold {onGold ? "ON" : "OFF"}
          </button>
        </div>

        {/* Auto percentage */}
        {mode === "auto" && (
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-2xs text-hammer-muted">Auto %:</span>
            {PCT_OPTIONS.map((pct) => (
              <PresetButton
                key={pct}
                label={`${pct}%`}
                active={autoPct === pct}
                onClick={() => setAutoPct(pct)}
              />
            ))}
          </div>
        )}

        {/* Manual mode options */}
        {mode === "manual" && (
          <div className="flex items-center gap-2 mb-1.5">
            <button
              onClick={togglePopups}
              className={`px-1.5 py-0.5 text-2xs font-mono border-none cursor-pointer rounded ${
                popupsEnabled ? "bg-hammer-green/20 text-hammer-green" : "bg-transparent text-hammer-dim"
              }`}
            >
              Popups {popupsEnabled ? "ON" : "OFF"}
            </button>
            <span className="text-2xs text-hammer-muted">Duration:</span>
            <input
              type="number"
              min={5}
              max={300}
              value={notifyDuration}
              onChange={(e) => setNotifyDuration(Math.max(5, parseInt(e.target.value) || 30))}
              className="w-10 bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-1 py-0.5 font-mono rounded"
            />
            <span className="text-2xs text-hammer-dim">sec</span>
          </div>
        )}

        {/* Palantir explanation */}
        {mode === "palantir" && (
          <div className="text-2xs text-hammer-dim mt-1 border-t border-hammer-border-subtle pt-1">
            Palantir analyzes each donation's sacrifice level, donor loyalty,
            team relationship, and your power phase to calculate optimal reciprocation.
          </div>
        )}

        {/* Cross-resource explanation */}
        {mode !== "palantir" && (
          <div className="text-2xs text-hammer-dim mt-1 border-t border-hammer-border-subtle pt-1">
            Cross-resource: receive troops → send gold back, receive gold → send troops back
          </div>
        )}
      </Section>

      {/* Resources + Palantir Phase */}
      <Section title={mode === "palantir" ? "Status" : "My Resources"}>
        <div className="grid grid-cols-2 gap-1">
          <StatCard label="Troops" value={short(myTroops)} color="text-hammer-blue" />
          <StatCard label="Gold" value={short(myGold)} color="text-hammer-gold" />
        </div>
        {mode === "palantir" && (
          <div className="flex items-center gap-2 mt-1.5">
            <Badge label={phaseCfg.label} color={phaseCfg.color} />
            <span className="text-2xs text-hammer-text">{short(myRawTroops)} troops</span>
            <span className="text-2xs text-hammer-dim ml-auto">{getSelfMod(phase)}x generosity</span>
          </div>
        )}
      </Section>

      {/* Pending Queue (auto/palantir mode) */}
      {pending.length > 0 && (
        <Section title="Queue" count={pending.length}>
          <div className="flex flex-col gap-0.5">
            {pending.map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-hammer-raised rounded px-2 py-0.5 border border-hammer-border-subtle text-2xs">
                <span className="text-hammer-text">{item.donorName}</span>
                <div className="flex items-center gap-2">
                  <span className={item.receivedType === "troops" ? "text-hammer-blue" : "text-hammer-gold"}>
                    {short(item.amountReceived)} {item.receivedType}
                  </span>
                  <span className="text-hammer-dim">{timeAgo(item.addedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Palantir Decision Feed */}
      {mode === "palantir" && (
        <Section title="Palantir Decisions" count={palantirHistory.length}>
          {palantirHistory.length === 0 ? (
            <div className="text-hammer-dim text-2xs">
              No Palantir decisions yet. Donations will appear here with full formula breakdowns.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {palantirHistory.map((entry, i) => {
                const tag = getTag(entry.donorId);
                const p = entry.palantir!;
                const sentLabel = entry.goldSent ? `${short(entry.goldSent)} gold` : entry.troopsSent ? `${short(entry.troopsSent)} troops` : "";

                return (
                  <div key={i} className="bg-hammer-raised rounded border border-hammer-border-subtle p-2">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-hammer-text font-bold">{entry.donorName}</span>
                        {tag && <span className={`text-2xs ${tag.color}`}>[{tag.label}]</span>}
                      </div>
                      <span className="text-2xs text-hammer-dim">{timeAgo(entry.timestamp)}</span>
                    </div>

                    {/* Result line */}
                    <div className="flex items-center gap-1 text-2xs mb-0.5">
                      <span className="text-hammer-green font-bold">→ Sent {sentLabel}</span>
                      {p.cappedAmount < p.flooredAmount && (
                        <span className="text-hammer-warn">(capped)</span>
                      )}
                      {p.flooredAmount > p.rawAmount && (
                        <span className="text-hammer-gold">(floored)</span>
                      )}
                    </div>

                    {/* Decision breakdown */}
                    <PalantirDecisionCard p={p} />
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* Recent Donors — manual send buttons (non-palantir modes) */}
      {mode !== "palantir" && (
        <Section title="Recent Donors" count={donors.length}>
          {donors.length === 0 ? (
            <div className="text-hammer-dim text-2xs">No donations received yet.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {donors.map(({ id, name, rec, lastTs, sentBack }) => {
                const tag = getTag(id);
                const lastReceivedType: "troops" | "gold" = rec.troops > rec.gold ? "troops" : "gold";
                const sendBackType = lastReceivedType === "troops" ? "gold" : "troops";
                const sendBackResource = sendBackType === "troops" ? myTroops : myGold;

                return (
                  <div key={id} className="bg-hammer-raised rounded border border-hammer-border-subtle p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-hammer-text font-bold">{name}</span>
                        {tag && <span className={`text-2xs ${tag.color}`}>[{tag.label}]</span>}
                      </div>
                      {lastTs > 0 && <span className="text-2xs text-hammer-dim">{timeAgo(lastTs)}</span>}
                    </div>

                    <div className="flex gap-3 text-2xs mb-1.5">
                      {rec.troops > 0 && (
                        <span className="text-hammer-blue">{comma(rec.troops)} troops ({rec.troopsSends}x)</span>
                      )}
                      {rec.gold > 0 && (
                        <span className="text-hammer-gold">{comma(rec.gold)} gold ({rec.goldSends}x)</span>
                      )}
                    </div>

                    {sentBack && (sentBack.troops > 0 || sentBack.gold > 0) && (
                      <div className="flex gap-3 text-2xs mb-1.5">
                        <span className="text-hammer-dim">Sent back:</span>
                        {sentBack.troops > 0 && (
                          <span className="text-hammer-blue">{comma(sentBack.troops)} troops</span>
                        )}
                        {sentBack.gold > 0 && (
                          <span className="text-hammer-gold">{comma(sentBack.gold)} gold</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <span className="text-2xs text-hammer-dim mr-1">
                        Send {sendBackType}:
                      </span>
                      {PCT_OPTIONS.map((pct) => {
                        const amt = Math.floor((sendBackResource * pct) / 100);
                        return (
                          <button
                            key={pct}
                            onClick={() => handleManualSend(id, name, pct, lastReceivedType)}
                            className={`px-1.5 py-0.5 text-2xs font-mono border border-hammer-border bg-hammer-bg cursor-pointer hover:border-hammer-green hover:text-hammer-green transition-colors rounded ${
                              sendBackType === "troops" ? "text-hammer-blue" : "text-hammer-gold"
                            }`}
                            title={`Send ${pct}% of your ${sendBackType} (${comma(amt)})`}
                          >
                            {pct}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* History */}
      <Section title="History" count={recentHistory.length}>
        {recentHistory.length === 0 ? (
          <div className="text-hammer-dim text-2xs">No reciprocations yet.</div>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              {recentHistory.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-2xs bg-hammer-raised rounded px-2 py-0.5 border border-hammer-border-subtle">
                  <div className="flex items-center gap-1.5">
                    <span className="text-hammer-dim">{timeAgo(entry.timestamp)}</span>
                    <span className="text-hammer-text">{entry.donorName}</span>
                    <span className={
                      entry.mode === "palantir" ? "text-hammer-purple" :
                      entry.mode === "auto" ? "text-hammer-green" : "text-hammer-blue"
                    }>
                      [{entry.mode}]
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {entry.troopsSent != null && entry.troopsSent > 0 && (
                      <span className="text-hammer-blue">{short(entry.troopsSent)}t</span>
                    )}
                    {entry.goldSent != null && entry.goldSent > 0 && (
                      <span className="text-hammer-gold">{short(entry.goldSent)}g</span>
                    )}
                    {entry.palantir ? (
                      <span className="text-hammer-dim">{Math.round(entry.palantir.sacrificeRatio * 100)}% sac</span>
                    ) : (
                      <span className="text-hammer-dim">{entry.percentage}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {history.length > 15 && (
              <div className="text-2xs text-hammer-dim mt-1">
                Showing 15 of {history.length}
              </div>
            )}
            <button
              onClick={() => useStore.setState({ reciprocateHistory: [] })}
              className="mt-1 px-2 py-0.5 text-2xs border border-hammer-red/40 bg-hammer-red/10 text-hammer-red rounded cursor-pointer hover:bg-hammer-red/20 transition-colors"
            >
              Clear History
            </button>
          </>
        )}
      </Section>
    </div>
  );
}
