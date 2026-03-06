import { useCallback } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, comma } from "@shared/utils";
import { sendEmoji, sendQuickChat } from "@content/game/send";
import type { PlayerData } from "@shared/types";

const EMOJI_LIST = [
  { index: 0, label: "\u{1F44D}" },
  { index: 1, label: "\u{2764}\u{FE0F}" },
  { index: 2, label: "\u{1F525}" },
  { index: 3, label: "\u{2B50}" },
  { index: 4, label: "\u{1F60A}" },
  { index: 5, label: "\u{1F602}" },
  { index: 6, label: "\u{1F914}" },
  { index: 7, label: "\u{1F44E}" },
  { index: 8, label: "\u{1F4AA}" },
  { index: 9, label: "\u{1F389}" },
  { index: 10, label: "\u{1F480}" },
  { index: 11, label: "\u{1F6A9}" },
];

const QUICK_CHATS = [
  { key: "SendTroops", label: "Send Troops" },
  { key: "SendGold", label: "Send Gold" },
  { key: "Help", label: "Help" },
  { key: "Attack", label: "Attack" },
  { key: "Defend", label: "Defend" },
  { key: "Thanks", label: "Thanks" },
  { key: "GG", label: "GG" },
  { key: "Yes", label: "Yes" },
  { key: "No", label: "No" },
];

function PercentBar({
  value,
  max,
  color = "bg-hammer-green",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-hammer-bg rounded h-1 overflow-hidden">
      <div
        className={`h-full ${color} rounded transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PlayerCard({
  player,
  borderColor,
  maxTroops,
}: {
  player: PlayerData;
  borderColor: string;
  maxTroops: number;
}) {
  const allianceCommsExpanded = useStore((s) => s.allianceCommsExpanded);
  const toggleAllianceCommsExpanded = useStore(
    (s) => s.toggleAllianceCommsExpanded,
  );

  const isExpanded = allianceCommsExpanded.get(player.id) ?? false;
  const name = player.displayName || player.name || "Unknown";
  const troops = player.troops;
  const tiles = player.tilesOwned ?? 0;
  const troopPct = maxTroops > 0 ? ((troops / maxTroops) * 100).toFixed(0) : "0";

  const handleToggleComms = useCallback(() => {
    toggleAllianceCommsExpanded(player.id);
  }, [player.id, toggleAllianceCommsExpanded]);

  const handleEmoji = useCallback(
    (emojiIndex: number) => {
      sendEmoji(player.id, emojiIndex);
    },
    [player.id],
  );

  const handleQuickChat = useCallback(
    (key: string) => {
      sendQuickChat(player.id, key);
    },
    [player.id],
  );

  return (
    <div
      className={`bg-hammer-surface rounded border ${borderColor} p-2`}
    >
      {/* Player Info */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-hammer-text font-bold truncate mr-2">
          {name}
        </span>
        <div className="flex items-center gap-2 shrink-0 text-2xs">
          <span className="text-hammer-muted">{troopPct}%</span>
          <span className="text-hammer-muted">{tiles} tiles</span>
        </div>
      </div>

      {/* Troops bar */}
      <div className="mb-1">
        <div className="flex items-center justify-between text-2xs mb-0_5">
          <span className="text-hammer-muted">Troops</span>
          <span className="text-hammer-text">{short(troops)}</span>
        </div>
        <PercentBar value={troops} max={maxTroops || 1} />
      </div>

      {/* Comms Toggle */}
      <button
        onClick={handleToggleComms}
        className={`w-full text-2xs rounded py-0_5 px-1 border transition-colors cursor-pointer ${
          isExpanded
            ? "bg-hammer-blue/20 border-hammer-blue text-hammer-blue"
            : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text hover:border-hammer-text"
        }`}
      >
        {isExpanded ? "Close Comms" : "Comms"}
      </button>

      {/* Comms Panel */}
      {isExpanded && (
        <div className="mt-1 pt-1 border-t border-hammer-border">
          {/* Emoji Grid */}
          <div className="mb-1">
            <div className="text-2xs text-hammer-muted mb-0_5">Emoji</div>
            <div className="grid grid-cols-6 gap-0_5">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji.index}
                  onClick={() => handleEmoji(emoji.index)}
                  className="bg-hammer-bg border border-hammer-border rounded p-0_5 text-sm hover:bg-hammer-border transition-colors cursor-pointer text-center"
                  title={`Send emoji ${emoji.label}`}
                >
                  {emoji.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Chat Buttons */}
          <div>
            <div className="text-2xs text-hammer-muted mb-0_5">Quick Chat</div>
            <div className="flex flex-wrap gap-0_5">
              {QUICK_CHATS.map((qc) => (
                <button
                  key={qc.key}
                  onClick={() => handleQuickChat(qc.key)}
                  className="bg-hammer-bg border border-hammer-border rounded px-1 py-0_5 text-2xs text-hammer-text hover:bg-hammer-border hover:text-hammer-green transition-colors cursor-pointer"
                >
                  {qc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-xs text-hammer-muted uppercase tracking-wider mb-1 border-b border-hammer-border pb-0_5 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-2xs">{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function AlliancesView() {
  const teammates = useTeammates();
  const allies = useAllies();
  const me = useMyPlayer();

  // Use the max troop count across all visible players as the bar max
  const maxTroops = Math.max(
    me?.troops ?? 0,
    ...teammates.map((p) => p.troops),
    ...allies.map((p) => p.troops),
    1,
  );

  const hasAny = teammates.length > 0 || allies.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-hammer-muted font-mono text-sm py-8">
        <div className="text-lg mb-1">No teammates or allies</div>
        <div className="text-2xs">
          Team members and alliance partners will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Teammates */}
      {teammates.length > 0 && (
        <Section title="Teammates" count={teammates.length}>
          <div className="flex flex-col gap-1">
            {teammates.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                borderColor="border-hammer-green"
                maxTroops={maxTroops}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Allies */}
      {allies.length > 0 && (
        <Section title="Allies" count={allies.length}>
          <div className="flex flex-col gap-1">
            {allies.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                borderColor="border-hammer-blue"
                maxTroops={maxTroops}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
