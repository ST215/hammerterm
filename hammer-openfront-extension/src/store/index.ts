import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createUISlice, type UISlice } from "./slices/ui";
import { createPlayerSlice, type PlayerSlice } from "./slices/player";
import { createDonationsSlice, type DonationsSlice } from "./slices/donations";
import { createAutoTroopsSlice, type AutoTroopsSlice } from "./slices/auto-troops";
import { createAutoGoldSlice, type AutoGoldSlice } from "./slices/auto-gold";
import { createReciprocateSlice, type ReciprocateSlice } from "./slices/reciprocate";
import { createCommsSlice, type CommsSlice } from "./slices/comms";
import { createCIASlice, type CIASlice } from "./slices/cia";

export type HammerStore = UISlice &
  PlayerSlice &
  DonationsSlice &
  AutoTroopsSlice &
  AutoGoldSlice &
  ReciprocateSlice &
  CommsSlice &
  CIASlice;

export const useStore = create<HammerStore>()(
  subscribeWithSelector((...a) => ({
    ...createUISlice(...a),
    ...createPlayerSlice(...a),
    ...createDonationsSlice(...a),
    ...createAutoTroopsSlice(...a),
    ...createAutoGoldSlice(...a),
    ...createReciprocateSlice(...a),
    ...createCommsSlice(...a),
    ...createCIASlice(...a),
  })),
);
