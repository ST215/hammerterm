import { useState, useCallback, memo } from "react";
import { useStore } from "@store/index";
import { EMOJI_TABLE } from "@shared/emoji-table";
import {
  broadcastStart,
  broadcastStop,
} from "@content/automation/broadcast";

// --- Preset sequences ---
const PRESETS: { label: string; seq: number[] }[] = [
  { label: "Alert", seq: [33, 26, 33, 26] },       // ☢️ SOS ☢️ SOS
  { label: "Flex", seq: [19, 30, 19, 30] },         // 💪 🔥 💪 🔥
  { label: "Peace", seq: [27, 48, 25, 48] },        // 🕊️ ❤️ 🤝 ❤️
  { label: "Taunt", seq: [14, 32, 14, 32] },        // 🖕 💀 🖕 💀
];

// --- CollapseSection ---
function CollapseSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 first:mt-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-xs text-hammer-muted font-medium uppercase tracking-wider mb-1.5 border-b border-hammer-border pb-0.5 flex items-center justify-between cursor-pointer hover:text-hammer-text transition-colors"
      >
        <span>
          {open ? "\u25BC" : "\u25B6"} {title}
        </span>
      </button>
      {open && children}
    </div>
  );
}

// --- EmojiCell ---
const EmojiCell = memo(function EmojiCell({
  idx,
  emoji,
  selected,
  inSequence,
  onClick,
}: {
  idx: number;
  emoji: string;
  selected: boolean;
  inSequence: boolean;
  onClick: (idx: number) => void;
}) {
  return (
    <button
      onClick={() => onClick(idx)}
      className={`w-8 h-8 text-lg border rounded cursor-pointer transition-colors flex items-center justify-center ${
        selected
          ? "bg-hammer-green/30 border-hammer-green"
          : inSequence
            ? "bg-hammer-blue/20 border-hammer-blue/50"
            : "bg-hammer-surface border-hammer-border hover:bg-hammer-green/10 hover:border-hammer-dim"
      }`}
      title={`#${idx}`}
    >
      {emoji}
    </button>
  );
});

// --- SequenceChip ---
const SequenceChip = memo(function SequenceChip({
  idx,
  pos,
  onRemove,
}: {
  idx: number;
  pos: number;
  onRemove: (pos: number) => void;
}) {
  return (
    <button
      onClick={() => onRemove(pos)}
      className="w-7 h-7 text-base bg-hammer-blue/20 border border-hammer-blue/50 rounded cursor-pointer hover:bg-hammer-red/20 hover:border-hammer-red transition-colors flex items-center justify-center"
      title="Click to remove"
    >
      {EMOJI_TABLE[idx] || "?"}
    </button>
  );
});

export default function BroadcastView() {
  const enabled = useStore((s) => s.broadcastEnabled);
  const emojiIndex = useStore((s) => s.broadcastEmojiIndex);
  const sequence = useStore((s) => s.broadcastSequence);
  const useSequence = useStore((s) => s.broadcastUseSequence);
  const setEmojiIndex = useStore((s) => s.setBroadcastEmojiIndex);
  const setSequence = useStore((s) => s.setBroadcastSequence);
  const setUseSequence = useStore((s) => s.setBroadcastUseSequence);

  const seqSet = new Set(sequence);

  const handleEmojiClick = useCallback(
    (idx: number) => {
      if (useSequence) {
        setSequence([...useStore.getState().broadcastSequence, idx]);
      } else {
        setEmojiIndex(idx);
      }
    },
    [useSequence, setEmojiIndex, setSequence],
  );

  const handleRemoveFromSequence = useCallback(
    (pos: number) => {
      const seq = [...useStore.getState().broadcastSequence];
      seq.splice(pos, 1);
      setSequence(seq);
    },
    [setSequence],
  );

  const handleToggle = useCallback(() => {
    if (enabled) {
      broadcastStop();
    } else {
      broadcastStart();
    }
  }, [enabled]);

  const currentEmoji = useSequence && sequence.length > 0
    ? sequence.map((i) => EMOJI_TABLE[i] || "?").join(" ")
    : EMOJI_TABLE[emojiIndex] || "?";

  return (
    <div className="space-y-2">
      {/* Status + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${enabled ? "bg-hammer-green animate-pulse" : "bg-hammer-dim"}`}
          />
          <span className="text-xs text-hammer-text">
            {enabled
              ? <>Broadcasting {currentEmoji} every 10s</>
              : "Broadcast off"}
          </span>
        </div>
        <button
          onClick={handleToggle}
          className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
            enabled
              ? "bg-hammer-red/20 text-hammer-red border border-hammer-red/50 hover:bg-hammer-red/30"
              : "bg-hammer-green/20 text-hammer-green border border-hammer-green/50 hover:bg-hammer-green/30"
          }`}
        >
          {enabled ? "Stop" : "Start"}
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setUseSequence(false)}
          className={`px-2 py-0.5 text-2xs rounded cursor-pointer transition-colors ${
            !useSequence
              ? "bg-hammer-green/20 text-hammer-green border border-hammer-green/50"
              : "bg-transparent text-hammer-muted border border-hammer-border hover:text-hammer-text"
          }`}
        >
          Single
        </button>
        <button
          onClick={() => setUseSequence(true)}
          className={`px-2 py-0.5 text-2xs rounded cursor-pointer transition-colors ${
            useSequence
              ? "bg-hammer-blue/20 text-hammer-blue border border-hammer-blue/50"
              : "bg-transparent text-hammer-muted border border-hammer-border hover:text-hammer-text"
          }`}
        >
          Sequence
        </button>
      </div>

      {/* Emoji grid */}
      <CollapseSection title={useSequence ? "Click to add to sequence" : "Select emoji"}>
        <div className="grid grid-cols-10 gap-px">
          {EMOJI_TABLE.map((emoji, idx) => (
            <EmojiCell
              key={idx}
              idx={idx}
              emoji={emoji}
              selected={!useSequence && idx === emojiIndex}
              inSequence={useSequence && seqSet.has(idx)}
              onClick={handleEmojiClick}
            />
          ))}
        </div>
      </CollapseSection>

      {/* Sequence editor (only in sequence mode) */}
      {useSequence && (
        <CollapseSection title="Sequence" defaultOpen={true}>
          {sequence.length === 0 ? (
            <div className="text-2xs text-hammer-dim">
              Click emojis above to build a sequence
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {sequence.map((idx, pos) => (
                  <SequenceChip key={pos} idx={idx} pos={pos} onRemove={handleRemoveFromSequence} />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setSequence([])}
                  className="px-2 py-0.5 text-2xs text-hammer-muted border border-hammer-border rounded cursor-pointer hover:text-hammer-red hover:border-hammer-red transition-colors"
                >
                  Clear
                </button>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setSequence(p.seq)}
                    className="px-2 py-0.5 text-2xs text-hammer-muted border border-hammer-border rounded cursor-pointer hover:text-hammer-text hover:border-hammer-dim transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CollapseSection>
      )}
    </div>
  );
}
