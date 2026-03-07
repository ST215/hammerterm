import { useEffect } from "react";
import { useStore } from "@store/index";
import { short } from "@shared/utils";

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 5;

export default function DonationToast() {
  const toasts = useStore((s) => s.donationToasts);
  const dismiss = useStore((s) => s.dismissDonationToast);

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
  if (visible.length === 0) return null;

  return (
    <div
      className="fixed font-mono pointer-events-none"
      style={{
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
      }}
    >
      {visible.map((t) => {
        const isTroops = t.type === "troops";
        return (
          <div
            key={t.id}
            className={`bg-hammer-bg border px-4 py-2 text-base ${
              isTroops
                ? "border-hammer-blue"
                : "border-hammer-gold"
            }`}
            style={{
              borderRadius: 6,
              opacity: 0.95,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              minWidth: 200,
              textAlign: "center",
            }}
          >
            <span className="text-hammer-green font-bold">{t.donorName}</span>
            <span className="text-hammer-text"> sent you </span>
            <span className={`font-bold ${isTroops ? "text-hammer-blue" : "text-hammer-gold"}`}>
              {short(t.amount)}
            </span>
            <span className="text-hammer-text"> {t.type}</span>
          </div>
        );
      })}
    </div>
  );
}
