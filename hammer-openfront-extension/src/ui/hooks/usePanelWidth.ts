import { useStore } from "@store/index";

export function usePanelWidth(): number {
  return useStore((s) => s.panelWidth);
}
