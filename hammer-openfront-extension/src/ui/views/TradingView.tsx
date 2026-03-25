import { useState, useCallback, useMemo, memo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, dTroops, num } from "@shared/utils";
import { sendEmbargoStartNow, sendEmbargoStopNow } from "@content/game/send";
import type { PlayerData } from "@shared/types";

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapseSection({
  title,
  count,
  defaultOpen = true,
  right,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 first:mt-0" data-section={title}>
      <div className="text-xs text-hammer-muted font-medium uppercase tracking-wider mb-1.5 border-b border-hammer-border pb-0.5 flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 cursor-pointer hover:text-hammer-text transition-colors bg-transparent border-none text-inherit font-inherit uppercase tracking-wider"
        >
          <span>{open ? "\u25BC" : "\u25B6"} {title}</span>
          {count != null && (
            <span className="text-2xs text-hammer-dim">({count})</span>
          )}
        </button>
        {right}
      </div>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selectable player chip
// ---------------------------------------------------------------------------

const PlayerChip = memo(function PlayerChip({
  player,
  selected,
  onToggle,
  accent = "green",
  label,
}: {
  player: PlayerData;
  selected: boolean;
  onToggle: (id: string) => void;
  accent?: "green" | "red";
  label?: string;
}) {
  const isBot = !player.clientID;
  const name = player.displayName || player.name || "Unknown";
  const selectedCls =
    accent === "red"
      ? "bg-hammer-red/20 border-hammer-red text-hammer-red"
      : "bg-hammer-green/20 border-hammer-green text-hammer-green";
  return (
    <button
      onClick={() => onToggle(player.id)}
      className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
        selected
          ? selectedCls
          : "bg-hammer-surface border-hammer-border text-hammer-text hover:border-hammer-muted"
      }`}
      title={`${name} — ${short(dTroops(player.troops))}t ${short(num(player.gold))}g`}
    >
      {isBot && <span className="text-hammer-warn mr-0.5">[BOT]</span>}
      {label && <span className={`mr-0.5 ${accent === "red" ? "text-hammer-red" : "text-hammer-green"}`}>[{label}]</span>}
      {selected ? "\u2713 " : ""}
      {name}
      <span className="text-hammer-dim ml-1">{short(dTroops(player.troops))}t</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Main view — Embargo (trade route) management
// ---------------------------------------------------------------------------

export default function TradingView() {
  const me = useMyPlayer();
  const playersById = useStore((s) => s.playersById);
  const teammates = useTeammates();
  const allies = useAllies();

  // Selection for embargo (stop trading)
  const [embargoSelected, setEmbargoSelected] = useState<Set<string>>(new Set());
  // Selection for un-embargo (resume trading)
  const [resumeSelected, setResumeSelected] = useState<Set<string>>(new Set());
  // Track who we've embargoed this session
  const [embargoed, setEmbargoed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Categorize all alive players
  const playerGroups = useMemo(() => {
    if (!me) return { teammates: [] as PlayerData[], allies: [] as PlayerData[], others: [] as PlayerData[] };
    const tmIds = new Set(teammates.map((p) => p.id));
    const allyIds = new Set(allies.map((p) => p.id));
    const others: PlayerData[] = [];
    for (const p of playersById.values()) {
      if (p.id === me.id || !p.isAlive) continue;
      if (tmIds.has(p.id) || allyIds.has(p.id)) continue;
      others.push(p);
    }
    others.sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
    return { teammates, allies, others };
  }, [playersById, me, teammates, allies]);

  const allPlayers = useMemo(() =>
    [...playerGroups.teammates, ...playerGroups.allies, ...playerGroups.others],
    [playerGroups],
  );

  // Players we've embargoed (for the resume section)
  const embargoedPlayers = useMemo(() =>
    allPlayers.filter((p) => embargoed.has(p.id)),
    [allPlayers, embargoed],
  );

  const filteredGroups = useMemo(() => {
    if (!search) return playerGroups;
    const q = search.toLowerCase();
    const match = (p: PlayerData) => (p.displayName || p.name || "").toLowerCase().includes(q);
    return {
      teammates: playerGroups.teammates.filter(match),
      allies: playerGroups.allies.filter(match),
      others: playerGroups.others.filter(match),
    };
  }, [playerGroups, search]);

  // Toggle selection helpers
  const toggleEmbargo = useCallback((id: string) => {
    setEmbargoSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleResume = useCallback((id: string) => {
    setResumeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Quick select for embargo
  const selectNonAllied = useCallback(() => {
    setEmbargoSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.others) next.add(p.id);
      return next;
    });
  }, [playerGroups.others]);

  const selectAllForEmbargo = useCallback(() => {
    setEmbargoSelected(new Set(allPlayers.map((p) => p.id)));
  }, [allPlayers]);

  const selectAlliesForEmbargo = useCallback(() => {
    setEmbargoSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.allies) next.add(p.id);
      return next;
    });
  }, [playerGroups.allies]);

  const selectTeamForEmbargo = useCallback(() => {
    setEmbargoSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.teammates) next.add(p.id);
      return next;
    });
  }, [playerGroups.teammates]);

  const clearEmbargo = useCallback(() => setEmbargoSelected(new Set()), []);
  const clearResume = useCallback(() => setResumeSelected(new Set()), []);

  // Quick select for resume
  const selectNonAlliedForResume = useCallback(() => {
    setResumeSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.others) next.add(p.id);
      return next;
    });
  }, [playerGroups.others]);

  const selectAllForResume = useCallback(() => {
    setResumeSelected(new Set(allPlayers.map((p) => p.id)));
  }, [allPlayers]);

  const selectAlliesForResume = useCallback(() => {
    setResumeSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.allies) next.add(p.id);
      return next;
    });
  }, [playerGroups.allies]);

  const selectTeamForResume = useCallback(() => {
    setResumeSelected((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.teammates) next.add(p.id);
      return next;
    });
  }, [playerGroups.teammates]);

  // Actions — all use immediate sends (no rate limiter delay)
  const doEmbargo = useCallback(() => {
    for (const id of embargoSelected) {
      sendEmbargoStartNow(id);
    }
    setEmbargoed((prev) => {
      const next = new Set(prev);
      for (const id of embargoSelected) next.add(id);
      return next;
    });
    setEmbargoSelected(new Set());
  }, [embargoSelected]);

  const doResume = useCallback(() => {
    for (const id of resumeSelected) {
      sendEmbargoStopNow(id);
    }
    setEmbargoed((prev) => {
      const next = new Set(prev);
      for (const id of resumeSelected) next.delete(id);
      return next;
    });
    setResumeSelected(new Set());
  }, [resumeSelected]);

  // Quick action: resume all players
  const resumeAllPlayers = useCallback(() => {
    for (const p of allPlayers) sendEmbargoStopNow(p.id);
    setEmbargoed(new Set());
  }, [allPlayers]);

  // Quick actions — per-player immediate sends (excludes teammates + allies)
  const embargoAllNonAllied = useCallback(() => {
    for (const p of playerGroups.others) sendEmbargoStartNow(p.id);
    setEmbargoed((prev) => {
      const next = new Set(prev);
      for (const p of playerGroups.others) next.add(p.id);
      return next;
    });
  }, [playerGroups.others]);

  const resumeAll = useCallback(() => {
    for (const id of embargoed) sendEmbargoStopNow(id);
    setEmbargoed(new Set());
  }, [embargoed]);

  const embargoCount = embargoSelected.size;
  const resumeCount = resumeSelected.size;

  return (
    <div>
      {/* Quick Actions */}
      <CollapseSection title="Quick Actions" defaultOpen={true}>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={embargoAllNonAllied}
            disabled={playerGroups.others.length === 0}
            className={`px-2 py-1 rounded text-2xs font-bold border transition-colors cursor-pointer ${
              playerGroups.others.length > 0
                ? "border-hammer-red bg-hammer-red/10 text-hammer-red hover:bg-hammer-red/20"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >Stop Non-Allied ({playerGroups.others.length})</button>
          <button
            onClick={resumeAllPlayers}
            disabled={allPlayers.length === 0}
            className={`px-2 py-1 rounded text-2xs font-bold border transition-colors cursor-pointer ${
              allPlayers.length > 0
                ? "border-hammer-green bg-hammer-green/10 text-hammer-green hover:bg-hammer-green/20"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >Resume All ({allPlayers.length})</button>
        </div>
      </CollapseSection>

      {/* Stop Trading — select players to embargo */}
      <CollapseSection title="Stop Trading" defaultOpen={true}>
        <div className="flex flex-wrap items-center gap-1 mb-1">
          {playerGroups.others.length > 0 && (
            <button
              onClick={selectNonAllied}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text transition-colors cursor-pointer"
            >Non-Allied</button>
          )}
          {playerGroups.allies.length > 0 && (
            <button
              onClick={selectAlliesForEmbargo}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-green/50 bg-hammer-surface text-hammer-green hover:bg-hammer-green/10 transition-colors cursor-pointer"
            >Allies</button>
          )}
          {playerGroups.teammates.length > 0 && (
            <button
              onClick={selectTeamForEmbargo}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-blue/50 bg-hammer-surface text-hammer-blue hover:bg-hammer-blue/10 transition-colors cursor-pointer"
            >Team</button>
          )}
          <button
            onClick={selectAllForEmbargo}
            disabled={allPlayers.length === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              allPlayers.length > 0
                ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >All</button>
          <button
            onClick={clearEmbargo}
            disabled={embargoCount === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              embargoCount > 0
                ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >Clear</button>
          <button
            onClick={doEmbargo}
            disabled={embargoCount === 0}
            className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ml-auto ${
              embargoCount > 0
                ? "bg-hammer-red/20 border-hammer-red text-hammer-red hover:bg-hammer-red/30"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >Stop Trading ({embargoCount})</button>
        </div>

          {/* Search */}
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-2 py-1 rounded mb-1 focus:outline-none focus:border-hammer-blue"
        />

        {/* Player chips by group */}
        {filteredGroups.teammates.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-blue mb-0.5">Teammates</div>
            <div className="flex flex-wrap gap-0.5">
              {filteredGroups.teammates.map((p) => (
                <PlayerChip key={p.id} player={p} selected={embargoSelected.has(p.id)} onToggle={toggleEmbargo} accent="red" />
              ))}
            </div>
          </div>
        )}
        {filteredGroups.allies.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-green mb-0.5">Allies</div>
            <div className="flex flex-wrap gap-0.5">
              {filteredGroups.allies.map((p) => (
                <PlayerChip key={p.id} player={p} selected={embargoSelected.has(p.id)} onToggle={toggleEmbargo} accent="red" />
              ))}
            </div>
          </div>
        )}
        {filteredGroups.others.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-muted mb-0.5">Others ({filteredGroups.others.length})</div>
            <div className="flex flex-wrap gap-0.5">
              {filteredGroups.others.map((p) => (
                <PlayerChip key={p.id} player={p} selected={embargoSelected.has(p.id)} onToggle={toggleEmbargo} accent="red" />
              ))}
            </div>
          </div>
        )}
        {allPlayers.length === 0 && (
          <div className="text-2xs text-hammer-dim">No players available.</div>
        )}
      </CollapseSection>

      {/* Resume Trading — select players to un-embargo */}
      <CollapseSection title="Resume Trading" defaultOpen={false}>
        <div className="flex flex-wrap items-center gap-1 mb-1">
          {playerGroups.others.length > 0 && (
            <button
              onClick={selectNonAlliedForResume}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text transition-colors cursor-pointer"
            >Non-Allied</button>
          )}
          {playerGroups.allies.length > 0 && (
            <button
              onClick={selectAlliesForResume}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-green/50 bg-hammer-surface text-hammer-green hover:bg-hammer-green/10 transition-colors cursor-pointer"
            >Allies</button>
          )}
          {playerGroups.teammates.length > 0 && (
            <button
              onClick={selectTeamForResume}
              className="px-1.5 py-0.5 rounded text-2xs border border-hammer-blue/50 bg-hammer-surface text-hammer-blue hover:bg-hammer-blue/10 transition-colors cursor-pointer"
            >Team</button>
          )}
          <button
            onClick={selectAllForResume}
            disabled={allPlayers.length === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              allPlayers.length > 0
                ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >All</button>
          <button
            onClick={clearResume}
            disabled={resumeCount === 0}
            className={`px-1.5 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              resumeCount > 0
                ? "border-hammer-border bg-hammer-surface text-hammer-muted hover:text-hammer-text"
                : "border-hammer-border bg-hammer-surface text-hammer-dim cursor-not-allowed"
            }`}
          >Clear</button>
          <button
            onClick={doResume}
            disabled={resumeCount === 0}
            className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ml-auto ${
              resumeCount > 0
                ? "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >Resume Trading ({resumeCount})</button>
        </div>

        {/* Player chips by group */}
        {playerGroups.teammates.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-blue mb-0.5">Teammates</div>
            <div className="flex flex-wrap gap-0.5">
              {playerGroups.teammates.map((p) => (
                <PlayerChip key={p.id} player={p} selected={resumeSelected.has(p.id)} onToggle={toggleResume} accent="green" />
              ))}
            </div>
          </div>
        )}
        {playerGroups.allies.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-green mb-0.5">Allies</div>
            <div className="flex flex-wrap gap-0.5">
              {playerGroups.allies.map((p) => (
                <PlayerChip key={p.id} player={p} selected={resumeSelected.has(p.id)} onToggle={toggleResume} accent="green" />
              ))}
            </div>
          </div>
        )}
        {playerGroups.others.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-muted mb-0.5">Others ({playerGroups.others.length})</div>
            <div className="flex flex-wrap gap-0.5">
              {playerGroups.others.map((p) => (
                <PlayerChip key={p.id} player={p} selected={resumeSelected.has(p.id)} onToggle={toggleResume} accent="green" />
              ))}
            </div>
          </div>
        )}
        {allPlayers.length === 0 && (
          <div className="text-2xs text-hammer-dim">No players available.</div>
        )}
      </CollapseSection>
    </div>
  );
}
