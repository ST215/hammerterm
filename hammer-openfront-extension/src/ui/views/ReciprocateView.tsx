import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { fullNum, short, comma, fmtDuration, num } from "@shared/utils";
import { asSendGold, asSendTroops } from "@content/game/send";

const PCT_OPTIONS = [10, 25, 50, 75, 100] as const;

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
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
  const addHistory = useStore((s) => s.addReciprocateHistory);

  const inbound = useStore((s) => s.inbound);
  const feedIn = useStore((s) => s.feedIn);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);
  const playersById = useStore((s) => s.playersById);

  const me = useMyPlayer();
  const teammates = useTeammates();
  const allies = useAllies();

  const myGold = me ? num(me.gold) : 0;

  // Build donor list from inbound Map, enriched with feedIn timestamps
  const donors = Array.from(inbound.entries())
    .map(([name, rec]) => {
      const lastFeed = feedIn.find((f) => f.name === name);
      const lastTs = lastFeed?.ts ?? rec.last?.getTime() ?? 0;
      return { name, rec, lastTs };
    })
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 10);

  // Determine tag for a donor name
  function getPlayerTag(name: string): { label: string; color: string } | null {
    for (const p of playersById.values()) {
      const pName = p.displayName || p.name || "";
      if (pName === name) {
        if (p.team != null && myTeam != null && p.team === myTeam) {
          return { label: "Teammate", color: "text-hammer-blue" };
        }
        if (p.smallID != null && myAllies.has(p.smallID)) {
          return { label: "Ally", color: "text-hammer-green" };
        }
        return null;
      }
    }
    return null;
  }

  function handleSendGold(donorName: string, pct: number) {
    const amount = Math.floor((myGold * pct) / 100);
    if (amount <= 0) return;
    // Find player ID by name
    for (const p of playersById.values()) {
      const pName = p.displayName || p.name || "";
      if (pName === donorName) {
        const ok = asSendGold(p.id, amount);
        if (ok) {
          addHistory({
            donorId: p.id,
            donorName,
            percentage: pct,
            timestamp: Date.now(),
            mode: "manual",
            goldSent: amount,
          });
        }
        return;
      }
    }
  }

  const recentHistory = history.slice(0, 10);

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Settings */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">Settings</div>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between">
          <span className="text-hammer-text text-xs">Reciprocate</span>
          <button
            onClick={toggleEnabled}
            className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
              enabled
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-hammer-red/20 text-hammer-red"
            }`}
          >
            {enabled ? "ON" : "OFF"}
          </button>
        </div>

        {/* Mode */}
        <div className="flex items-center justify-between">
          <span className="text-hammer-text text-xs">Mode</span>
          <div className="flex gap-4">
            <button
              onClick={() => setMode("manual")}
              className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
                mode === "manual"
                  ? "bg-hammer-blue/20 text-hammer-blue"
                  : "bg-transparent text-hammer-muted hover:text-hammer-text"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setMode("auto")}
              className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
                mode === "auto"
                  ? "bg-hammer-blue/20 text-hammer-blue"
                  : "bg-transparent text-hammer-muted hover:text-hammer-text"
              }`}
            >
              Auto
            </button>
          </div>
        </div>

        {/* Manual mode: notification duration */}
        {mode === "manual" && (
          <div className="flex items-center justify-between">
            <span className="text-hammer-text text-xs">Notify Duration (s)</span>
            <input
              type="number"
              min={5}
              max={300}
              value={notifyDuration}
              onChange={(e) => setNotifyDuration(Math.max(5, parseInt(e.target.value) || 30))}
              className="w-16 bg-hammer-bg border border-hammer-border text-hammer-text text-xs px-4 py-4 font-mono"
            />
          </div>
        )}

        {/* Auto mode: percentage */}
        {mode === "auto" && (
          <div className="flex items-center justify-between">
            <span className="text-hammer-text text-xs">Auto Percentage</span>
            <div className="flex gap-4">
              {PCT_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => setAutoPct(pct)}
                  className={`px-4 py-4 text-xs font-mono border-none cursor-pointer ${
                    autoPct === pct
                      ? "bg-hammer-gold/20 text-hammer-gold"
                      : "bg-transparent text-hammer-muted hover:text-hammer-text"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reciprocate on Troops */}
        <div className="flex items-center justify-between">
          <span className="text-hammer-text text-xs">Reciprocate on Troops</span>
          <button
            onClick={toggleOnTroops}
            className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
              onTroops
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-hammer-red/20 text-hammer-red"
            }`}
          >
            {onTroops ? "ON" : "OFF"}
          </button>
        </div>

        {/* Reciprocate on Gold */}
        <div className="flex items-center justify-between">
          <span className="text-hammer-text text-xs">Reciprocate on Gold</span>
          <button
            onClick={toggleOnGold}
            className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
              onGold
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-hammer-red/20 text-hammer-red"
            }`}
          >
            {onGold ? "ON" : "OFF"}
          </button>
        </div>

        {/* Show Popups */}
        <div className="flex items-center justify-between">
          <span className="text-hammer-text text-xs">Show Popups</span>
          <button
            onClick={togglePopups}
            className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
              popupsEnabled
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-hammer-red/20 text-hammer-red"
            }`}
          >
            {popupsEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Your Gold */}
      <div className="bg-hammer-card border border-hammer-border p-8">
        <span className="text-hammer-muted text-xs">Your Gold: </span>
        <span className="text-hammer-gold text-xs font-bold">{fullNum(myGold)}</span>
      </div>

      {/* Recent Donors */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">Recent Donors</div>

        {donors.length === 0 ? (
          <div className="text-hammer-muted text-xs">No donations received yet.</div>
        ) : (
          donors.map(({ name, rec, lastTs }) => {
            const tag = getPlayerTag(name);
            return (
              <div
                key={name}
                className="bg-hammer-bg border border-hammer-border p-8 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-hammer-text text-xs font-bold">{name}</span>
                    {tag && (
                      <span className={`text-xs ${tag.color}`}>[{tag.label}]</span>
                    )}
                  </div>
                  {lastTs > 0 && (
                    <span className="text-hammer-muted text-xs">{timeAgo(lastTs)}</span>
                  )}
                </div>

                <div className="flex gap-8 text-xs">
                  <span className="text-hammer-blue">
                    Troops: {comma(rec.troops)} ({rec.troopsSends})
                  </span>
                  <span className="text-hammer-gold">
                    Gold: {comma(rec.gold)} ({rec.goldSends})
                  </span>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  {PCT_OPTIONS.map((pct) => {
                    const goldAmt = Math.floor((myGold * pct) / 100);
                    return (
                      <button
                        key={pct}
                        onClick={() => handleSendGold(name, pct)}
                        className="px-4 py-4 text-xs font-mono border border-hammer-border bg-hammer-bg text-hammer-gold cursor-pointer hover:bg-hammer-gold/10"
                        title={`Send ${pct}% of your gold (${comma(goldAmt)})`}
                      >
                        {pct}% ({short(goldAmt)})
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Reciprocations */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="text-hammer-green text-sm font-bold">Recent Reciprocations</div>
          {recentHistory.length > 0 && (
            <button
              onClick={() => useStore.setState({ reciprocateHistory: [] })}
              className="px-8 py-4 text-xs font-mono border border-hammer-border bg-hammer-bg text-hammer-red cursor-pointer hover:bg-hammer-red/10"
            >
              Clear History
            </button>
          )}
        </div>

        {recentHistory.length === 0 ? (
          <div className="text-hammer-muted text-xs">No reciprocations yet.</div>
        ) : (
          recentHistory.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <span className="text-hammer-muted">{timeAgo(entry.timestamp)}</span>
                <span className="text-hammer-text">{entry.donorName}</span>
                <span className="text-hammer-gold">{entry.percentage}%</span>
              </div>
              <div className="flex gap-4">
                {entry.goldSent != null && entry.goldSent > 0 && (
                  <span className="text-hammer-gold">{short(entry.goldSent)} gold</span>
                )}
                {entry.troopsSent != null && entry.troopsSent > 0 && (
                  <span className="text-hammer-blue">{short(entry.troopsSent)} troops</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
