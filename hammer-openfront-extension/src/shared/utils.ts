import { TROOP_DISPLAY_DIV } from "./constants";

export const dTroops = (v: unknown): number => Number(v || 0) / TROOP_DISPLAY_DIV;

export const num = (v: unknown): number => Number(v) || 0;

export const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m: string) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] ?? m,
  );

export const short = (v: unknown): string => {
  let n = Math.abs(num(v));
  if (n >= 1e6) return Math.round(n / 1e5) / 10 + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(Math.round(n));
};

export const comma = (v: unknown): string =>
  Math.round(Math.abs(num(v))).toLocaleString();

export const fullNum = (v: unknown): string => {
  const n = Math.abs(num(v));
  const c = comma(n);
  return n >= 1e3 ? `${c} (${short(n)})` : c;
};

export const fmtSec = (sec: number): string => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const fmtDuration = (ms: number): string => {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  if (hrs > 0) return `${hrs}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
};

export function parseAmt(str: unknown): number {
  if (!str) return 0;
  const clean = String(str).replace(/,/g, "");
  const m = clean.match(/([\d.]+)([KkMm])?/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  if (m[2]) v *= m[2].toUpperCase() === "M" ? 1e6 : 1e3;
  return Math.round(v);
}
