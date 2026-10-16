/**
 * StatusStrip — one-line panel-chrome footer, visible on every tab (overlay
 * panel + external window). Left: estimated wire-intent budget vs the
 * server's 150/min lockout (attacks count against the same pool as comms).
 * Right: the active paced comms batch with time-left and cancel.
 * Renders nothing when the wire is quiet and no batch is running.
 */
import { useStore } from "@store/index";
import { cancelAllPaced } from "@content/game/send";
import { durationLabel, estimateBatchMs, resolvePace } from "@shared/logic/pace";

const SERVER_PER_MIN = 150;
const CELLS = 8;

export default function StatusStrip() {
  const wireCount60 = useStore((s) => s.wireCount60);
  const batch = useStore((s) => s.commsActiveBatch);
  const paceMs = useStore((s) => s.commsPaceMs);
  const paceHuman = useStore((s) => s.commsPaceHuman);
  const setBatch = useStore((s) => s.setCommsActiveBatch);

  if (wireCount60 <= 0 && !batch) return null;

  const frac = Math.min(1, wireCount60 / SERVER_PER_MIN);
  const filled = Math.round(frac * CELLS);
  const meterColor =
    frac < 0.6
      ? "text-hammer-green"
      : frac < 0.85
        ? "text-hammer-gold"
        : "text-hammer-red";

  const pace = resolvePace(paceMs, paceHuman);
  // Every remaining send needs one gap (delayFirst=true counts n gaps for n sends).
  const remainingMs = batch
    ? estimateBatchMs(batch.total - batch.sent, { ...pace, delayFirst: true })
    : 0;

  const cancel = () => {
    cancelAllPaced();
    setBatch(null);
  };

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-0.5 border-t border-hammer-border bg-hammer-header text-2xs font-mono select-none">
      <span
        className={meterColor}
        title="Estimated intents on the wire in the last 60s — the server locks the whole client out at 150/min, and attack clicks count against the same pool as comms. Undercount: not every action is visible."
      >
        wire {"▮".repeat(filled)}
        {"░".repeat(CELLS - filled)} ~{wireCount60}/{SERVER_PER_MIN} min
      </span>
      {batch && (
        <span className="flex items-center gap-1.5 text-hammer-green">
          <span>
            {batch.label} → {batch.sent}/{batch.total}
          </span>
          {batch.sent < batch.total && (
            <span className="text-hammer-dim">· ~{durationLabel(remainingMs)} left ·</span>
          )}
          <button
            onClick={cancel}
            className="text-hammer-red hover:underline cursor-pointer bg-transparent border-none p-0 font-mono"
          >
            cancel
          </button>
        </span>
      )}
    </div>
  );
}
