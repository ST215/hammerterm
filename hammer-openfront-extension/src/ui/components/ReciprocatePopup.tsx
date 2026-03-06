import { useEffect, useCallback } from "react";
import { useStore } from "@store/index";
import { short, dTroops } from "@shared/utils";

const PCT_OPTIONS = [10, 25, 50, 75, 100] as const;

export default function ReciprocatePopup() {
  const notifications = useStore((s) => s.reciprocateNotifications);
  const dismissNotification = useStore((s) => s.dismissReciprocateNotification);
  const popupsEnabled = useStore((s) => s.reciprocatePopupsEnabled);
  const notifyDuration = useStore((s) => s.reciprocateNotifyDuration);

  // Auto-dismiss after duration
  useEffect(() => {
    if (!popupsEnabled || notifyDuration <= 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const n of notifications) {
      if (n.dismissed) continue;
      const elapsed = Date.now() - n.timestamp;
      const remaining = notifyDuration * 1000 - elapsed;
      if (remaining <= 0) {
        dismissNotification(n.id);
      } else {
        timers.push(setTimeout(() => dismissNotification(n.id), remaining));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [notifications, notifyDuration, popupsEnabled, dismissNotification]);

  const handleSend = useCallback(
    (donorId: string, pct: number, troops: number, gold: number) => {
      const troopAmt = Math.round(dTroops(troops) * (pct / 100));
      const goldAmt = Math.round(gold * (pct / 100));

      // Dispatch send commands via the game bridge
      const hammer = (window as any).__HAMMER__;
      if (hammer?.sendTroops && troopAmt > 0) {
        hammer.sendTroops(donorId, troopAmt);
      }
      if (hammer?.sendGold && goldAmt > 0) {
        hammer.sendGold(donorId, goldAmt);
      }
    },
    [],
  );

  if (!popupsEnabled) return null;

  const visible = notifications.filter((n) => !n.dismissed).slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <div
      className="fixed font-mono"
      style={{
        top: 120,
        right: 20,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 320,
      }}
    >
      {visible.map((n) => {
        const hasTroops = n.troops > 0;
        const hasGold = n.gold > 0;
        const troopDisplay = dTroops(n.troops);
        const parts: string[] = [];
        if (hasTroops) parts.push(`${short(troopDisplay)} troops`);
        if (hasGold) parts.push(`${short(n.gold)} gold`);

        return (
          <div
            key={n.id}
            className="bg-hammer-bg border border-hammer-border text-hammer-text text-xs p-2"
            style={{ borderRadius: 4 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-hammer-green font-bold">
                {n.donorName}
              </span>
              <button
                className="text-hammer-muted hover:text-hammer-red cursor-pointer bg-transparent border-none font-mono text-xs"
                onClick={() => dismissNotification(n.id)}
                title="Dismiss"
              >
                X
              </button>
            </div>
            <div className="text-hammer-text mb-1">
              sent you {parts.join(" + ")}
            </div>

            {/* Percentage buttons */}
            <div className="flex gap-1 flex-wrap">
              {PCT_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  className="px-1.5 py-0.5 text-2xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green cursor-pointer"
                  style={{ borderRadius: 2 }}
                  onClick={() => handleSend(n.donorId, pct, n.troops, n.gold)}
                  title={formatPctTooltip(pct, troopDisplay, n.gold, hasTroops, hasGold)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatPctTooltip(
  pct: number,
  troops: number,
  gold: number,
  hasTroops: boolean,
  hasGold: boolean,
): string {
  const parts: string[] = [];
  if (hasTroops) parts.push(`${short(Math.round(troops * (pct / 100)))} troops`);
  if (hasGold) parts.push(`${short(Math.round(gold * (pct / 100)))} gold`);
  return `Send back ${pct}%: ${parts.join(" + ")}`;
}
