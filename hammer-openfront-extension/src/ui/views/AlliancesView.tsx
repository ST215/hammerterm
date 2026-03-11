import { useState, useCallback, useMemo, memo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, dTroops, num } from "@shared/utils";
import { sendEmoji, sendQuickChat, asSendTroops, asSendGold, sendAllianceRequest, sendBetray } from "@content/game/send";
import { EMOJI_COMPACT } from "@shared/emoji-table";
import { StatCard } from "@ui/components/ds";
import type { PlayerData } from "@shared/types";

const QUICK_ACTIONS = [
  { key: "greet.thanks", label: "Thx" },
  { key: "help.troops", label: "Troops" },
  { key: "help.gold", label: "Gold" },
  { key: "greet.gg", label: "GG" },
  { key: "misc.go", label: "Go!" },
  { key: "attack.attack", label: "Atk" },
  { key: "defend.defend", label: "Def" },
];

const SEND_PCTS = [10, 25, 50] as const;

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapseSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 first:mt-0" data-section={title}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-xs text-hammer-muted font-medium uppercase tracking-wider mb-1.5 border-b border-hammer-border pb-0.5 flex items-center justify-between cursor-pointer hover:text-hammer-text transition-colors"
      >
        <span>{open ? "\u25BC" : "\u25B6"} {title}</span>
        {count != null && (
          <span className="text-2xs text-hammer-dim">{count}</span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact player tile — responsive card for teammates/allies
// ---------------------------------------------------------------------------

const PlayerTile = memo(function PlayerTile({
  player,
  tag,
  tagColor,
  myTroops,
  myGold,
}: {
  player: PlayerData;
  tag: string;
  tagColor: string;
  myTroops: number;
  myGold: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const setView = useStore((s) => s.setView);
  const setCommsTargets = useStore((s) => s.setCommsTargets);

  const name = player.displayName || player.name || "Unknown";
  const troops = dTroops(player.troops);
  const gold = num(player.gold);
  const alive = player.isAlive !== false;

  const handleEmoji = useCallback((idx: number) => sendEmoji(player.id, idx), [player.id]);
  const handleQC = useCallback((key: string) => sendQuickChat(player.id, key), [player.id]);
  const handleFullComms = useCallback(() => {
    setCommsTargets(new Set([player.id]));
    setView("comms");
  }, [player.id, setCommsTargets, setView]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`flex flex-col items-center justify-center p-1.5 rounded border ${tagColor} bg-hammer-raised cursor-pointer hover:bg-hammer-surface transition-colors ${!alive ? "opacity-40" : ""}`}
        title={`${name} — ${short(troops)}t ${short(gold)}g`}
      >
        <span className={`text-2xs font-bold ${tagColor.replace("border-", "text-")} mb-0.5`}>[{tag}]</span>
        <span className="text-xs text-hammer-text font-bold text-center leading-tight">{name}</span>
        {!alive && <span className="text-2xs text-hammer-red">DEAD</span>}
        <div className="flex gap-1.5 mt-0.5 text-2xs">
          <span className="text-hammer-blue">{short(troops)}t</span>
          <span className="text-hammer-gold">{short(gold)}g</span>
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded border ${tagColor} bg-hammer-raised p-1.5 w-full`}>
      <div className="flex items-center gap-1 mb-1">
        <span className={`text-2xs font-bold ${tagColor.replace("border-", "text-")} shrink-0`}>[{tag}]</span>
        <span className="text-xs text-hammer-text font-bold truncate flex-1">{name}</span>
        <div className="flex gap-2 text-2xs shrink-0">
          <span className="text-hammer-blue">{short(troops)}t</span>
          <span className="text-hammer-gold">{short(gold)}g</span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-2xs text-hammer-muted hover:text-hammer-text cursor-pointer shrink-0 ml-1"
        >✕</button>
      </div>

      <div className="flex flex-wrap gap-0.5 mb-1">
        {SEND_PCTS.map((pct) => (
          <button
            key={`t${pct}`}
            onClick={() => asSendTroops(player.id, Math.floor(myTroops * pct / 100))}
            className="text-2xs rounded py-0.5 px-1.5 border border-hammer-border bg-hammer-bg text-hammer-blue hover:border-hammer-blue transition-colors cursor-pointer"
          >{pct}%t</button>
        ))}
        {SEND_PCTS.map((pct) => (
          <button
            key={`g${pct}`}
            onClick={() => asSendGold(player.id, Math.floor(myGold * pct / 100))}
            className="text-2xs rounded py-0.5 px-1.5 border border-hammer-border bg-hammer-bg text-hammer-gold hover:border-hammer-gold transition-colors cursor-pointer"
          >{pct}%g</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-0.5 mb-1">
        {EMOJI_COMPACT.map((e) => (
          <button
            key={e.index}
            onClick={() => handleEmoji(e.index)}
            className="w-5 h-5 flex items-center justify-center text-xs bg-hammer-bg border border-hammer-border rounded cursor-pointer hover:bg-hammer-green/10 transition-colors"
            title={e.label}
          >{e.label}</button>
        ))}
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.key}
            onClick={() => handleQC(qa.key)}
            className="px-1 py-0.5 text-2xs font-mono bg-hammer-bg border border-hammer-border rounded text-hammer-text hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
          >{qa.label}</button>
        ))}
        <button
          onClick={handleFullComms}
          className="px-1.5 py-0.5 text-2xs rounded border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
        >Full Comms</button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Selectable player chip — toggle selection, does NOT auto-send
// ---------------------------------------------------------------------------

const SelectableChip = memo(function SelectableChip({
  player,
  selected,
  onToggle,
}: {
  player: PlayerData;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const isBot = !player.clientID;
  const name = player.displayName || player.name || "Unknown";
  return (
    <button
      onClick={() => onToggle(player.id)}
      className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
        selected
          ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
          : "bg-hammer-surface border-hammer-border text-hammer-text hover:border-hammer-muted"
      }`}
      title={`${selected ? "Deselect" : "Select"} ${name}`}
    >
      {isBot && <span className="text-hammer-warn mr-0.5">[BOT]</span>}
      {selected ? "\u2713 " : ""}
      {name}
      <span className="text-hammer-dim ml-1">{short(dTroops(player.troops))}t</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Ally chip for betrayal selection
// ---------------------------------------------------------------------------

const AllySelectChip = memo(function AllySelectChip({
  player,
  selected,
  onToggle,
}: {
  player: PlayerData;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const name = player.displayName || player.name || "Unknown";
  return (
    <button
      onClick={() => onToggle(player.id)}
      className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
        selected
          ? "bg-hammer-red/20 border-hammer-red text-hammer-red"
          : "bg-hammer-surface border-hammer-border text-hammer-text hover:border-hammer-muted"
      }`}
      title={`${selected ? "Deselect" : "Select"} ${name} for betrayal`}
    >
      {selected ? "\u2717 " : ""}
      {name}
      <span className="text-hammer-dim ml-1">{short(dTroops(player.troops))}t</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function AlliancesView() {
  const teammates = useTeammates();
  const allies = useAllies();
  const me = useMyPlayer();
  const playersById = useStore((s) => s.playersById);
  const myTroops = dTroops(me?.troops);
  const myGold = num(me?.gold ?? 0);

  const [showBots, setShowBots] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [betraySelected, setBetraySelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Team health stats
  const teamHealth = useMemo(() => {
    const allMembers = [...teammates, ...(me ? [me as PlayerData] : [])];
    const alive = allMembers.filter((p) => p.isAlive !== false);
    const totalTroops = allMembers.reduce((s, p) => s + dTroops(p.troops), 0);
    const totalGold = allMembers.reduce((s, p) => s + num(p.gold), 0);
    return { total: allMembers.length, alive: alive.length, dead: allMembers.length - alive.length, totalTroops, totalGold };
  }, [teammates, me]);

  // Non-allied, non-team players for alliance requests
  const allianceCandidates = useMemo(() => {
    if (!me) return { humans: [] as PlayerData[], bots: [] as PlayerData[] };
    const tmIds = new Set(teammates.map((p) => p.id));
    const allyIds = new Set(allies.map((p) => p.id));
    const humans: PlayerData[] = [];
    const bots: PlayerData[] = [];

    for (const p of playersById.values()) {
      if (p.id === me.id || !p.isAlive) continue;
      if (tmIds.has(p.id) || allyIds.has(p.id)) continue;
      if (p.team != null && me.team != null && p.team === me.team) continue;
      (p.clientID ? humans : bots).push(p);
    }

    const sortFn = (a: PlayerData, b: PlayerData) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "");
    humans.sort(sortFn);
    bots.sort(sortFn);
    return { humans, bots };
  }, [playersById, me, teammates, allies]);

  const visibleCandidates = useMemo(() => {
    const base = showBots
      ? [...allianceCandidates.humans, ...allianceCandidates.bots]
      : allianceCandidates.humans;
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter((p) => (p.displayName || p.name || "").toLowerCase().includes(q));
  }, [allianceCandidates, showBots, search]);

  // Toggle individual candidate selection
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Toggle individual ally for betrayal
  const toggleBetray = useCallback((id: string) => {
    setBetraySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select all visible candidates
  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of visibleCandidates) next.add(p.id);
      return next;
    });
  }, [visibleCandidates]);

  // Deselect all
  const clearSelected = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Send alliance requests for all selected
  const sendAllySelected = useCallback(() => {
    for (const id of selected) {
      sendAllianceRequest(id);
    }
    setSelected(new Set());
  }, [selected]);

  // Send betray (break alliance) for selected allies
  const sendBetraySelected = useCallback(() => {
    for (const id of betraySelected) {
      sendBetray(id);
    }
    setBetraySelected(new Set());
  }, [betraySelected]);

  // Select all allies for betrayal
  const selectAllAllies = useCallback(() => {
    setBetraySelected(new Set(allies.map((p) => p.id)));
  }, [allies]);

  const clearBetray = useCallback(() => {
    setBetraySelected(new Set());
  }, []);

  const hasAny = teammates.length > 0 || allies.length > 0;
  const selectedCount = [...selected].filter((id) => visibleCandidates.some((p) => p.id === id)).length;

  return (
    <div>
      {!hasAny && (
        <div className="flex flex-col items-center justify-center text-hammer-muted font-mono text-sm py-4">
          <div className="text-base mb-1">No teammates or allies yet</div>
          <div className="text-2xs">Select players below and hit Ally, or wait for team assignment.</div>
        </div>
      )}

      {/* Team Health */}
      {teammates.length > 0 && (
        <CollapseSection title="Team Health">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            <StatCard label="Alive" value={`${teamHealth.alive}/${teamHealth.total}`} color={teamHealth.dead > 0 ? "text-hammer-warn" : "text-hammer-green"} />
            <StatCard label="Dead" value={String(teamHealth.dead)} color={teamHealth.dead > 0 ? "text-hammer-red" : "text-hammer-dim"} />
            <StatCard label="Troops" value={short(teamHealth.totalTroops)} color="text-hammer-blue" />
            <StatCard label="Gold" value={short(teamHealth.totalGold)} color="text-hammer-gold" />
          </div>
        </CollapseSection>
      )}

      {/* Teammates */}
      {teammates.length > 0 && (
        <CollapseSection title="Teammates" count={teammates.length}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1">
            {teammates.map((p) => (
              <PlayerTile key={p.id} player={p} tag="TM" tagColor="border-hammer-blue" myTroops={myTroops} myGold={myGold} />
            ))}
          </div>
        </CollapseSection>
      )}

      {/* Allies — collapsible with betray controls */}
      {allies.length > 0 && (
        <CollapseSection title="Allies" count={allies.length}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1 mb-1.5">
            {allies.map((p) => (
              <PlayerTile key={p.id} player={p} tag="AL" tagColor="border-hammer-green" myTroops={myTroops} myGold={myGold} />
            ))}
          </div>
          {/* Betray controls */}
          <div className="border-t border-hammer-border pt-1.5">
            <div className="flex flex-wrap items-center gap-1 mb-1">
              <span className="text-2xs text-hammer-muted uppercase tracking-wider">Break Alliance:</span>
              <button
                onClick={selectAllAllies}
                className="px-1.5 py-0.5 rounded text-2xs border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text hover:border-hammer-muted transition-colors cursor-pointer"
              >Select All</button>
              <button
                onClick={clearBetray}
                disabled={betraySelected.size === 0}
                className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
                  betraySelected.size > 0
                    ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text"
                    : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
                }`}
              >Clear</button>
              <button
                onClick={sendBetraySelected}
                disabled={betraySelected.size === 0}
                className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ${
                  betraySelected.size > 0
                    ? "bg-hammer-red/20 border-hammer-red text-hammer-red hover:bg-hammer-red/30"
                    : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
                }`}
              >Betray ({betraySelected.size})</button>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {allies.map((p) => (
                <AllySelectChip
                  key={p.id}
                  player={p}
                  selected={betraySelected.has(p.id)}
                  onToggle={toggleBetray}
                />
              ))}
            </div>
          </div>
        </CollapseSection>
      )}

      {/* Alliance Requests — select then act */}
      <CollapseSection title="Alliance Requests">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 mb-1">
          <button
            onClick={selectAllVisible}
            disabled={visibleCandidates.length === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              visibleCandidates.length > 0
                ? "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text hover:border-hammer-muted"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >
            Select All ({visibleCandidates.length})
          </button>
          <button
            onClick={clearSelected}
            disabled={selected.size === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              selected.size > 0
                ? "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >
            Clear
          </button>
          <button
            onClick={() => setShowBots((b) => !b)}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              showBots
                ? "bg-hammer-warn/20 border-hammer-warn text-hammer-warn"
                : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"
            }`}
          >
            {showBots ? "Hide" : "Show"} Bots ({allianceCandidates.bots.length})
          </button>
          <button
            onClick={sendAllySelected}
            disabled={selectedCount === 0}
            className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ml-auto ${
              selectedCount > 0
                ? "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >
            Ally ({selectedCount})
          </button>
        </div>

        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-2 py-1 rounded mb-1 focus:outline-none focus:border-hammer-blue"
        />

        {visibleCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {visibleCandidates.map((p) => (
              <SelectableChip
                key={p.id}
                player={p}
                selected={selected.has(p.id)}
                onToggle={toggleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="text-2xs text-hammer-dim">
            {allianceCandidates.bots.length > 0
              ? "No human players to ally with. Toggle 'Show Bots' to see tribes."
              : "No players available for alliance requests."}
          </div>
        )}
      </CollapseSection>
    </div>
  );
}
