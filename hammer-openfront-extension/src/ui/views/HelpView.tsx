import { useCallback } from "react";
import { useStore } from "@store/index";
import { Section } from "@ui/components/ds";
import { showStatus } from "@ui/components/StatusToast";
import { exportMatchData } from "@store/slices/match-export";
import { POSITION_GRID, type NotifPosition } from "@shared/notif-position";

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

// 3×3 grid position picker (7 of 9 cells filled)
function PositionPicker({ value, onChange }: { value: NotifPosition; onChange: (p: NotifPosition) => void }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 28px)",
        gridTemplateRows: "repeat(3, 22px)",
        gap: 3,
      }}
    >
      {POSITION_GRID.map(({ pos, label, gridArea }) => (
        <button
          key={pos}
          onClick={() => onChange(pos)}
          title={pos}
          style={{ gridArea }}
          className={[
            "text-2xs font-mono font-bold border cursor-pointer transition-colors",
            value === pos
              ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
              : "bg-hammer-bg border-hammer-border text-hammer-dim hover:border-hammer-muted hover:text-hammer-muted",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function HelpView() {
  const playerDataReady = useStore((s) => s.playerDataReady);
  const currentClientID = useStore((s) => s.currentClientID);
  const playerSummary = useStore((s) => s.playerSummary);
  const mySmallID = useStore((s) => s.mySmallID);
  const isConnected = currentClientID != null && currentClientID !== "";

  const popupScale = useStore((s) => s.popupScale);
  const setPopupScale = useStore((s) => s.setPopupScale);
  const addNotif = useStore((s) => s.addReciprocateNotification);

  const reciprocatePosition = useStore((s) => s.reciprocatePosition);
  const setReciprocatePosition = useStore((s) => s.setReciprocatePosition);
  const donationPosition = useStore((s) => s.donationPosition);
  const setDonationPosition = useStore((s) => s.setDonationPosition);

  const toastInboundTroops = useStore((s) => s.toastInboundTroops);
  const toastInboundGold = useStore((s) => s.toastInboundGold);
  const toastOutboundTroops = useStore((s) => s.toastOutboundTroops);
  const toastOutboundGold = useStore((s) => s.toastOutboundGold);
  const setToastInboundTroops = useStore((s) => s.setToastInboundTroops);
  const setToastInboundGold = useStore((s) => s.setToastInboundGold);
  const setToastOutboundTroops = useStore((s) => s.setToastOutboundTroops);
  const setToastOutboundGold = useStore((s) => s.setToastOutboundGold);
  const toastScale = useStore((s) => s.toastScale);
  const setToastScale = useStore((s) => s.setToastScale);
  const statusToastScale = useStore((s) => s.statusToastScale);
  const setStatusToastScale = useStore((s) => s.setStatusToastScale);

  const fireTestNotif = useCallback(() => {
    addNotif({
      id: Date.now(),
      donorId: "test",
      donorName: "Test Player",
      troops: 50000,
      gold: 0,
      timestamp: Date.now(),
      dismissed: false,
    });
  }, [addNotif]);

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

      <Section title="Popup Notifications">
        <div className="text-2xs text-hammer-muted mb-2">ReciprocatePopup — appears when someone sends you resources</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-2xs text-hammer-muted">Position</span>
              <PositionPicker value={reciprocatePosition} onChange={setReciprocatePosition} />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-hammer-muted w-10">Scale</span>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  value={popupScale}
                  onChange={(e) => setPopupScale(Number(e.target.value))}
                  className="flex-1 accent-hammer-green"
                />
                <span className="text-2xs text-hammer-dim w-8 text-right">{popupScale.toFixed(1)}x</span>
              </div>
              <button
                onClick={fireTestNotif}
                className="px-3 py-1 text-2xs text-hammer-green border border-hammer-green/50 bg-hammer-green/10 rounded cursor-pointer hover:bg-hammer-green/20 transition-colors self-start"
              >
                Test Notification
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Activity Feed (Donation Toast)">
        <div className="text-2xs text-hammer-muted mb-2">Top-screen card showing donation details when someone sends</div>
        <div className="flex items-start gap-4 mb-2">
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-hammer-muted">Position</span>
            <PositionPicker value={donationPosition} onChange={setDonationPosition} />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-hammer-muted w-10">Scale</span>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={toastScale}
                onChange={(e) => setToastScale(Number(e.target.value))}
                className="flex-1 accent-hammer-blue"
              />
              <span className="text-2xs text-hammer-dim w-8 text-right">{toastScale.toFixed(1)}x</span>
            </div>
          </div>
        </div>
        <div className="text-2xs text-hammer-muted mb-1">Show toasts for:</div>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: "Inbound troops", value: toastInboundTroops, set: setToastInboundTroops },
            { label: "Inbound gold",   value: toastInboundGold,   set: setToastInboundGold },
            { label: "Outbound troops", value: toastOutboundTroops, set: setToastOutboundTroops },
            { label: "Outbound gold",   value: toastOutboundGold,   set: setToastOutboundGold },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-1.5 cursor-pointer text-2xs">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => set(e.target.checked)}
                className="accent-hammer-green"
              />
              <span className={value ? "text-hammer-text" : "text-hammer-dim"}>{label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Status Toast">
        <div className="text-2xs text-hammer-muted mb-1.5">Center-screen flash shown after sending troops or gold</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xs text-hammer-muted w-14">Scale</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={statusToastScale}
              onChange={(e) => setStatusToastScale(Number(e.target.value))}
              className="flex-1 accent-hammer-green"
            />
            <span className="text-2xs text-hammer-dim w-8 text-right">{statusToastScale.toFixed(2)}x</span>
          </div>
          <button
            onClick={() => showStatus("✓ Hammer status test", 3000)}
            className="px-3 py-1 text-2xs text-hammer-green border border-hammer-green/50 bg-hammer-green/10 rounded cursor-pointer hover:bg-hammer-green/20 transition-colors self-start"
          >
            Test Status Toast
          </button>
        </div>
      </Section>

      <Section title="Export">
        <div className="text-2xs text-hammer-muted mb-1.5">
          Export all match trading data as JSON. Open in the Hammer Replay Viewer for analysis.
        </div>
        <button
          onClick={exportMatchData}
          className="px-3 py-1 text-2xs text-hammer-blue border border-hammer-blue/50 bg-hammer-blue/10 rounded cursor-pointer hover:bg-hammer-blue/20 transition-colors self-start"
        >
          Export Match Data
        </button>
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
