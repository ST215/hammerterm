import { useEffect, useCallback } from "react";
import { useStore } from "@store/index";
import { short } from "@shared/utils";
import { handleQuickReciprocate } from "@content/automation/reciprocate-engine";

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
    (n: (typeof notifications)[0], pct: number) => {
      // Cross-resource: received troops → send gold, received gold → send troops
      const sendType = n.troops > 0 ? "gold" : "troops";
      handleQuickReciprocate(n.donorId, n.donorName, pct, n.id, sendType);
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
        top: 80,
        right: 20,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 380,
      }}
    >
      {visible.map((n) => {
        const hasTroops = n.troops > 0;
        const hasGold = n.gold > 0;
        // Cross-resource: show what you'll send back (opposite resource)
        const sendType = hasTroops ? "gold" : "troops";
        const sendLabel = hasTroops ? "Send Gold Back" : "Send Troops Back";

        return (
          <div
            key={n.id}
            className="bg-hammer-bg border border-hammer-border text-hammer-text animate-slide-in"
            style={{
              borderRadius: 6,
              borderLeft: "4px solid var(--color-hammer-green)",
              padding: "12px 14px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-hammer-green font-bold text-base">
                {n.donorName}
              </span>
              <button
                className="text-hammer-muted hover:text-hammer-red cursor-pointer bg-transparent border-none font-mono text-sm px-1"
                onClick={() => dismissNotification(n.id)}
                title="Dismiss"
              >
                X
              </button>
            </div>

            {/* What they sent */}
            <div className="text-sm mb-3">
              <span className="text-hammer-text">sent you </span>
              {hasTroops && (
                <span className="text-hammer-blue font-bold">{short(n.troops)} troops</span>
              )}
              {hasTroops && hasGold && <span className="text-hammer-muted"> + </span>}
              {hasGold && (
                <span className="text-hammer-gold font-bold">{short(n.gold)} gold</span>
              )}
            </div>

            {/* Send type label */}
            <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-1.5">
              {sendLabel}
            </div>

            {/* Percentage buttons */}
            <div className="flex gap-2 flex-wrap">
              {PCT_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  className="px-3 py-1.5 text-sm font-mono font-bold border border-hammer-border bg-hammer-surface text-hammer-text hover:text-hammer-green hover:border-hammer-green cursor-pointer transition-colors"
                  style={{ borderRadius: 4, minWidth: 48 }}
                  onClick={() => handleSend(n, pct)}
                  title={`Send ${pct}% of your ${sendType}`}
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
