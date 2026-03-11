import { useStore } from "@store/index";
import { SIZES } from "@shared/constants";

const btnClass =
  "px-1.5 py-0.5 text-xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text hover:bg-hammer-bg cursor-pointer";

export default function HeaderButtons() {
  const sizeIdx = useStore((s) => s.sizeIdx);
  const setSizeIdx = useStore((s) => s.setSizeIdx);
  const minimized = useStore((s) => s.minimized);
  const toggleMinimized = useStore((s) => s.toggleMinimized);
  const paused = useStore((s) => s.paused);
  const togglePaused = useStore((s) => s.togglePaused);
  const setUIVisible = useStore((s) => s.setUIVisible);
  const recorderOn = useStore((s) => s.recorderOn);
  const toggleRecorder = useStore((s) => s.toggleRecorder);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);

  const handleSize = () => {
    setSizeIdx((sizeIdx + 1) % SIZES.length);
  };

  const handleClose = () => {
    const hammer = (window as any).__HAMMER__;
    if (hammer?.cleanup) {
      hammer.cleanup();
    } else {
      setUIVisible(false);
    }
  };

  const handleModeToggle = () => {
    if (displayMode === "window") {
      // In dashboard — switch back to overlay and close window
      setDisplayMode("overlay");
      chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" });
    } else {
      // In overlay — open dashboard alongside (panel stays visible)
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    }
  };

  return (
    <>
      {/* Display mode toggle */}
      <button
        className={btnClass}
        onClick={handleModeToggle}
        title={displayMode === "window" ? "Close dashboard / switch to overlay" : "Open dashboard window"}
        style={{ minWidth: 28, textAlign: "center" }}
      >
        {displayMode === "window" ? "\u2612" : "\u29C9"}
      </button>

      {/* Size toggle */}
      <button
        className={btnClass}
        onClick={handleSize}
        title="Panel size"
        style={{ minWidth: 20, textAlign: "center" }}
      >
        {SIZES[sizeIdx].label}
      </button>

      {/* Minimize toggle */}
      <button
        className={btnClass}
        onClick={toggleMinimized}
        title={minimized ? "Expand" : "Minimize"}
        style={{ minWidth: 20, textAlign: "center" }}
      >
        {minimized ? "\u25B2" : "\u25BC"}
      </button>

      {/* Record toggle */}
      <button
        className={`${btnClass} ${recorderOn ? "text-hammer-red" : ""}`}
        onClick={toggleRecorder}
        title={recorderOn ? "Stop recording" : "Start recording"}
      >
        {recorderOn ? "\u25CF REC" : "REC"}
      </button>

      {/* Pause / Resume */}
      <button
        className={`${btnClass} ${paused ? "text-hammer-gold" : ""}`}
        onClick={togglePaused}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? "Resume" : "Pause"}
      </button>

      {/* Close */}
      <button
        className={`${btnClass} hover:text-hammer-red`}
        onClick={handleClose}
        title="Close Hammer"
      >
        X
      </button>
    </>
  );
}
