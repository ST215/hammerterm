import { useEffect } from "react";
import { useStore } from "@store/index";
import { short } from "@shared/utils";
import { notifPositionStyle } from "@shared/notif-position";

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 5;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function DonationToast() {
  const toasts = useStore((s) => s.donationToasts);
  const history = useStore((s) => s.donationHistory);
  const dismiss = useStore((s) => s.dismissDonationToast);
  const toastScale = useStore((s) => s.toastScale);
  const position = useStore((s) => s.donationPosition);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of toasts) {
      const remaining = AUTO_DISMISS_MS - (Date.now() - t.timestamp);
      if (remaining <= 0) {
        dismiss(t.id);
      } else {
        timers.push(setTimeout(() => dismiss(t.id), remaining));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const visible = toasts.slice(-MAX_VISIBLE);
  const hiddenCount = toasts.length - visible.length;
  if (visible.length === 0) return null;

  return (
    <div
      className="font-mono pointer-events-none"
      style={{
        ...notifPositionStyle(position, toastScale),
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
      }}
    >
      {visible.map((t) => {
        const isTroops = t.type === "troops";
        const isOut = t.direction === "out";
        const playerName = t.playerName || t.donorName || "?";
        const stats = history[playerName];

        if (isOut) {
          return (
            <div
              key={t.id}
              className={`bg-hammer-bg border px-3 py-1.5 ${isTroops ? "border-hammer-blue/40" : "border-hammer-gold/40"}`}
              style={{
                borderRadius: 6,
                opacity: 0.75,
                boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
                minWidth: 200,
                textAlign: "center",
              }}
            >
              <span className="text-hammer-dim text-sm">you </span>
              <span className="text-hammer-muted text-sm">→ </span>
              <span className="text-hammer-text text-sm font-bold">{playerName}</span>
              <span className="text-hammer-dim text-sm"> </span>
              <span className={`text-sm font-bold ${isTroops ? "text-hammer-blue" : "text-hammer-gold"}`}>
                {short(t.amount)}
              </span>
              <span className="text-hammer-dim text-sm"> {t.type}</span>
            </div>
          );
        }

        // Inbound — enriched card
        const count = stats?.receivedCount ?? 1;
        const totalTroops = stats?.troopsReceived ?? (isTroops ? t.amount : 0);
        const totalGold = stats?.goldReceived ?? (!isTroops ? t.amount : 0);
        const youSentTroops = stats?.troopsSent ?? 0;
        const youSentGold = stats?.goldSent ?? 0;

        return (
          <div
            key={t.id}
            className={`bg-hammer-bg border ${isTroops ? "border-hammer-blue" : "border-hammer-gold"}`}
            style={{
              borderRadius: 6,
              opacity: 0.95,
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              minWidth: 240,
              maxWidth: 320,
              padding: "10px 14px",
            }}
          >
            {/* Player name + nth time */}
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-hammer-green font-bold text-base leading-none">{playerName}</span>
              <span className="text-hammer-dim text-2xs ml-2">{ordinal(count)} time</span>
            </div>

            {/* Current send */}
            <div className="text-sm mb-2">
              <span className="text-hammer-muted">→ you </span>
              <span className={`font-bold ${isTroops ? "text-hammer-blue" : "text-hammer-gold"}`}>
                {short(t.amount)} {t.type}
              </span>
            </div>

            {/* Cumulative stats */}
            <div className="flex gap-4 text-2xs border-t border-hammer-border pt-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-hammer-dim uppercase tracking-wider">They sent total</span>
                {totalTroops > 0 && (
                  <span className="text-hammer-blue">{short(totalTroops)} troops</span>
                )}
                {totalGold > 0 && (
                  <span className="text-hammer-gold">{short(totalGold)} gold</span>
                )}
              </div>
              {(youSentTroops > 0 || youSentGold > 0) && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-hammer-dim uppercase tracking-wider">You sent total</span>
                  {youSentTroops > 0 && (
                    <span className="text-hammer-blue">{short(youSentTroops)} troops</span>
                  )}
                  {youSentGold > 0 && (
                    <span className="text-hammer-gold">{short(youSentGold)} gold</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <div
          className="text-2xs text-hammer-dim border border-hammer-border px-2 py-0.5"
          style={{ borderRadius: 4, background: "var(--color-hammer-bg)", opacity: 0.85 }}
        >
          +{hiddenCount} more
        </div>
      )}
    </div>
  );
}
