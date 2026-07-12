import { useStore } from "@store/index";
import { useContentWidth } from "@ui/hooks/useContentWidth";
import { Section, PretextText } from "@ui/components/ds";
import { exportMatchData, exportAndView } from "@store/slices/match-export";
import { version as pkgVersion } from "../../../package.json";

const TABS_HELP = [
  { title: "Summary", desc: "Your player stats, donations, port income, and session totals." },
  { title: "Alliances", desc: "Per-player cards with emoji, quickchat, and alliance actions." },
  { title: "AutoTroops", desc: "Configure automatic troop sending to teammates and allies." },
  { title: "AutoGold", desc: "Configure automatic gold sending with ratio and threshold." },
  { title: "Reciprocate", desc: "Auto or manual reciprocation when someone sends you resources." },
  { title: "Comms", desc: "Emoji picker and categorized quickchat for any player." },
  { title: "CIA", desc: "Server-wide intelligence: economy rates, flows, alerts, live feed." },
];

const HOTKEYS = [
  {
    keys: ["ALT", "M"],
    label: "Set mouse target",
    detail: "Sets the player under your cursor as auto-send target.",
  },
  {
    keys: ["ALT", "F"],
    label: "Toggle auto-feed",
    detail: "Quickly enable/disable Auto Troops and Auto Gold.",
  },
  {
    keys: ["ALT", "SHIFT", "H"],
    label: "Toggle external window",
    detail:
      "Opens or closes the external dashboard window. If the shortcut does nothing, another extension may have claimed it — set it at chrome://extensions/shortcuts.",
  },
];

const TIPS = [
  "Use Auto Troops + Auto Gold together for fully automated resource management.",
  "CIA tab reveals hidden alliances — watch for players secretly feeding each other.",
  "Reciprocate in Auto mode to instantly return a percentage of any donation.",
  "Use Comms to coordinate attacks and defenses with your team quickly.",
  "Drag the panel header to reposition, or resize using the bottom-right corner.",
];

export default function HelpView() {
  const contentWidth = useContentWidth();
  const playerDataReady = useStore((s) => s.playerDataReady);
  const currentClientID = useStore((s) => s.currentClientID);
  const playerSummary = useStore((s) => s.playerSummary);
  const mySmallID = useStore((s) => s.mySmallID);
  const isConnected = currentClientID != null && currentClientID !== "";

  return (
    <div>
      <Section title="Tabs">
        <div className="flex flex-col gap-0_5">
          {TABS_HELP.map((t) => (
            <div key={t.title} className="flex gap-2 text-2xs py-0_5">
              <span className="text-hammer-blue font-semibold shrink-0 w-16">{t.title}</span>
              <PretextText text={t.desc} size="2xs" maxWidth={contentWidth - 80} className="text-hammer-muted" as="span" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Keyboard Shortcuts">
        <div className="flex flex-col gap-1">
          {HOTKEYS.map((hk) => (
            <div key={hk.keys.join("")} className="flex flex-col gap-0_5">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  {hk.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-hammer-dim text-2xs">+</span>}
                      <span className="bg-hammer-bg border border-hammer-border px-1_5 py-0_5 text-hammer-gold text-2xs font-semibold rounded">
                        {key}
                      </span>
                    </span>
                  ))}
                </div>
                <span className="text-hammer-text text-2xs font-medium">{hk.label}</span>
              </div>
              <div className="text-hammer-dim text-2xs ml-4">{hk.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Visibility">
        <div className="flex flex-col gap-1 text-2xs text-hammer-muted">
          <div>
            Hammer loads <span className="text-hammer-text">silent</span> — nothing
            appears on screen until you ask for it.
          </div>
          <div>
            Click the <span className="text-hammer-text">extension icon</span> to open
            the control popup: from there, show the Analytics card, open the Controls
            terminal, or launch the external window.
          </div>
          <div>
            <span className="text-hammer-gold">Alt+Shift+H</span> toggles the external
            dashboard window directly.
          </div>
          <div>
            On-screen popups and notifications default{" "}
            <span className="text-hammer-text">OFF</span>. Turn them on in the Settings
            tab.
          </div>
        </div>
      </Section>

      <Section title="Tips">
        <div className="flex flex-col gap-0_5">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-1 text-2xs">
              <span className="text-hammer-gold shrink-0">*</span>
              <PretextText text={tip} size="2xs" maxWidth={contentWidth - 20} className="text-hammer-muted" as="span" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Export">
        <div className="text-2xs text-hammer-muted mb-1.5">
          Export all match trading data. "Export & View" opens the Replay Viewer with the data
          already loaded; "Export JSON" downloads a file (use it with the standalone viewer too).
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportAndView}
            className="px-3 py-1 text-2xs text-hammer-green border border-hammer-green/50 bg-hammer-green/10 rounded cursor-pointer hover:bg-hammer-green/20 transition-colors self-start"
          >
            Export & View
          </button>
          <button
            onClick={exportMatchData}
            className="px-3 py-1 text-2xs text-hammer-blue border border-hammer-blue/50 bg-hammer-blue/10 rounded cursor-pointer hover:bg-hammer-blue/20 transition-colors self-start"
          >
            Export JSON
          </button>
        </div>
      </Section>

      <Section title="System">
        <div className="flex flex-col gap-0_5 text-2xs">
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Version</span>
            <span className="text-hammer-text">v{pkgVersion}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Player Data</span>
            <span className={playerDataReady ? "text-hammer-green" : "text-hammer-red"}>
              {playerDataReady ? "Ready" : "Not Ready"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Connection</span>
            <span className={isConnected ? "text-hammer-green" : "text-hammer-red"}>
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Players</span>
            <span className="text-hammer-blue">{playerSummary.count}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Your ID</span>
            <span className="text-hammer-gold">{mySmallID ?? "N/A"}</span>
          </div>
        </div>
      </Section>

      <Section title="About">
        <div className="text-2xs">
          <div className="text-hammer-green font-bold text-sm mb-1">HAMMER TERMINAL</div>
          <div className="text-hammer-muted mb-2">Companion tool for OpenFront.io</div>
          <div className="flex flex-col gap-0_5 mb-2">
            <div className="flex gap-2">
              <span className="text-hammer-muted w-12">Built by</span>
              <span className="text-hammer-text font-bold">[MARS] Hammer</span>
            </div>
            <div className="flex gap-2">
              <span className="text-hammer-muted w-12">aka</span>
              <span className="text-hammer-dim">Railroad Tycoon, Seaport Tycoon, Gold 4 Troops</span>
            </div>
            <div className="flex gap-2">
              <span className="text-hammer-muted w-12">Discord</span>
              <span className="text-hammer-blue">[MARS] Hammer</span>
            </div>
          </div>
          <div className="text-hammer-dim leading-relaxed">
            Intelligence and coordination companion for strategic resource management.
            Built by an automation/QA engineer for personal gameplay enjoyment, shared
            in the hope it provides value to others.
          </div>
        </div>
      </Section>
    </div>
  );
}
