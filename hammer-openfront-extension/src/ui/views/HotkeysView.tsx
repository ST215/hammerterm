const HOTKEYS = [
  {
    keys: ["ALT", "M"],
    description: "Set mouse target for auto-send",
    detail:
      "Sets the player currently under your mouse cursor as the target for Auto Troops and Auto Gold. Hover over a player on the map and press this shortcut.",
  },
  {
    keys: ["ALT", "F"],
    description: "Toggle auto-feed on/off",
    detail:
      "Quickly enables or disables both Auto Troops and Auto Gold without changing your configured settings.",
  },
];

export default function HotkeysView() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-12">
        <div className="text-hammer-green text-sm font-bold">Keyboard Shortcuts</div>

        {HOTKEYS.map((hk, i) => (
          <div key={i} className="flex flex-col gap-4">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                {hk.keys.map((key, ki) => (
                  <span key={ki} className="flex items-center gap-4">
                    {ki > 0 && (
                      <span className="text-hammer-muted text-xs">+</span>
                    )}
                    <span className="bg-hammer-bg border border-hammer-border px-8 py-4 text-hammer-gold text-xs font-mono font-bold min-w-8 text-center">
                      {key}
                    </span>
                  </span>
                ))}
              </div>
              <span className="text-hammer-text text-xs font-bold">{hk.description}</span>
            </div>
            <div className="text-hammer-muted text-xs leading-relaxed ml-4">
              {hk.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
