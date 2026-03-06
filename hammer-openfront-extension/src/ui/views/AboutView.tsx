import { useStore } from "@store/index";

const FEATURES = [
  { icon: "\u{1F4CA}", name: "Summary" },
  { icon: "\u{1F4C8}", name: "Stats" },
  { icon: "\u2693", name: "Ports" },
  { icon: "\u{1F4E6}", name: "Feed" },
  { icon: "\u{1F91D}", name: "Alliances" },
  { icon: "\u2694\uFE0F", name: "Auto Troops" },
  { icon: "\u{1F4B0}", name: "Auto Gold" },
  { icon: "\u{1F501}", name: "Reciprocate" },
  { icon: "\u{1F4AC}", name: "Comms" },
  { icon: "\u{1F575}\uFE0F", name: "CIA" },
  { icon: "\u2753", name: "Help" },
  { icon: "\u2328\uFE0F", name: "Hotkeys" },
];

export default function AboutView() {
  const playerDataReady = useStore((s) => s.playerDataReady);
  const currentClientID = useStore((s) => s.currentClientID);
  const playerSummary = useStore((s) => s.playerSummary);
  const mySmallID = useStore((s) => s.mySmallID);

  const isConnected = currentClientID != null && currentClientID !== "";

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Hero */}
      <div className="bg-hammer-card border border-hammer-border p-16 flex flex-col items-center gap-8">
        <div className="text-4xl">{"\u{1F528}"}</div>
        <div className="text-hammer-green text-lg font-bold font-mono">Hammer Terminal</div>
        <div className="text-hammer-gold text-sm font-mono">v11.0</div>
      </div>

      {/* Description */}
      <div className="bg-hammer-card border border-hammer-border p-8">
        <p className="text-hammer-text text-xs leading-relaxed">
          Hammer Terminal is a comprehensive game companion for OpenFront.io. It provides real-time
          player tracking, automated resource management, server-wide intelligence, communication
          tools, and detailed analytics to enhance your gameplay experience.
        </p>
      </div>

      {/* Features */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">Features</div>
        <div className="grid grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-4 text-xs bg-hammer-bg border border-hammer-border px-8 py-4"
            >
              <span>{f.icon}</span>
              <span className="text-hammer-text">{f.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Author */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-muted text-xs">Made for OpenFront.io</div>
      </div>

      {/* Version Info */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Version Info</div>
        <div className="flex flex-col gap-4 text-xs">
          <div className="flex justify-between">
            <span className="text-hammer-muted">Version</span>
            <span className="text-hammer-text">v11.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-hammer-muted">Platform</span>
            <span className="text-hammer-text">OpenFront.io</span>
          </div>
          <div className="flex justify-between">
            <span className="text-hammer-muted">License</span>
            <span className="text-hammer-text">MIT</span>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">System Status</div>

        <div className="flex flex-col gap-4 text-xs">
          {/* Player Data Ready */}
          <div className="flex items-center justify-between">
            <span className="text-hammer-text">Player Data Ready</span>
            <div className="flex items-center gap-4">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: playerDataReady ? "#7ff2a3" : "#ff6b6b" }}
              />
              <span className={playerDataReady ? "text-hammer-green" : "text-hammer-red"}>
                {playerDataReady ? "Ready" : "Not Ready"}
              </span>
            </div>
          </div>

          {/* WebSocket */}
          <div className="flex items-center justify-between">
            <span className="text-hammer-text">WebSocket Connected</span>
            <div className="flex items-center gap-4">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: isConnected ? "#7ff2a3" : "#ff6b6b" }}
              />
              <span className={isConnected ? "text-hammer-green" : "text-hammer-red"}>
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          {/* Players Loaded */}
          <div className="flex items-center justify-between">
            <span className="text-hammer-text">Players Loaded</span>
            <span className="text-hammer-blue">{playerSummary.count}</span>
          </div>

          {/* Your ID */}
          <div className="flex items-center justify-between">
            <span className="text-hammer-text">Your ID</span>
            <span className="text-hammer-gold">
              {mySmallID != null ? mySmallID : "N/A"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
