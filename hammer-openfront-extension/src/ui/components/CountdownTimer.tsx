import { useState, useEffect, memo } from "react";
import { fmtSec } from "@shared/utils";

interface CountdownTimerProps {
  nextSend: number;
  cooldownSec: number;
  accentColor: string; // e.g. "hammer-blue" or "hammer-gold"
}

export const CountdownTimer = memo(function CountdownTimer({
  nextSend,
  cooldownSec,
  accentColor,
}: CountdownTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000));
  const elapsed = cooldownSec - remaining;
  const pct = cooldownSec > 0 ? Math.min(100, (elapsed / cooldownSec) * 100) : 100;

  return (
    <div className="flex items-center gap-1 min-w-20">
      <div className="flex-1 bg-hammer-bg rounded h-1 overflow-hidden">
        <div
          className={`h-full bg-${accentColor} rounded`}
          style={{ width: `${pct}%`, transition: "width 0.25s linear" }}
        />
      </div>
      <span className={`text-2xs font-mono shrink-0 ${remaining > 0 ? `text-${accentColor}` : "text-hammer-green"}`}>
        {remaining > 0 ? fmtSec(remaining) : "Ready"}
      </span>
    </div>
  );
});
