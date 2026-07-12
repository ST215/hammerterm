import { Component, useRef, type ReactNode } from "react";
import { useStore } from "@store/index";
import { record } from "../../recorder";
import GrowthHUD from "./GrowthHUD";
import Panel from "./Panel";
import HeaderButtons from "./HeaderButtons";
import TabBar from "./TabBar";
import DisguisedCard from "./DisguisedCard";
import ReciprocatePopup from "./ReciprocatePopup";
import DonationToast from "./DonationToast";
import StatusToast from "./StatusToast";

class ViewErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[Hammer] View render error:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-2 text-hammer-red text-2xs">
          <div className="font-semibold">View Error</div>
          <div className="text-hammer-muted mt-1">{this.state.error.message}</div>
          <button
            className="mt-1 text-hammer-blue underline cursor-pointer"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// View imports
import SummaryView from "../views/SummaryView";
import AlliancesView from "../views/AlliancesView";
import AutoTroopsView from "../views/AutoTroopsView";
import AutoGoldView from "../views/AutoGoldView";
import AttackRatioView from "../views/AttackRatioView";
import ReciprocateView from "../views/ReciprocateView";
import CommsView from "../views/CommsView";
import CIAView from "../views/CIAView";
import HelpView from "../views/HelpView";
import RecorderView from "../views/RecorderView";
import TradingView from "../views/TradingView";
import BroadcastView from "../views/BroadcastView";
import SettingsView from "../views/SettingsView";
import HammerView from "../views/HammerView";

interface AppProps {
  mode: "overlay" | "window";
}

const VIEW_MAP: Record<string, React.FC> = {
  hammer: HammerView,
  summary: SummaryView,
  alliances: AlliancesView,
  trading: TradingView,
  autotroops: AutoTroopsView,
  autogold: AutoGoldView,
  attackratio: AttackRatioView,
  reciprocate: ReciprocateView,
  comms: CommsView,
  cia: CIAView,
  broadcast: BroadcastView,
  settings: SettingsView,
  help: HelpView,
  recorder: RecorderView,
};

export default function App({ mode }: AppProps) {
  const appRenders = useRef(0);
  appRenders.current++;
  record("render", "App", { n: appRenders.current, mode });

  const view = useStore((s) => s.view);
  const inGameView = useStore((s) => s.inGameView);
  const screenPopupsEnabled = useStore((s) => s.screenPopupsEnabled);

  // ── OVERLAY (in-browser, on the game page) ──
  if (mode === "overlay") {
    // Popups render on the game screen in EVERY view mode — including "hidden"
    // — gated only by the master screenPopupsEnabled switch (each popup also has
    // its own toggle internally). Decoupled from inGameView so notifications
    // work regardless of whether the panel is shown. Each popup is
    // fixed-positioned. Default OFF — the user opts in via Settings.
    const notifications = screenPopupsEnabled ? (
      <>
        <DonationToast />
        <ReciprocatePopup />
        <StatusToast />
        <GrowthHUD />
      </>
    ) : null;

    // "hidden": only popups on the game screen (no panel chrome at all).
    if (inGameView === "hidden") return notifications;

    // "disguised": innocuous analytics card only — no tab bar, no header chrome.
    // "revealed": full terminal — header buttons + tab bar + active view.
    const revealed = inGameView === "revealed";
    const ActiveView = VIEW_MAP[view] ?? HammerView;
    return (
      <>
        <Panel header={revealed ? <HeaderButtons /> : null}>
          {revealed ? (
            <>
              <TabBar mode="overlay" />
              <div className="p-2">
                <ViewErrorBoundary>
                  <ActiveView />
                </ViewErrorBoundary>
              </div>
            </>
          ) : (
            <DisguisedCard />
          )}
        </Panel>
        {notifications}
      </>
    );
  }

  // ── WINDOW: external dashboard popup ──
  // No notifications here — they always show on the game page overlay.
  const ActiveView = VIEW_MAP[view] ?? HammerView;
  return (
    <div className="flex flex-col w-full h-screen bg-hammer-bg text-hammer-text font-mono text-base">
      <div className="flex items-center justify-between bg-hammer-header px-2 py-1 border-b border-hammer-border">
        <span className="text-hammer-green text-sm font-bold">HAMMER</span>
        <div className="flex items-center gap-1">
          <HeaderButtons />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <TabBar mode="window" />
        <div className="p-2">
          <ViewErrorBoundary>
            <ActiveView />
          </ViewErrorBoundary>
        </div>
      </div>
    </div>
  );
}
