import { useEffect } from "react";
import { useStore } from "@store/index";
import { getRecentEvents } from "../../recorder";

export default function RecorderView() {
  const recorderOn = useStore((s) => s.recorderOn);
  const eventCount = useStore((s) => s.recorderEventCount);
  const toggleRecorder = useStore((s) => s.toggleRecorder);
  const exportRecorder = useStore((s) => s.exportRecorder);
  const refreshCount = useStore((s) => s.refreshRecorderCount);

  // Refresh event count every second while recording
  useEffect(() => {
    if (!recorderOn) return;
    const id = setInterval(refreshCount, 1000);
    return () => clearInterval(id);
  }, [recorderOn, refreshCount]);

  const recent = recorderOn ? getRecentEvents(20) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-hammer-text">
          Flight Recorder
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecorder}
            className={`px-3 py-1 text-xs font-medium border-none cursor-pointer transition-colors ${
              recorderOn
                ? "bg-hammer-red/20 text-hammer-red"
                : "bg-hammer-green/20 text-hammer-green"
            }`}
          >
            {recorderOn ? "Stop" : "Start"}
          </button>
          <button
            onClick={exportRecorder}
            disabled={eventCount === 0}
            className="px-3 py-1 text-xs font-medium border-none cursor-pointer bg-hammer-blue/20 text-hammer-blue disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      <div className="text-2xs text-hammer-muted">
        {recorderOn ? (
          <span className="text-hammer-red">
            Recording — {eventCount.toLocaleString()} events captured
          </span>
        ) : eventCount > 0 ? (
          <span>
            Stopped — {eventCount.toLocaleString()} events ready to export
          </span>
        ) : (
          <span>
            Captures automation decisions, message flow, and hook events during
            gameplay. Export the recording as JSON for diagnostics.
          </span>
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
                <span className="text-hammer-muted truncate">
                  {JSON.stringify(e.d)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
