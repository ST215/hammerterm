import { useStore } from "@store/index";
import { useContentWidth } from "@ui/hooks/useContentWidth";
import { PretextText } from "@ui/components/ds";

function fmtDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return min > 0 ? `${min}m ${s}s` : `${s}s`;
}

export default function RecorderView() {
  const contentWidth = useContentWidth();
  const recorderOn = useStore((s) => s.recorderOn);
  const eventCount = useStore((s) => s.recorderEventCount);
  const toggleRecorder = useStore((s) => s.toggleRecorder);
  const exportRecorder = useStore((s) => s.exportRecorder);
  const recent = useStore((s) => s.recorderRecentEvents);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-hammer-text">
          Flight Recorder
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecorder}
            className={`px-3 py-1 text-xs font-medium border-none cursor-pointer transition-colors rounded ${
              recorderOn
                ? "bg-hammer-red/20 text-hammer-red"
                : "bg-hammer-green/20 text-hammer-green"
            }`}
          >
            {recorderOn ? "Stop" : "Record Match"}
          </button>
          <button
            onClick={exportRecorder}
            disabled={eventCount === 0}
            className="px-3 py-1 text-xs font-medium border-none cursor-pointer bg-hammer-blue/20 text-hammer-blue disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
          >
            Export
          </button>
        </div>
      </div>

      <div className="text-2xs text-hammer-muted">
        {recorderOn ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-hammer-red animate-pulse" />
              <span className="text-hammer-red font-bold">RECORDING</span>
            </div>
            <div className="text-hammer-text">
              {eventCount.toLocaleString()} events
              <span className="text-hammer-dim ml-1">
                + player snapshots every 10s + config snapshots every 30s
              </span>
            </div>
            <div className="text-hammer-dim">
              Capturing: automation decisions, player state progression, message flow,
              bridge metrics, rate limiter, WebSocket traffic, config changes
            </div>
          </div>
        ) : eventCount > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-hammer-green font-bold">
              {eventCount.toLocaleString()} events ready to export
            </span>
            <span className="text-hammer-dim">
              Export includes: event timeline, player progression snapshots, config history, bridge throughput metrics
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-hammer-text">Full-match diagnostic capture</span>
            <span className="text-hammer-dim">
              Records everything needed for offline debugging: all automation decisions with timing,
              player state every 10s (troops/gold/tiles for ALL players), config changes,
              bridge throughput, rate limiter state, message flow, and WebSocket traffic.
            </span>
            <span className="text-hammer-dim">
              Capacity: 200K events (~30 min match). Zero overhead when off.
            </span>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-2xs text-hammer-muted font-medium">
            Recent Events
          </div>
          {recent.map((e, i) => (
            <div
              key={i}
              className="text-2xs font-mono text-hammer-text/70 flex gap-2"
            >
              <span className="text-hammer-muted w-14 shrink-0 text-right">
                {(e.t / 1000).toFixed(1)}s
              </span>
              <span className="text-hammer-blue w-12 shrink-0">{e.cat}</span>
              <span className="text-hammer-green shrink-0">{e.evt}</span>
              {Object.keys(e.d).length > 0 && (
                <PretextText text={JSON.stringify(e.d)} size="2xs" maxWidth={contentWidth * 0.5} className="text-hammer-muted truncate" as="span" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
