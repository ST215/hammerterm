import type { StateCreator } from "zustand";
import type { DonationRecord, PortRecord } from "@shared/types";
import { bump, bumpPorts } from "@shared/logic/state";

export interface FeedEntry {
  name: string;
  type: string;
  amount: number;
  ts: number;
}

const FEED_CAP = 200;
const RAW_CAP = 500;

export interface DonationsSlice {
  inbound: Map<string, DonationRecord>;
  outbound: Map<string, DonationRecord>;
  ports: Map<string, PortRecord>;
  feedIn: FeedEntry[];
  feedOut: FeedEntry[];
  rawMessages: unknown[];
  seen: Set<string>;

  recordInbound: (name: string, type: string, amount: number) => void;
  recordOutbound: (name: string, type: string, amount: number) => void;
  recordPort: (playerId: string, gold: number, timestamp: number) => void;
  addRawMessage: (msg: unknown) => void;
  clearSeen: () => void;
}

export const createDonationsSlice: StateCreator<DonationsSlice, [], [], DonationsSlice> = (
  set,
  get,
) => ({
  inbound: new Map(),
  outbound: new Map(),
  ports: new Map(),
  feedIn: [],
  feedOut: [],
  rawMessages: [],
  seen: new Set(),

  recordInbound: (name, type, amount) =>
    set((s) => {
      const next = new Map(s.inbound);
      const rec = bump(next, name);
      if (type === "gold") {
        rec.gold += amount;
        rec.goldSends++;
      } else {
        rec.troops += amount;
        rec.troopsSends++;
      }
      rec.count++;
      rec.last = new Date();

      const feedIn = [{ name, type, amount, ts: Date.now() }, ...s.feedIn].slice(0, FEED_CAP);
      return { inbound: next, feedIn };
    }),

  recordOutbound: (name, type, amount) =>
    set((s) => {
      const next = new Map(s.outbound);
      const rec = bump(next, name);
      if (type === "gold") {
        rec.gold += amount;
        rec.goldSends++;
      } else {
        rec.troops += amount;
        rec.troopsSends++;
      }
      rec.count++;
      rec.last = new Date();

      const feedOut = [{ name, type, amount, ts: Date.now() }, ...s.feedOut].slice(0, FEED_CAP);
      return { outbound: next, feedOut };
    }),

  recordPort: (playerId, gold, timestamp) =>
    set((s) => {
      const next = new Map(s.ports);
      bumpPorts(next, playerId, gold, timestamp);
      return { ports: next };
    }),

  addRawMessage: (msg) =>
    set((s) => {
      const rawMessages = [msg, ...s.rawMessages].slice(0, RAW_CAP);
      return { rawMessages };
    }),

  clearSeen: () => set({ seen: new Set() }),
});
