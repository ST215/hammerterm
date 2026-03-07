import { Component, type ReactNode } from "react";
import { useStore } from "@store/index";
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

interface AppProps {
  mode: "overlay" | "window";
}

const VIEW_MAP: Record<string, React.FC> = {
  summary: SummaryView,
  alliances: AlliancesView,
  autotroops: AutoTroopsView,
  autogold: AutoGoldView,
  reciprocate: ReciprocateView,
  comms: CommsView,
  cia: CIAView,
  help: HelpView,
  recorder: RecorderView,
};

export default function App({ mode }: AppProps) {
  const view = useStore((s) => s.view);
  const uiVisible = useStore((s) => s.uiVisible);
  const displayMode = useStore((s) => s.displayMode);

  if (!uiVisible) return null;

  // In window mode, the overlay hides the panel but keeps notifications
  // so they still appear over the game page.
  if (mode === "overlay" && displayMode === "window") {
    return (
      <>
        <DonationToast />
        <ReciprocatePopup />
        <StatusToast />
      </>
    );
  }

  const ActiveView = VIEW_MAP[view] ?? SummaryView;

  const content = (
    <>
      <TabBar />
      <div className="p-2">
        <ViewErrorBoundary>
          <ActiveView />
        </ViewErrorBoundary>
      </div>
    </>
  );

  if (mode === "overlay") {
    return (
      <>
        <Panel header={<HeaderButtons />}>
          {content}
        </Panel>
        <DonationToast />
        <ReciprocatePopup />
        <StatusToast />
      </>
    );
  }

  // Window mode — simple flex column, full viewport
  return (
    <div className="flex flex-col w-full h-screen bg-hammer-bg text-hammer-text font-mono text-base">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-hammer-header px-2 py-1 border-b border-hammer-border">
        <span className="text-hammer-green text-sm font-bold">HAMMER</span>
        <div className="flex items-center gap-1">
          <HeaderButtons />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {content}
      </div>

      <ReciprocatePopup />
      <StatusToast />
    </div>
  );
}
