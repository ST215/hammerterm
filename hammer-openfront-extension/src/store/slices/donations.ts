import type { StateCreator } from "zustand";
import type { DonationRecord, PortRecord } from "@shared/types";
import { bump, bumpPorts } from "@shared/logic/state";

export interface FeedEntry {
  name: string;
  type: string;
  amount: number;
  ts: number;
  isPort?: boolean;
  donorTroops?: number;
}

const FEED_CAP = 5000;
const RAW_CAP = 500;

export interface DonationsSlice {
  inbound: Map<string, DonationRecord>;
  outbound: Map<string, DonationRecord>;
  ports: Map<string, PortRecord>;
  feedIn: FeedEntry[];
  feedOut: FeedEntry[];
  rawMessages: unknown[];
  seen: Set<string>;

  recordInbound: (id: string, displayName: string, type: string, amount: number, donorTroops?: number) => void;
  recordOutbound: (id: string, displayName: string, type: string, amount: number) => void;
  recordPort: (playerId: string, gold: number, timestamp: number) => void;
  addRawMessage: (msg: unknown) => void;
  clearSeen: () => void;
  resetDonations: () => void;
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

  recordInbound: (id, displayName, type, amount, donorTroops) =>
    set((s) => {
      const next = new Map(s.inbound);
      const rec = bump(next, id, displayName);
      if (type === "gold") {
        rec.gold += amount;
        rec.goldSends++;
      } else {
        rec.troops += amount;
        rec.troopsSends++;
      }
      rec.count++;
      rec.last = new Date();
      if (donorTroops != null) rec.lastDonorTroops = donorTroops;

      const feedIn = [{ name: displayName, type, amount, ts: Date.now(), donorTroops }, ...s.feedIn].slice(0, FEED_CAP);
      return { inbound: next, feedIn };
    }),

  recordOutbound: (id, displayName, type, amount) =>
    set((s) => {
      const next = new Map(s.outbound);
      const rec = bump(next, id, displayName);
      if (type === "gold") {
        rec.gold += amount;
        rec.goldSends++;
      } else {
        rec.troops += amount;
        rec.troopsSends++;
      }
      rec.count++;
      rec.last = new Date();

      const feedOut = [{ name: displayName, type, amount, ts: Date.now() }, ...s.feedOut].slice(0, FEED_CAP);
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

  resetDonations: () =>
    set({
      inbound: new Map(),
      outbound: new Map(),
      ports: new Map(),
      feedIn: [],
      feedOut: [],
      rawMessages: [],
      seen: new Set(),
    }),
});
