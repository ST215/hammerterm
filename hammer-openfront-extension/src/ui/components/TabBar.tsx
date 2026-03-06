import { useStore } from "@store/index";

const TABS = [
  "summary",
  "stats",
  "ports",
  "feed",
  "alliances",
  "autotroops",
  "autogold",
  "reciprocate",
  "comms",
  "cia",
  "help",
  "hotkeys",
  "about",
] as const;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TabBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const minimized = useStore((s) => s.minimized);

  if (minimized) return null;

  return (
    <div
      className="flex flex-wrap gap-0 border-b border-hammer-border bg-hammer-bg"
      style={{ flexShrink: 0 }}
    >
      {TABS.map((tab) => {
        const isActive = view === tab;
        return (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`px-2 py-1 text-xs font-mono border-none cursor-pointer transition-colors ${
              isActive
                ? "bg-hammer-green/20 text-hammer-green"
                : "bg-transparent text-hammer-muted hover:text-hammer-text hover:bg-hammer-surface"
            }`}
            style={{ outline: "none" }}
          >
            {capitalize(tab)}
          </button>
        );
      })}
    </div>
  );
}
