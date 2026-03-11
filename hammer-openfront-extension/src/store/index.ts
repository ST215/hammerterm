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
import { createDonationToastsSlice, type DonationToastsSlice } from "./slices/donation-toasts";
import { createRecorderSlice, type RecorderSlice } from "./slices/recorder";
import { createBroadcastSlice, type BroadcastSlice } from "./slices/broadcast";

export type HammerStore = UISlice &
  PlayerSlice &
  DonationsSlice &
  AutoTroopsSlice &
  AutoGoldSlice &
  ReciprocateSlice &
  CommsSlice &
  CIASlice &
  DonationToastsSlice &
  RecorderSlice &
  BroadcastSlice;

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
    ...createDonationToastsSlice(...a),
    ...createRecorderSlice(...a),
    ...createBroadcastSlice(...a),
  })),
);
