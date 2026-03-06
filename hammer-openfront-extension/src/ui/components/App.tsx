import { useStore } from "@store/index";
import Panel from "./Panel";
import HeaderButtons from "./HeaderButtons";
import TabBar from "./TabBar";
import ReciprocatePopup from "./ReciprocatePopup";
import StatusToast from "./StatusToast";

// View imports — each view is a default-exported React component
import SummaryView from "../views/SummaryView";
import StatsView from "../views/StatsView";
import PortsView from "../views/PortsView";
import FeedView from "../views/FeedView";
import AlliancesView from "../views/AlliancesView";
import AutoTroopsView from "../views/AutoTroopsView";
import AutoGoldView from "../views/AutoGoldView";
import ReciprocateView from "../views/ReciprocateView";
import CommsView from "../views/CommsView";
import CIAView from "../views/CIAView";
import HelpView from "../views/HelpView";
import HotkeysView from "../views/HotkeysView";
import AboutView from "../views/AboutView";

interface AppProps {
  mode: "overlay" | "window";
}

const VIEW_MAP: Record<string, React.FC> = {
  summary: SummaryView,
  stats: StatsView,
  ports: PortsView,
  feed: FeedView,
  alliances: AlliancesView,
  autotroops: AutoTroopsView,
  autogold: AutoGoldView,
  reciprocate: ReciprocateView,
  comms: CommsView,
  cia: CIAView,
  help: HelpView,
  hotkeys: HotkeysView,
  about: AboutView,
};

export default function App({ mode }: AppProps) {
  const view = useStore((s) => s.view);
  const uiVisible = useStore((s) => s.uiVisible);
  const displayMode = useStore((s) => s.displayMode);

  if (!uiVisible) return null;

  // Hide overlay when in window mode (dashboard is showing instead)
  if (mode === "overlay" && displayMode === "window") return null;

  const ActiveView = VIEW_MAP[view] ?? AboutView;

  const content = (
    <>
      <TabBar />
      <div className="p-2">
        <ActiveView />
      </div>
    </>
  );

  if (mode === "overlay") {
    return (
      <>
        <Panel header={<HeaderButtons />}>
          {content}
        </Panel>
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
