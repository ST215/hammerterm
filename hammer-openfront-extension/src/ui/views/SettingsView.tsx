/**
 * SettingsView — popup/notification configuration.
 *
 * One place to: master-toggle popups, enable/position/scale each popup type,
 * and TEST each one (fires a sample so you can place it before going live).
 * The four popups: ReciprocatePopup, DonationToast, StatusToast, GrowthHUD.
 */

import { useCallback } from "react";
import { useStore } from "@store/index";
import { Section } from "@ui/components/ds";
import { showStatus } from "@ui/components/StatusToast";
import { POSITION_GRID, type NotifPosition } from "@shared/notif-position";

function PositionPicker({ value, onChange }: { value: NotifPosition; onChange: (p: NotifPosition) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 22px)", gap: 3 }}>
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

function ScaleSlider({ value, onChange, accent = "accent-hammer-green" }: { value: number; onChange: (v: number) => void; accent?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-hammer-muted w-10">Scale</span>
      <input
        type="range" min={0.5} max={2.5} step={0.1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`flex-1 ${accent}`}
      />
      <span className="text-2xs text-hammer-dim w-8 text-right">{value.toFixed(1)}x</span>
    </div>
  );
}

const testBtn =
  "px-3 py-1 text-2xs text-hammer-green border border-hammer-green/50 bg-hammer-green/10 rounded cursor-pointer hover:bg-hammer-green/20 transition-colors self-start";

export default function SettingsView() {
  const popupsEnabled = useStore((s) => s.popupsEnabled);
  const setPopupsEnabled = useStore((s) => s.setPopupsEnabled);

  // Reciprocate popup
  const popupScale = useStore((s) => s.popupScale);
  const setPopupScale = useStore((s) => s.setPopupScale);
  const reciprocatePosition = useStore((s) => s.reciprocatePosition);
  const setReciprocatePosition = useStore((s) => s.setReciprocatePosition);
  const reciprocatePopupsEnabled = useStore((s) => s.reciprocatePopupsEnabled);
  const toggleReciprocatePopupsEnabled = useStore((s) => s.toggleReciprocatePopupsEnabled);
  const addNotif = useStore((s) => s.addReciprocateNotification);

  // Donation toast
  const donationPosition = useStore((s) => s.donationPosition);
  const setDonationPosition = useStore((s) => s.setDonationPosition);
  const toastScale = useStore((s) => s.toastScale);
  const setToastScale = useStore((s) => s.setToastScale);
  const toastInboundTroops = useStore((s) => s.toastInboundTroops);
  const toastInboundGold = useStore((s) => s.toastInboundGold);
  const toastOutboundTroops = useStore((s) => s.toastOutboundTroops);
  const toastOutboundGold = useStore((s) => s.toastOutboundGold);
  const setToastInboundTroops = useStore((s) => s.setToastInboundTroops);
  const setToastInboundGold = useStore((s) => s.setToastInboundGold);
  const setToastOutboundTroops = useStore((s) => s.setToastOutboundTroops);
  const setToastOutboundGold = useStore((s) => s.setToastOutboundGold);
  const addToast = useStore((s) => s.addDonationToast);

  // Status toast
  const statusPosition = useStore((s) => s.statusPosition);
  const setStatusPosition = useStore((s) => s.setStatusPosition);
  const statusToastScale = useStore((s) => s.statusToastScale);
  const setStatusToastScale = useStore((s) => s.setStatusToastScale);

  // Growth HUD
  const growthHudEnabled = useStore((s) => s.growthHudEnabled);
  const setGrowthHudEnabled = useStore((s) => s.setGrowthHudEnabled);
  const growthPosition = useStore((s) => s.growthPosition);
  const setGrowthPosition = useStore((s) => s.setGrowthPosition);

  const testReciprocate = useCallback(() => {
    addNotif({ id: Date.now(), donorId: "test", donorName: "Test Player", troops: 50000, gold: 0, timestamp: Date.now(), dismissed: false });
  }, [addNotif]);

  const testToast = useCallback((direction: "in" | "out", type: "troops" | "gold") => {
    addToast({ id: Date.now() + Math.floor(Math.random() * 1000), playerName: "Test Player", type, amount: type === "gold" ? 25000 : 50000, direction, timestamp: Date.now() });
  }, [addToast]);

  return (
    <div>
      <Section title="Popups">
        <label className="flex items-center gap-2 cursor-pointer text-2xs">
          <input type="checkbox" checked={popupsEnabled} onChange={(e) => setPopupsEnabled(e.target.checked)} className="accent-hammer-green" />
          <span className={popupsEnabled ? "text-hammer-text" : "text-hammer-dim"}>
            Master switch — show on-screen popups (every view mode)
          </span>
        </label>
        <div className="text-2xs text-hammer-dim mt-1">
          When on, popups appear on the game screen regardless of whether the panel is shown or hidden.
        </div>
      </Section>

      <Section title="Reciprocate Popup">
        <div className="text-2xs text-hammer-muted mb-2">Appears when someone sends you resources (manual mode)</div>
        <label className="flex items-center gap-1.5 cursor-pointer text-2xs mb-2">
          <input type="checkbox" checked={reciprocatePopupsEnabled} onChange={toggleReciprocatePopupsEnabled} className="accent-hammer-green" />
          <span className={reciprocatePopupsEnabled ? "text-hammer-text" : "text-hammer-dim"}>Enabled</span>
        </label>
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-hammer-muted">Position</span>
            <PositionPicker value={reciprocatePosition} onChange={setReciprocatePosition} />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <ScaleSlider value={popupScale} onChange={setPopupScale} />
            <button onClick={testReciprocate} className={testBtn}>Test</button>
          </div>
        </div>
      </Section>

      <Section title="Donation Toast">
        <div className="text-2xs text-hammer-muted mb-2">Card showing donation details (inbound + outbound)</div>
        <div className="flex items-start gap-4 mb-2">
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-hammer-muted">Position</span>
            <PositionPicker value={donationPosition} onChange={setDonationPosition} />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <ScaleSlider value={toastScale} onChange={setToastScale} accent="accent-hammer-blue" />
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => testToast("in", "troops")} className={testBtn}>Test in·troops</button>
              <button onClick={() => testToast("in", "gold")} className={testBtn}>Test in·gold</button>
              <button onClick={() => testToast("out", "troops")} className={testBtn}>Test out·troops</button>
              <button onClick={() => testToast("out", "gold")} className={testBtn}>Test out·gold</button>
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
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="accent-hammer-green" />
              <span className={value ? "text-hammer-text" : "text-hammer-dim"}>{label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Status Toast">
        <div className="text-2xs text-hammer-muted mb-2">Flash shown after sending troops or gold</div>
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-hammer-muted">Position</span>
            <PositionPicker value={statusPosition} onChange={setStatusPosition} />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <ScaleSlider value={statusToastScale} onChange={setStatusToastScale} />
            <button onClick={() => showStatus("✓ Hammer status test", 3000)} className={testBtn}>Test</button>
          </div>
        </div>
      </Section>

      <Section title="Growth HUD">
        <div className="text-2xs text-hammer-muted mb-2">Persistent troop-growth overlay (shows while Auto Troops runs)</div>
        <label className="flex items-center gap-1.5 cursor-pointer text-2xs mb-2">
          <input type="checkbox" checked={growthHudEnabled} onChange={(e) => setGrowthHudEnabled(e.target.checked)} className="accent-hammer-green" />
          <span className={growthHudEnabled ? "text-hammer-text" : "text-hammer-dim"}>Enabled</span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-hammer-muted">Position</span>
          <PositionPicker value={growthPosition} onChange={setGrowthPosition} />
        </div>
      </Section>
    </div>
  );
}
