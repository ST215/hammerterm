import { useCallback } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, dTroops } from "@shared/utils";
import { sendEmoji, sendQuickChat, sendAllianceRequest } from "@content/game/send";
import { EMOJI_COMPACT } from "@shared/emoji-table";
import { Section } from "@ui/components/ds";
import type { PlayerData } from "@shared/types";

const QUICK_ACTIONS = [
  { key: "greet.thanks", label: "Thanks" },
  { key: "help.troops", label: "Troops" },
  { key: "help.gold", label: "Gold" },
  { key: "greet.gg", label: "GG" },
  { key: "misc.go", label: "Go!" },
  { key: "attack.attack", label: "Attack" },
  { key: "defend.defend", label: "Defend" },
];

function PlayerCard({
  player,
  tag,
  tagColor,
  maxTroops,
}: {
  player: PlayerData;
  tag: string;
  tagColor: string;
  maxTroops: number;
}) {
  const allianceCommsExpanded = useStore((s) => s.allianceCommsExpanded);
  const toggleExpanded = useStore((s) => s.toggleAllianceCommsExpanded);
  const setView = useStore((s) => s.setView);
  const setCommsTargets = useStore((s) => s.setCommsTargets);

  const isExpanded = allianceCommsExpanded.get(player.id) ?? false;
  const name = player.displayName || player.name || "Unknown";
  const troops = dTroops(player.troops);
  const tiles = player.tilesOwned ?? 0;
  const troopPct = maxTroops > 0 ? Math.min(100, (troops / maxTroops) * 100) : 0;

  const handleToggle = useCallback(() => toggleExpanded(player.id), [player.id, toggleExpanded]);
  const handleFullComms = useCallback(() => {
    setCommsTargets(new Set([player.id]));
    setView("comms");
  }, [player.id, setCommsTargets, setView]);

  const handleEmoji = useCallback((idx: number) => sendEmoji(player.id, idx), [player.id]);
  const handleQC = useCallback((key: string) => sendQuickChat(player.id, key), [player.id]);

  return (
    <div className={`bg-hammer-raised rounded border ${tagColor} p-2`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-hammer-text font-bold truncate">{name}</span>
          <span className={`text-2xs ${tagColor.replace("border-", "text-")}`}>[{tag}]</span>
        </div>
        <span className="text-2xs text-hammer-dim">{tiles} tiles</span>
      </div>

      {/* Troops bar */}
      <div className="mb-1.5">
        <div className="flex items-center justify-between text-2xs mb-0.5">
          <span className="text-hammer-muted">Troops</span>
          <span className="text-hammer-blue font-bold">{short(troops)}</span>
        </div>
        <div className="w-full bg-hammer-bg rounded h-1.5 overflow-hidden">
          <div
            className="h-full bg-hammer-blue rounded transition-all"
            style={{ width: `${troopPct}%` }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-0.5">
        <button
          onClick={handleToggle}
          className={`flex-1 text-2xs rounded py-0.5 px-1 border cursor-pointer transition-colors ${
            isExpanded
              ? "bg-hammer-blue/20 border-hammer-blue text-hammer-blue"
              : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text hover:border-hammer-text"
          }`}
        >
          {isExpanded ? "Close" : "Comms"}
        </button>
        <button
          onClick={handleFullComms}
          className="text-2xs rounded py-0.5 px-1 border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
          title="Open full comms tab"
        >
          Full
        </button>
      </div>

      {/* Expanded comms panel */}
      {isExpanded && (
        <div className="mt-1.5 pt-1.5 border-t border-hammer-border-subtle">
          {/* Emoji row */}
          <div className="flex flex-wrap gap-0.5 mb-1">
            {EMOJI_COMPACT.map((e) => (
              <button
                key={e.index}
                onClick={() => handleEmoji(e.index)}
                className="w-6 h-6 flex items-center justify-center text-sm bg-hammer-bg border border-hammer-border rounded cursor-pointer hover:bg-hammer-green/10 transition-colors"
                title={e.label}
              >
                {e.label}
              </button>
            ))}
          </div>
          {/* Quick chat row */}
          <div className="flex flex-wrap gap-0.5">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.key}
                onClick={() => handleQC(qa.key)}
                className="px-1 py-0.5 text-2xs font-mono bg-hammer-bg border border-hammer-border rounded text-hammer-text hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlliancesView() {
  const teammates = useTeammates();
  const allies = useAllies();
  const me = useMyPlayer();

  const maxTroops = Math.max(
    dTroops(me?.troops),
    ...teammates.map((p) => dTroops(p.troops)),
    ...allies.map((p) => dTroops(p.troops)),
    1,
  );

  const hasAny = teammates.length > 0 || allies.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center text-hammer-muted font-mono text-sm py-8">
        <div className="text-base mb-1">No teammates or allies</div>
        <div className="text-2xs">
          Team members and alliance partners will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Teammates */}
      {teammates.length > 0 && (
        <Section title="Teammates" count={teammates.length}>
          <div className="flex flex-col gap-1">
            {teammates.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                tag="TM"
                tagColor="border-hammer-blue"
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
                tag="AL"
                tagColor="border-hammer-green"
                maxTroops={maxTroops}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
