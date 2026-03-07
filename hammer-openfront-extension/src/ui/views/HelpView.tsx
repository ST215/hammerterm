import { useStore } from "@store/index";
import { Section } from "@ui/components/ds";

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
];

const TIPS = [
  "Use Auto Troops + Auto Gold together for fully automated resource management.",
  "CIA tab reveals hidden alliances — watch for players secretly feeding each other.",
  "Reciprocate in Auto mode to instantly return a percentage of any donation.",
  "Use Comms to coordinate attacks and defenses with your team quickly.",
  "Drag the panel header to reposition, or resize using the bottom-right corner.",
];

export default function HelpView() {
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
              <span className="text-hammer-muted">{t.desc}</span>
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

      <Section title="Tips">
        <div className="flex flex-col gap-0_5">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-1 text-2xs">
              <span className="text-hammer-gold shrink-0">*</span>
              <span className="text-hammer-muted">{tip}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="System">
        <div className="flex flex-col gap-0_5 text-2xs">
          <div className="flex items-center justify-between">
            <span className="text-hammer-muted">Version</span>
            <span className="text-hammer-text">v11.0</span>
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
    </div>
  );
}
