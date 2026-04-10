import { Component, useRef, type ReactNode } from "react";
import { useStore } from "@store/index";
import { record } from "../../recorder";
import GrowthHUD from "./GrowthHUD";
import StreamWidget from "./StreamWidget";
import Panel from "./Panel";
import HeaderButtons from "./HeaderButtons";
import TabBar from "./TabBar";
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
import ReciprocateView from "../views/ReciprocateView";
import CommsView from "../views/CommsView";
import CIAView from "../views/CIAView";
import HelpView from "../views/HelpView";
import RecorderView from "../views/RecorderView";
import TradingView from "../views/TradingView";
import BroadcastView from "../views/BroadcastView";
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
  reciprocate: ReciprocateView,
  comms: CommsView,
  cia: CIAView,
  broadcast: BroadcastView,
  help: HelpView,
  recorder: RecorderView,
};

export default function App({ mode }: AppProps) {
  const appRenders = useRef(0);
  appRenders.current++;
  record("render", "App", { n: appRenders.current, mode });

  const view = useStore((s) => s.view);
  const uiVisible = useStore((s) => s.uiVisible);
  const displayMode = useStore((s) => s.displayMode);

  // ── OVERLAY ──
  if (mode === "overlay") {
    // Notifications ALWAYS render on the game page — in every mode, every state.
    const notifications = (
      <>
        <DonationToast />
        <ReciprocatePopup />
        <StatusToast />
        <GrowthHUD />
      </>
    );

    // Window mode: show stream widget + notifications (no panel)
    if (displayMode === "window") {
      return (
        <>
          <StreamWidget />
          {notifications}
        </>
      );
    }

    // Panel hidden: still show notifications
    if (!uiVisible) return notifications;

    // Normal overlay: panel + notifications
    const ActiveView = VIEW_MAP[view] ?? HammerView;
    return (
      <>
        <Panel header={<HeaderButtons />}>
          <TabBar mode="overlay" />
          <div className="p-2">
            <ViewErrorBoundary>
              <ActiveView />
            </ViewErrorBoundary>
          </div>
        </Panel>
        {notifications}
      </>
    );
  }

  // ── WINDOW: external dashboard ──
  // No notifications — they render on the game page overlay.
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
