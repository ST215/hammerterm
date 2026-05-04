import { useStore } from "@store/index";

const ALL_TABS: { id: string; label: string }[] = [
  { id: "hammer", label: "Hammer" },
  { id: "summary", label: "Summary" },
  { id: "alliances", label: "Alliances" },
  { id: "trading", label: "Trading" },
  { id: "autotroops", label: "Troop MGMT" },
  { id: "autogold", label: "Gold MGMT" },
  { id: "reciprocate", label: "Reciprocate" },
  { id: "broadcast", label: "Broadcast" },
  { id: "comms", label: "Comms" },
  { id: "cia", label: "CIA" },
  { id: "recorder", label: "Rec" },
  { id: "help", label: "Help" },
];

const HAMMER_ONLY = ALL_TABS.filter((t) => t.id === "hammer");

export default function TabBar({ mode }: { mode?: "overlay" | "window" }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const minimized = useStore((s) => s.minimized);
  const tabsRevealed = useStore((s) => s.tabsRevealed);

  if (minimized) return null;

  // Window (external popup) always shows all tabs (already gated by Continue screen).
  // Overlay (in-browser) shows only Hammer until the user reveals the rest.
  const tabs = mode === "window" || tabsRevealed ? ALL_TABS : HAMMER_ONLY;

  return (
    <div
      className="flex flex-wrap gap-0 border-b border-hammer-border bg-hammer-bg"
      style={{ flexShrink: 0 }}
    >
      {tabs.map((tab) => {
        const isActive = view === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-2 py-1 text-xs border-none cursor-pointer transition-colors ${
              isActive
                ? "bg-hammer-green/20 text-hammer-green font-medium"
                : "bg-transparent text-hammer-muted hover:text-hammer-text hover:bg-hammer-surface"
            }`}
            style={{ outline: "none" }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
