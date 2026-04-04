import type { CSSProperties } from "react";

export type NotifPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const INSET = 16;

/** Returns CSS properties for fixed positioning + scaling of a notification. */
export function notifPositionStyle(pos: NotifPosition, scale: number): CSSProperties {
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 2147483647,
  };

  switch (pos) {
    case "top-left":
      return { ...base, top: INSET, left: INSET, transform: `scale(${scale})`, transformOrigin: "top left" };
    case "top-center":
      return { ...base, top: INSET, left: "50%", transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" };
    case "top-right":
      return { ...base, top: INSET, right: INSET, transform: `scale(${scale})`, transformOrigin: "top right" };
    case "center-left":
      return { ...base, top: "50%", left: INSET, transform: `translateY(-50%) scale(${scale})`, transformOrigin: "center left" };
    case "center":
      return { ...base, top: "50%", left: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center center" };
    case "center-right":
      return { ...base, top: "50%", right: INSET, transform: `translateY(-50%) scale(${scale})`, transformOrigin: "center right" };
    case "bottom-left":
      return { ...base, bottom: INSET, left: INSET, transform: `scale(${scale})`, transformOrigin: "bottom left" };
    case "bottom-center":
      return { ...base, bottom: INSET, left: "50%", transform: `translateX(-50%) scale(${scale})`, transformOrigin: "bottom center" };
    case "bottom-right":
      return { ...base, bottom: INSET, right: INSET, transform: `scale(${scale})`, transformOrigin: "bottom right" };
  }
}

export const POSITION_GRID: Array<{ pos: NotifPosition; label: string; gridArea: string }> = [
  { pos: "top-left",     label: "TL", gridArea: "1 / 1" },
  { pos: "top-center",   label: "TC", gridArea: "1 / 2" },
  { pos: "top-right",    label: "TR", gridArea: "1 / 3" },
  { pos: "center-left",  label: "CL", gridArea: "2 / 1" },
  { pos: "center",       label: "C",  gridArea: "2 / 2" },
  { pos: "center-right", label: "CR", gridArea: "2 / 3" },
  { pos: "bottom-left",  label: "BL", gridArea: "3 / 1" },
  { pos: "bottom-center",label: "BC", gridArea: "3 / 2" },
  { pos: "bottom-right", label: "BR", gridArea: "3 / 3" },
];
