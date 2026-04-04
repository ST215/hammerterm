import { usePanelWidth } from "./usePanelWidth";

// Panel p-2 (9px*2) + view p-2 (9px*2) = 36px total horizontal padding
const VIEW_PADDING = 36;

/** Available content width inside the view area (panel - padding). */
export function useContentWidth(): number {
  return usePanelWidth() - VIEW_PADDING;
}
