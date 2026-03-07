/**
 * Game's emoji table — mirrors flattenedEmojiTable from OpenFrontIO/src/core/Util.ts.
 * Index in this array = the emojiIndex sent to the game.
 */
export const EMOJI_TABLE: readonly string[] = [
  // Row 0: Faces
  "\u{1F600}", "\u{1F60A}", "\u{1F970}", "\u{1F607}", "\u{1F60E}",
  // Row 1: Negative faces
  "\u{1F61E}", "\u{1F97A}", "\u{1F62D}", "\u{1F631}", "\u{1F621}",
  // Row 2: Characters
  "\u{1F608}", "\u{1F921}", "\u{1F971}", "\u{1FAE1}", "\u{1F595}",
  // Row 3: Hands
  "\u{1F44B}", "\u{1F44F}", "\u270B", "\u{1F64F}", "\u{1F4AA}",
  // Row 4: Gestures
  "\u{1F44D}", "\u{1F44E}", "\u{1FAF4}", "\u{1F90C}", "\u{1F926}",
  // Row 5: Symbols
  "\u{1F91D}", "\u{1F198}", "\u{1F54A}\uFE0F", "\u{1F3F3}\uFE0F", "\u23F3",
  // Row 6: Action
  "\u{1F525}", "\u{1F4A5}", "\u{1F480}", "\u2622\uFE0F", "\u26A0\uFE0F",
  // Row 7: Arrows + awards
  "\u2196\uFE0F", "\u2B06\uFE0F", "\u2197\uFE0F", "\u{1F451}", "\u{1F947}",
  // Row 8: Arrows + awards
  "\u2B05\uFE0F", "\u{1F3AF}", "\u27A1\uFE0F", "\u{1F948}", "\u{1F949}",
  // Row 9: Arrows + hearts
  "\u2199\uFE0F", "\u2B07\uFE0F", "\u2198\uFE0F", "\u2764\uFE0F", "\u{1F494}",
  // Row 10: Economy
  "\u{1F4B0}", "\u2693", "\u26F5", "\u{1F3E1}", "\u{1F6E1}\uFE0F",
  // Row 11: Misc
  "\u{1F3ED}", "\u{1F682}", "\u2753", "\u{1F414}", "\u{1F400}",
] as const;

/** Curated subset for compact emoji picker (AlliancesView). Game index included. */
export const EMOJI_COMPACT: { index: number; label: string }[] = [
  { index: 20, label: "\u{1F44D}" },  // thumbs up
  { index: 21, label: "\u{1F44E}" },  // thumbs down
  { index: 48, label: "\u2764\uFE0F" }, // heart
  { index: 30, label: "\u{1F525}" },  // fire
  { index: 19, label: "\u{1F4AA}" },  // flexed biceps
  { index: 32, label: "\u{1F480}" },  // skull
  { index: 25, label: "\u{1F91D}" },  // handshake
  { index: 15, label: "\u{1F44B}" },  // wave
  { index: 38, label: "\u{1F451}" },  // crown
  { index: 41, label: "\u{1F3AF}" },  // target
  { index: 26, label: "\u{1F198}" },  // SOS
  { index: 1,  label: "\u{1F60A}" },  // smile
];
