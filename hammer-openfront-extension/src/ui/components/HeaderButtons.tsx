import { useStore } from "@store/index";
import { SIZES } from "@shared/constants";

const btnClass =
  "px-1.5 py-0.5 text-xs font-mono border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text hover:bg-hammer-bg cursor-pointer";

export default function HeaderButtons() {
  const sizeIdx = useStore((s) => s.sizeIdx);
  const setSizeIdx = useStore((s) => s.setSizeIdx);
  const disguiseInGame = useStore((s) => s.disguiseInGame);
  const paused = useStore((s) => s.paused);
  const togglePaused = useStore((s) => s.togglePaused);
  const recorderOn = useStore((s) => s.recorderOn);
  const toggleRecorder = useStore((s) => s.toggleRecorder);
  const externalOpen = useStore((s) => s.externalOpen);
  const hideInGame = useStore((s) => s.hideInGame);

  const handleSize = () => {
    setSizeIdx((sizeIdx + 1) % SIZES.length);
  };

  // Collapse the full terminal back to the innocuous analytics card.
  const handleDisguise = () => disguiseInGame();

  // External popup toggle. Background is the authority for externalOpen — it
  // confirms the window actually opened/closed and messages the content script
  // to update state (which drives inGameView via the externalOpen invariant).
  const handleExternalToggle = () => {
    if (externalOpen) {
      chrome.runtime.sendMessage({ type: "CLOSE_DASHBOARD" });
    } else {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    }
  };

  return (
    <>
      {/* External dashboard popup toggle */}
      <button
        className={btnClass}
        onClick={handleExternalToggle}
        title={externalOpen ? "Close external window" : "Open in external window"}
        style={{ minWidth: 28, textAlign: "center" }}
      >
        {externalOpen ? "[x]" : "[ext]"}
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

      {/* Disguise — collapse back to the analytics card */}
      <button
        className={btnClass}
        onClick={handleDisguise}
        title="Hide controls (back to analytics card)"
        style={{ minWidth: 20, textAlign: "center" }}
      >
        {"-"}
      </button>

      {/* Record toggle */}
      <button
        className={`${btnClass} ${recorderOn ? "text-hammer-red" : ""}`}
        onClick={toggleRecorder}
        title={recorderOn ? "Stop recording" : "Start recording"}
      >
        {recorderOn ? "REC" : "rec"}
      </button>

      {/* Pause / Resume */}
      <button
        className={`${btnClass} ${paused ? "text-hammer-gold" : ""}`}
        onClick={togglePaused}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? "Resume" : "Pause"}
      </button>

      {/* Hide — overlay disappears from the page. Reopen from the extension icon. */}
      <button
        className={`${btnClass} hover:text-hammer-red`}
        onClick={hideInGame}
        title="Hide overlay (reopen from the extension icon)"
      >
        X
      </button>
    </>
  );
}
