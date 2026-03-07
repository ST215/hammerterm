import { useStore } from "@store/index";

const TABS: { id: string; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "alliances", label: "Alliances" },
  { id: "autotroops", label: "AutoTroops" },
  { id: "autogold", label: "AutoGold" },
  { id: "reciprocate", label: "Reciprocate" },
  { id: "comms", label: "Comms" },
  { id: "cia", label: "CIA" },
  { id: "recorder", label: "Rec" },
  { id: "help", label: "Help" },
];

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
