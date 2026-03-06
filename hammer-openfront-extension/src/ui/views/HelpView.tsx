const TABS_HELP = [
  {
    title: "Summary",
    description:
      "Overview of your game state: your player stats, team composition, alliance status, and a quick glance at key metrics. This is the default landing tab.",
  },
  {
    title: "Stats",
    description:
      "Detailed statistics for all players in the game. View troops, gold, tiles owned, and other metrics. Players are sorted and color-coded by relationship (teammate, ally, other).",
  },
  {
    title: "Ports",
    description:
      "Tracks gold received from trade ports. Shows total gold earned, trade frequency, average interval between trades, and estimated gold-per-minute for each port source.",
  },
  {
    title: "Feed",
    description:
      "Monitors all inbound and outbound resource donations (gold and troops). See who is sending you resources and who you are sending to, with totals and individual send counts.",
  },
  {
    title: "Alliances",
    description:
      "Manage your alliance relationships. View current allies, send alliance requests, and track alliance status changes throughout the game.",
  },
  {
    title: "Auto Troops",
    description:
      "Configure automatic troop sending. Set a target player and amount to automatically send troops at regular intervals. Supports percentage-based or fixed-amount modes.",
  },
  {
    title: "Auto Gold",
    description:
      "Configure automatic gold sending. Similar to Auto Troops but for gold. Set target, amount, and interval for automated gold transfers.",
  },
  {
    title: "Reciprocate",
    description:
      "Automatic or manual reciprocation of donations. When someone sends you resources, this feature helps you send back a percentage. Supports both manual (with notifications) and auto modes.",
  },
  {
    title: "Comms",
    description:
      "Communication center for sending emojis and quick chat messages to other players. Select individual targets or groups (team, allies, all). Includes a grid of emoji options and categorized quick chat phrases.",
  },
  {
    title: "CIA",
    description:
      "Server-wide intelligence tracking. Monitors all resource transfers between any players, detects betrayals (teammates feeding enemies), ranks the most generous and most fed players, and provides a live economy pulse.",
  },
];

const SHORTCUTS = [
  { keys: "ALT + M", description: "Set mouse target for auto-send" },
  { keys: "ALT + F", description: "Toggle auto-feed on/off" },
];

const TIPS = [
  "Use Auto Troops + Auto Gold together for fully automated resource management.",
  "CIA tab reveals hidden alliances -- watch for players secretly feeding each other.",
  "Reciprocate in Auto mode to instantly return a percentage of any donation received.",
  "The Feed tab helps you identify who your biggest supporters and dependents are.",
  "Use Comms to coordinate attacks and defenses with your team quickly.",
  "Port tracking helps you understand your passive income rate over time.",
  "Drag the panel header to reposition, or resize using the bottom-right corner.",
];

export default function HelpView() {
  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Tab explanations */}
      <div className="text-hammer-green text-sm font-bold">Tab Guide</div>
      {TABS_HELP.map((tab) => (
        <div
          key={tab.title}
          className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4"
        >
          <div className="text-hammer-blue text-xs font-bold">{tab.title}</div>
          <div className="text-hammer-text text-xs leading-relaxed">{tab.description}</div>
        </div>
      ))}

      {/* Keyboard Shortcuts */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">Keyboard Shortcuts</div>
        {SHORTCUTS.map((sc) => (
          <div key={sc.keys} className="flex items-center gap-8 text-xs">
            <span className="bg-hammer-bg border border-hammer-border px-8 py-4 text-hammer-gold font-mono font-bold">
              {sc.keys}
            </span>
            <span className="text-hammer-text">{sc.description}</span>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Tips</div>
        {TIPS.map((tip, i) => (
          <div key={i} className="flex items-start gap-4 text-xs">
            <span className="text-hammer-gold">*</span>
            <span className="text-hammer-text leading-relaxed">{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
