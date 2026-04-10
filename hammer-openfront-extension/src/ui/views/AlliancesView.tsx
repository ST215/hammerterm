import { useState, useCallback, useMemo, memo, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayerStructural, useTeammates, useAllies, useAllAlivePlayers } from "@ui/hooks/usePlayerHelpers";
import { record } from "../../recorder";
import { short, dTroops, num } from "@shared/utils";
import { readMyPlayer } from "@shared/logic/player-helpers";
import { groupByClanTag, groupByTeam } from "@shared/logic/clan-tags";
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

function getMyStats(): { troops: number; gold: number } {
  const s = useStore.getState();
  const me = readMyPlayer(s.lastPlayers, s.playersById, s.currentClientID, s.mySmallID);
  return { troops: dTroops(me?.troops), gold: num(me?.gold ?? 0) };
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapseSection({ title, count, defaultOpen = true, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 first:mt-0" data-section={title}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-xs text-hammer-muted font-medium uppercase tracking-wider mb-1 border-b border-hammer-border pb-0.5 flex items-center justify-between cursor-pointer hover:text-hammer-text transition-colors"
      >
        <span>{open ? "\u25BC" : "\u25B6"} {title}</span>
        {count != null && <span className="text-2xs text-hammer-dim">{count}</span>}
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact player row (replaces the square tile)
// ---------------------------------------------------------------------------

const PlayerRow = memo(function PlayerRow({ player, tag, tagColor }: {
  player: PlayerData; tag: string; tagColor: string;
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

  return (
    <div className={!alive ? "opacity-40" : ""}>
      {/* Compact row — click to expand */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-hammer-surface transition-colors cursor-pointer text-left"
      >
        <span className={`text-2xs font-bold shrink-0 w-6 ${tagColor.replace("border-", "text-")}`}>{tag}</span>
        <span className="text-2xs text-hammer-text truncate flex-1">{name}</span>
        {!alive && <span className="text-2xs text-hammer-red shrink-0">DEAD</span>}
        <span className="text-2xs text-hammer-blue shrink-0 w-10 text-right">{short(troops)}t</span>
        <span className="text-2xs text-hammer-gold shrink-0 w-10 text-right">{short(gold)}g</span>
        <span className="text-2xs text-hammer-dim shrink-0">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {/* Expanded actions */}
      {expanded && (
        <div className="ml-8 mr-1 mb-1 mt-0.5">
          <div className="flex flex-wrap gap-0.5 mb-0.5">
            {SEND_PCTS.map((pct) => (
              <button key={`t${pct}`}
                onClick={() => { const s = getMyStats(); asSendTroops(player.id, Math.floor(s.troops * pct / 100)); }}
                className="text-2xs rounded py-px px-1 border border-hammer-border bg-hammer-bg text-hammer-blue hover:border-hammer-blue transition-colors cursor-pointer"
              >{pct}%t</button>
            ))}
            {SEND_PCTS.map((pct) => (
              <button key={`g${pct}`}
                onClick={() => { const s = getMyStats(); asSendGold(player.id, Math.floor(s.gold * pct / 100)); }}
                className="text-2xs rounded py-px px-1 border border-hammer-border bg-hammer-bg text-hammer-gold hover:border-hammer-gold transition-colors cursor-pointer"
              >{pct}%g</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-0.5">
            {EMOJI_COMPACT.map((e) => (
              <button key={e.index} onClick={() => handleEmoji(e.index)}
                className="w-4 h-4 flex items-center justify-center text-xs bg-hammer-bg border border-hammer-border rounded cursor-pointer hover:bg-hammer-green/10 transition-colors"
                title={e.label}
              >{e.label}</button>
            ))}
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.key} onClick={() => handleQC(qa.key)}
                className="px-1 py-px text-2xs font-mono bg-hammer-bg border border-hammer-border rounded text-hammer-text hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
              >{qa.label}</button>
            ))}
            <button onClick={handleFullComms}
              className="px-1 py-px text-2xs rounded border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-green hover:border-hammer-green transition-colors cursor-pointer"
            >Comms</button>
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Selectable chip
// ---------------------------------------------------------------------------

const SelectableChip = memo(function SelectableChip({ player, selected, onToggle }: {
  player: PlayerData; selected: boolean; onToggle: (id: string) => void;
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
    >
      {isBot && <span className="text-hammer-warn mr-0.5">[BOT]</span>}
      {selected ? "\u2713 " : ""}{name}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function AlliancesView() {
  const avRenders = useRef(0);
  avRenders.current++;
  record("render", "AlliancesView", { n: avRenders.current });

  const teammates = useTeammates();
  const allies = useAllies();
  const me = useMyPlayerStructural();
  const allAlive = useAllAlivePlayers();

  const [showBots, setShowBots] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [betraySelected, setBetraySelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Team health
  const teamHealth = useMemo(() => {
    const allMembers = [...teammates, ...(me ? [me as PlayerData] : [])];
    const alive = allMembers.filter((p) => p.isAlive !== false);
    const totalTroops = allMembers.reduce((s, p) => s + dTroops(p.troops), 0);
    const totalGold = allMembers.reduce((s, p) => s + num(p.gold), 0);
    return { total: allMembers.length, alive: alive.length, dead: allMembers.length - alive.length, totalTroops, totalGold };
  }, [teammates, me]);

  // Alliance candidates
  const allianceCandidates = useMemo(() => {
    if (!me) return { humans: [] as PlayerData[], bots: [] as PlayerData[] };
    const tmIds = new Set(teammates.map((p) => p.id));
    const allyIds = new Set(allies.map((p) => p.id));
    const humans: PlayerData[] = [];
    const bots: PlayerData[] = [];
    for (const p of allAlive) {
      if (p.id === me.id) continue;
      if (tmIds.has(p.id) || allyIds.has(p.id)) continue;
      if (p.team != null && me.team != null && p.team === me.team) continue;
      (p.clientID ? humans : bots).push(p);
    }
    humans.sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
    bots.sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
    return { humans, bots };
  }, [allAlive, me, teammates, allies]);

  const visibleCandidates = useMemo(() => {
    const base = showBots ? [...allianceCandidates.humans, ...allianceCandidates.bots] : allianceCandidates.humans;
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter((p) => (p.displayName || p.name || "").toLowerCase().includes(q));
  }, [allianceCandidates, showBots, search]);

  // Clan tag groups (2+ members only)
  const clanGroups = useMemo(() => groupByClanTag(visibleCandidates), [visibleCandidates]);
  // Team groups
  const teamGroups = useMemo(() => groupByTeam(visibleCandidates), [visibleCandidates]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const toggleBetray = useCallback((id: string) => {
    setBetraySelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const selectAllVisible = useCallback(() => {
    setSelected((prev) => { const n = new Set(prev); for (const p of visibleCandidates) n.add(p.id); return n; });
  }, [visibleCandidates]);
  const selectClan = useCallback((players: PlayerData[]) => {
    setSelected((prev) => { const n = new Set(prev); for (const p of players) n.add(p.id); return n; });
  }, []);
  const selectTeam = useCallback((players: PlayerData[]) => {
    setSelected((prev) => { const n = new Set(prev); for (const p of players) n.add(p.id); return n; });
  }, []);
  const clearSelected = useCallback(() => setSelected(new Set()), []);
  const sendAllySelected = useCallback(() => {
    for (const id of selected) sendAllianceRequest(id);
    setSelected(new Set());
  }, [selected]);
  const sendBetraySelected = useCallback(() => {
    for (const id of betraySelected) sendBetray(id);
    setBetraySelected(new Set());
  }, [betraySelected]);
  const selectAllAllies = useCallback(() => setBetraySelected(new Set(allies.map((p) => p.id))), [allies]);
  const clearBetray = useCallback(() => setBetraySelected(new Set()), []);

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

      {/* Teammates — compact rows */}
      {teammates.length > 0 && (
        <CollapseSection title="Teammates" count={teammates.length}>
          <div className="flex flex-col">
            {teammates.map((p) => (
              <PlayerRow key={p.id} player={p} tag="TM" tagColor="border-hammer-blue" />
            ))}
          </div>
        </CollapseSection>
      )}

      {/* Allies — compact rows + betray */}
      {allies.length > 0 && (
        <CollapseSection title="Allies" count={allies.length}>
          <div className="flex flex-col mb-1">
            {allies.map((p) => (
              <PlayerRow key={p.id} player={p} tag="AL" tagColor="border-hammer-green" />
            ))}
          </div>
          <div className="border-t border-hammer-border pt-1">
            <div className="flex flex-wrap items-center gap-1 mb-1">
              <span className="text-2xs text-hammer-muted uppercase tracking-wider">Break Alliance:</span>
              <button onClick={selectAllAllies}
                className="px-1.5 py-0.5 rounded text-2xs border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text transition-colors cursor-pointer"
              >Select All</button>
              <button onClick={clearBetray} disabled={betraySelected.size === 0}
                className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${betraySelected.size > 0 ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text" : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"}`}
              >Clear</button>
              <button onClick={sendBetraySelected} disabled={betraySelected.size === 0}
                className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ${betraySelected.size > 0 ? "bg-hammer-red/20 border-hammer-red text-hammer-red hover:bg-hammer-red/30" : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"}`}
              >Betray ({betraySelected.size})</button>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {allies.map((p) => {
                const name = p.displayName || p.name || "Unknown";
                const sel = betraySelected.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggleBetray(p.id)}
                    className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${sel ? "bg-hammer-red/20 border-hammer-red text-hammer-red" : "bg-hammer-surface border-hammer-border text-hammer-text hover:border-hammer-muted"}`}
                  >{sel ? "\u2717 " : ""}{name}</button>
                );
              })}
            </div>
          </div>
        </CollapseSection>
      )}

      {/* Alliance Requests */}
      <CollapseSection title="Alliance Requests">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 mb-1">
          <button onClick={selectAllVisible} disabled={visibleCandidates.length === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${visibleCandidates.length > 0 ? "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text" : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"}`}
          >All ({visibleCandidates.length})</button>
          <button onClick={clearSelected} disabled={selected.size === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${selected.size > 0 ? "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text" : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"}`}
          >Clear</button>
          <button onClick={() => setShowBots((b) => !b)}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${showBots ? "bg-hammer-warn/20 border-hammer-warn text-hammer-warn" : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"}`}
          >{showBots ? "Hide" : "Show"} Bots ({allianceCandidates.bots.length})</button>
          <button onClick={sendAllySelected} disabled={selectedCount === 0}
            className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ml-auto ${selectedCount > 0 ? "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30" : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"}`}
          >Ally ({selectedCount})</button>
        </div>

        <input type="text" placeholder="Search players..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-2 py-1 rounded mb-1 focus:outline-none focus:border-hammer-blue"
        />

        {/* Quick select: by team color */}
        {teamGroups.length > 1 && (
          <div className="flex flex-wrap gap-0.5 mb-1">
            <span className="text-2xs text-hammer-dim mr-1">Teams:</span>
            {teamGroups.map((tg) => (
              <button key={String(tg.team)} onClick={() => selectTeam(tg.players)}
                className="px-1.5 py-0.5 rounded text-2xs border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text hover:border-hammer-muted transition-colors cursor-pointer"
              >{String(tg.team)} ({tg.players.length})</button>
            ))}
          </div>
        )}

        {/* Quick select: by clan tag (2+ members) */}
        {clanGroups.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-1">
            <span className="text-2xs text-hammer-dim mr-1">Clans:</span>
            {clanGroups.map((cg) => (
              <button key={cg.tag} onClick={() => selectClan(cg.players)}
                className="px-1.5 py-0.5 rounded text-2xs border border-hammer-blue/30 bg-hammer-surface text-hammer-blue hover:bg-hammer-blue/10 transition-colors cursor-pointer"
              >[{cg.tag}] ({cg.players.length})</button>
            ))}
          </div>
        )}

        {/* Player chips */}
        {visibleCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {visibleCandidates.map((p) => (
              <SelectableChip key={p.id} player={p} selected={selected.has(p.id)} onToggle={toggleSelect} />
            ))}
          </div>
        ) : (
          <div className="text-2xs text-hammer-dim">
            {allianceCandidates.bots.length > 0 ? "No human players to ally with. Toggle 'Show Bots' to see tribes." : "No players available for alliance requests."}
          </div>
        )}
      </CollapseSection>
    </div>
  );
}
