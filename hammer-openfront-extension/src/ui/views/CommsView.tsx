import { useState, useMemo, useRef } from "react";
import { useStore } from "@store/index";
import { useMyPlayerStructural, useTeammates, useAllies, useAllAlivePlayers } from "@ui/hooks/usePlayerHelpers";
import { record } from "../../recorder";
import { useContentWidth } from "@ui/hooks/useContentWidth";
import { groupByClanTag } from "@shared/logic/clan-tags";
import { sendEmoji, sendQuickChat } from "@content/game/send";
import { EMOJI_TABLE } from "@shared/emoji-table";
import { Section, PresetButton, PretextText } from "@ui/components/ds";
import { TargetTag } from "@ui/components/TargetTag";
import { timeAgo } from "@shared/ui-helpers";
import type { PlayerData } from "@shared/types";

// All quickchat items from the game, organized by category
const QC_NEEDS_TARGET = new Set([
  "help.help_defend",
  "attack.attack", "attack.mirv", "attack.focus", "attack.finish",
  "defend.defend", "defend.defend_from", "defend.dont_attack", "defend.ally",
  "misc.team_up",
  "warnings.strong", "warnings.weak", "warnings.mirv_soon",
  "warnings.has_allies", "warnings.no_allies",
  "warnings.betrayed", "warnings.betrayed_me",
  "warnings.getting_big", "warnings.danger_base",
  "warnings.saving_for_mirv", "warnings.mirv_ready",
  "warnings.snowballing", "warnings.cheating", "warnings.stop_trading",
]);

interface QCCategory {
  title: string;
  prefix: string;
  keys: string[];
}

const QC_CATEGORIES: QCCategory[] = [
  {
    title: "Greetings",
    prefix: "greet",
    keys: [
      "hello", "good_job", "good_luck", "have_fun", "gg",
      "nice_to_meet", "well_played", "hi_again", "bye", "thanks",
      "oops", "trust_me", "trust_broken", "ruining_games", "dont_do_that", "same_team",
    ],
  },
  {
    title: "Help",
    prefix: "help",
    keys: [
      "troops", "troops_frontlines", "gold", "no_attack",
      "sorry_attack", "alliance", "help_defend", "trade_partners",
    ],
  },
  {
    title: "Attack",
    prefix: "attack",
    keys: ["attack", "mirv", "focus", "finish", "build_warships"],
  },
  {
    title: "Defend",
    prefix: "defend",
    keys: ["defend", "defend_from", "dont_attack", "ally", "build_posts"],
  },
  {
    title: "Misc",
    prefix: "misc",
    keys: ["go", "strategy", "fun", "team_up", "pr", "build_closer", "coastline"],
  },
  {
    title: "Warnings",
    prefix: "warnings",
    keys: [
      "strong", "weak", "mirv_soon", "number1_warning", "stalemate",
      "has_allies", "no_allies", "betrayed", "betrayed_me",
      "getting_big", "danger_base", "saving_for_mirv", "mirv_ready",
      "snowballing", "cheating", "stop_trading",
    ],
  },
];

function keyToLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const GROUP_MODES = ["team", "allies", "all", "others", "clear"] as const;

export default function CommsView() {
  const cvRenders = useRef(0);
  cvRenders.current++;
  record("render", "CommsView", { n: cvRenders.current });

  const contentWidth = useContentWidth();
  const commsTargets = useStore((s) => s.commsTargets);
  const commsGroupMode = useStore((s) => s.commsGroupMode);
  const commsRecentSent = useStore((s) => s.commsRecentSent);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);
  const allAlivePlayers = useAllAlivePlayers();

  const addTarget = useStore((s) => s.addCommsTarget);
  const removeTarget = useStore((s) => s.removeCommsTarget);
  const clearTargets = useStore((s) => s.clearCommsTargets);
  const setGroupMode = useStore((s) => s.setCommsGroupMode);
  const addRecentSent = useStore((s) => s.addCommsRecentSent);

  const me = useMyPlayerStructural();
  const teammates = useTeammates();
  const allies = useAllies();

  const [pendingQCKey, setPendingQCKey] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [showBots, setShowBots] = useState(false);
  const [search, setSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");

  const { otherHumans, otherBots } = useMemo(() => {
    const humans: PlayerData[] = [];
    const bots: PlayerData[] = [];
    for (const p of allAlivePlayers) {
      if (!me || p.id === me.id) continue;
      if (p.team != null && myTeam != null && p.team === myTeam) continue;
      if (p.smallID != null && myAllies.has(p.smallID)) continue;
      if (p.clientID) humans.push(p);
      else bots.push(p);
    }
    const sortName = (a: PlayerData, b: PlayerData) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "");
    humans.sort(sortName);
    bots.sort(sortName);
    return { otherHumans: humans, otherBots: bots };
  }, [allAlivePlayers, me, myTeam, myAllies]);

  const others = showBots ? [...otherHumans, ...otherBots] : otherHumans;

  const q = search.toLowerCase();
  const matchName = (p: PlayerData) =>
    !q || (p.displayName || p.name || "").toLowerCase().includes(q);
  const filteredTeammates = teammates.filter(matchName);
  const filteredAllies = allies.filter(matchName);
  const filteredOthers = others.filter(matchName);
  const shouldShowOthers = showOthers || (q.length > 0 && filteredOthers.length > 0);

  const selectedPlayers = useMemo(() => {
    if (commsTargets.size === 0) return [];
    // Non-reactive read — only recomputes when commsTargets changes (user action)
    const pMap = useStore.getState().playersById;
    const result: { id: string; name: string; type?: "TM" | "AL" }[] = [];
    for (const tid of commsTargets) {
      const p = pMap.get(tid);
      if (!p) continue;
      const isTeam = p.team != null && myTeam != null && p.team === myTeam;
      const isAlly = p.smallID != null && myAllies.has(p.smallID);
      result.push({
        id: p.id,
        name: p.displayName || p.name || `#${p.smallID}`,
        type: isTeam ? "TM" : isAlly ? "AL" : undefined,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [commsTargets, myTeam, myAllies]);

  function toggleTarget(id: string) {
    if (commsTargets.has(id)) {
      removeTarget(id);
    } else {
      addTarget(id);
      setSearch("");
    }
  }

  function handleGroupSelect(mode: string) {
    setGroupMode(mode);
    clearTargets();
    if (mode === "all") {
      for (const p of allAlivePlayers) addTarget(p.id);
    } else if (mode === "team") {
      for (const p of teammates) addTarget(p.id);
    } else if (mode === "allies") {
      for (const p of allies) addTarget(p.id);
    } else if (mode === "others") {
      for (const p of others) addTarget(p.id);
    }
  }

  function handleSendEmoji(idx: number) {
    if (commsTargets.size === 0) return;
    for (const tid of commsTargets) sendEmoji(tid, idx);
    addRecentSent({
      type: "emoji",
      label: EMOJI_TABLE[idx] || "?",
      targetName: `${commsTargets.size} player${commsTargets.size > 1 ? "s" : ""}`,
      ts: Date.now(),
    });
  }

  function handleSendQC(fullKey: string) {
    if (commsTargets.size === 0) return;
    if (QC_NEEDS_TARGET.has(fullKey)) {
      setPendingQCKey(fullKey);
      return;
    }
    for (const tid of commsTargets) sendQuickChat(tid, fullKey);
    const label = fullKey.split(".")[1] || fullKey;
    addRecentSent({
      type: "qc",
      label: keyToLabel(label),
      targetName: `${commsTargets.size} player${commsTargets.size > 1 ? "s" : ""}`,
      ts: Date.now(),
    });
  }

  function handlePendingTarget(targetId: string) {
    if (!pendingQCKey) return;
    for (const tid of commsTargets) sendQuickChat(tid, pendingQCKey, targetId);
    const label = pendingQCKey.split(".")[1] || pendingQCKey;
    addRecentSent({
      type: "qc",
      label: keyToLabel(label),
      targetName: `${commsTargets.size} player${commsTargets.size > 1 ? "s" : ""}`,
      ts: Date.now(),
    });
    setPendingQCKey(null);
  }

  const noTargets = commsTargets.size === 0;

  // Pending target picker overlay
  if (pendingQCKey) {
    const tq = targetSearch.toLowerCase();
    const filteredTargets = tq
      ? allAlivePlayers.filter((p) => (p.displayName || p.name || "").toLowerCase().includes(tq))
      : allAlivePlayers;
    const label = pendingQCKey.split(".")[1] || pendingQCKey;
    return (
      <div>
        <Section title={`Target: ${keyToLabel(label)}`}>
          <div className="text-2xs text-hammer-muted mb-1">
            Select a player to target
          </div>
          <input
            type="text"
            placeholder="Search players..."
            value={targetSearch}
            onChange={(e) => setTargetSearch(e.target.value)}
            className="w-full bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-2 py-1 rounded mb-1 focus:outline-none focus:border-hammer-blue"
          />
          <div className="flex flex-wrap gap-0.5">
            {filteredTargets.map((p) => {
              const isTeam = p.team != null && myTeam != null && p.team === myTeam;
              const isAlly = p.smallID != null && myAllies.has(p.smallID);
              const color = isTeam ? "text-hammer-blue" : isAlly ? "text-hammer-green" : "text-hammer-text";
              return (
                <button
                  key={p.id}
                  onClick={() => { handlePendingTarget(p.id); setTargetSearch(""); }}
                  className={`px-1.5 py-0.5 text-2xs font-mono border border-hammer-border bg-hammer-bg cursor-pointer hover:bg-hammer-green/10 hover:text-hammer-green transition-colors rounded ${color}`}
                >
                  {p.displayName || p.name || `#${p.smallID}`}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { setPendingQCKey(null); setTargetSearch(""); }}
            className="mt-1.5 px-2 py-0.5 text-2xs border border-hammer-red/40 bg-hammer-red/10 text-hammer-red rounded cursor-pointer"
          >
            Cancel
          </button>
        </Section>
      </div>
    );
  }

  return (
    <div>
      {/* Send To */}
      <Section title="Send To" count={commsTargets.size}>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-hammer-bg border border-hammer-border text-hammer-text text-2xs px-2 py-1 rounded mb-1.5 focus:outline-none focus:border-hammer-blue"
        />
        {selectedPlayers.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-1.5">
            {selectedPlayers.map((t) => (
              <TargetTag
                key={t.id}
                target={t}
                onRemove={() => removeTarget(t.id)}
              />
            ))}
            <button
              onClick={clearTargets}
              className="px-1 py-0.5 text-2xs text-hammer-red border border-hammer-red/30 rounded cursor-pointer hover:bg-hammer-red/10 transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 mb-1.5">
          {GROUP_MODES.map((g) => (
            <PresetButton
              key={g}
              label={g === "clear" ? "Clear" : g.charAt(0).toUpperCase() + g.slice(1)}
              active={commsGroupMode === g}
              onClick={() => handleGroupSelect(g)}
            />
          ))}
        </div>

        {filteredTeammates.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-blue font-bold mb-0.5">Team ({filteredTeammates.length})</div>
            <div className="flex flex-wrap gap-0.5">
              {filteredTeammates.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTarget(p.id)}
                  className={`px-1.5 py-0.5 text-2xs font-mono border rounded cursor-pointer transition-colors ${
                    commsTargets.has(p.id)
                      ? "bg-hammer-blue/20 border-hammer-blue text-hammer-blue"
                      : "bg-hammer-bg border-hammer-border text-hammer-text hover:border-hammer-blue"
                  }`}
                >
                  {p.displayName || p.name || `#${p.smallID}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredAllies.length > 0 && (
          <div className="mb-1">
            <div className="text-2xs text-hammer-green font-bold mb-0.5">Allies ({filteredAllies.length})</div>
            <div className="flex flex-wrap gap-0.5">
              {filteredAllies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTarget(p.id)}
                  className={`px-1.5 py-0.5 text-2xs font-mono border rounded cursor-pointer transition-colors ${
                    commsTargets.has(p.id)
                      ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
                      : "bg-hammer-bg border-hammer-border text-hammer-text hover:border-hammer-green"
                  }`}
                >
                  {p.displayName || p.name || `#${p.smallID}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clan tag groups (2+ members) — between allies and others */}
        {(() => {
          const allNonTeam = [...filteredAllies, ...filteredOthers];
          const clans = groupByClanTag(allNonTeam);
          if (clans.length === 0) return null;
          return (
            <div className="mb-1">
              <div className="text-2xs text-hammer-purple font-bold mb-0.5">Clans</div>
              <div className="flex flex-wrap gap-0.5">
                {clans.map((cg) => {
                  const allSelected = cg.players.every((p) => commsTargets.has(p.id));
                  return (
                    <button
                      key={cg.tag}
                      onClick={() => {
                        if (allSelected) {
                          for (const p of cg.players) removeTarget(p.id);
                        } else {
                          for (const p of cg.players) addTarget(p.id);
                        }
                      }}
                      className={`px-1.5 py-0.5 text-2xs font-mono border rounded cursor-pointer transition-colors ${
                        allSelected
                          ? "bg-hammer-purple/20 border-hammer-purple text-hammer-purple"
                          : "bg-hammer-bg border-hammer-border text-hammer-muted hover:border-hammer-purple hover:text-hammer-purple"
                      }`}
                    >
                      [{cg.tag}] ({cg.players.length})
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {(otherHumans.length > 0 || otherBots.length > 0) && (
          <div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowOthers(!showOthers)}
                className="text-2xs text-hammer-muted hover:text-hammer-text bg-transparent border-none cursor-pointer p-0 font-mono"
              >
                Others ({filteredOthers.length}) {shouldShowOthers ? "\u25BC" : "\u25B6"}
              </button>
              {shouldShowOthers && otherBots.length > 0 && (
                <button
                  onClick={() => setShowBots((b) => !b)}
                  className={`px-1 py-0 rounded text-2xs border transition-colors cursor-pointer ${
                    showBots
                      ? "border-hammer-warn text-hammer-warn"
                      : "border-hammer-border text-hammer-dim hover:text-hammer-muted"
                  }`}
                >
                  {showBots ? "Hide" : "Show"} Bots ({otherBots.length})
                </button>
              )}
            </div>
            {shouldShowOthers && (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {filteredOthers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleTarget(p.id)}
                    className={`px-1.5 py-0.5 text-2xs font-mono border rounded cursor-pointer transition-colors ${
                      commsTargets.has(p.id)
                        ? "bg-hammer-green/20 border-hammer-green text-hammer-green"
                        : "bg-hammer-bg border-hammer-border text-hammer-muted hover:text-hammer-text"
                    }`}
                  >
                    {!p.clientID && <span className="text-hammer-warn mr-0.5">[BOT]</span>}
                    {p.displayName || p.name || `#${p.smallID}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {noTargets && (
          <div className="text-2xs text-hammer-dim mt-1">Select targets to send messages.</div>
        )}
      </Section>

      {/* Emojis — bigger, tighter grid */}
      <Section title="Emojis">
        <div className="grid grid-cols-10 gap-px">
          {EMOJI_TABLE.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleSendEmoji(idx)}
              className="w-8 h-8 flex items-center justify-center text-lg bg-hammer-bg border border-hammer-border cursor-pointer hover:bg-hammer-green/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={emoji}
              disabled={noTargets}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>

      {/* Quick Chat — all 72 items */}
      <Section title="Quick Chat">
        <div className="text-2xs text-hammer-dim mb-1">Target items shown in gold</div>
        {QC_CATEGORIES.map((cat) => (
          <div key={cat.prefix} className="mb-1.5 last:mb-0">
            <div className="text-2xs text-hammer-muted font-bold mb-0.5">{cat.title}</div>
            <div className="flex flex-wrap gap-px">
              {cat.keys.map((key) => {
                const fullKey = `${cat.prefix}.${key}`;
                const needsTarget = QC_NEEDS_TARGET.has(fullKey);
                return (
                  <button
                    key={fullKey}
                    onClick={() => handleSendQC(fullKey)}
                    className={`px-1 py-0.5 text-2xs font-mono border bg-hammer-bg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      needsTarget
                        ? "border-hammer-gold/30 text-hammer-gold hover:border-hammer-gold hover:bg-hammer-gold/10"
                        : "border-hammer-border text-hammer-text hover:border-hammer-blue hover:text-hammer-blue"
                    }`}
                    disabled={noTargets}
                  >
                    {keyToLabel(key)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      {/* Recent */}
      {commsRecentSent.length > 0 && (
        <Section title="Recent" count={commsRecentSent.length}>
          <div className="flex flex-col gap-0.5">
            {commsRecentSent.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5 text-2xs">
                <span className="text-hammer-dim w-3 text-right">{timeAgo(entry.ts)}</span>
                <span className="text-hammer-text">
                  {entry.type === "emoji" ? entry.label : `"${entry.label}"`}
                </span>
                <PretextText text={`\u2192 ${entry.targetName}`} size="2xs" maxWidth={contentWidth * 0.4} className="text-hammer-dim" as="span" />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
