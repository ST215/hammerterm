import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { fmtDuration } from "@shared/utils";
import { sendEmoji, sendQuickChat } from "@content/game/send";

const EMOJI_LIST = [
  "\u{1F44D}", "\u2764\uFE0F", "\u{1F525}", "\u2B50", "\u{1F602}", "\u{1F622}", "\u{1F4AA}", "\u{1F3AF}", "\u2694\uFE0F", "\u{1F6E1}\uFE0F",
  "\u{1F3F4}", "\u{1F3F3}\uFE0F", "\u{1F4B0}", "\u{1F451}", "\u{1F48E}", "\u{1F389}", "\u2705", "\u274C", "\u26A1", "\u{1F480}",
  "\u{1F91D}", "\u{1F64F}", "\u{1F44B}", "\u{1FAE1}", "\u{1F608}", "\u{1F40D}", "\u{1F981}", "\u{1F43A}", "\u{1F3C6}", "\u{1F4A3}",
];

interface QCCategory {
  label: string;
  items: { key: string; label: string; needsTarget?: boolean }[];
}

const QC_CATEGORIES: QCCategory[] = [
  {
    label: "Greetings",
    items: [
      { key: "hello", label: "Hello" },
      { key: "gl_hf", label: "GL HF" },
      { key: "well_played", label: "Well Played" },
    ],
  },
  {
    label: "Help",
    items: [
      { key: "send_troops", label: "Send Troops" },
      { key: "send_gold", label: "Send Gold" },
      { key: "help", label: "Help" },
      { key: "help_defend", label: "Help Defend" },
    ],
  },
  {
    label: "Attack",
    items: [
      { key: "attack", label: "Attack", needsTarget: true },
      { key: "lets_attack_together", label: "Let's Attack Together", needsTarget: true },
    ],
  },
  {
    label: "Defend",
    items: [
      { key: "defend", label: "Defend", needsTarget: true },
      { key: "lets_defend_together", label: "Let's Defend Together", needsTarget: true },
    ],
  },
  {
    label: "Misc",
    items: [
      { key: "thanks", label: "Thanks" },
      { key: "gg", label: "GG" },
      { key: "yes", label: "Yes" },
      { key: "no", label: "No" },
    ],
  },
];

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export default function CommsView() {
  const currentClientID = useStore((s) => s.currentClientID);
  const commsTargets = useStore((s) => s.commsTargets);
  const commsGroupMode = useStore((s) => s.commsGroupMode);
  const commsOthersExpanded = useStore((s) => s.commsOthersExpanded);
  const commsPendingQC = useStore((s) => s.commsPendingQC);
  const commsRecentSent = useStore((s) => s.commsRecentSent);
  const playersById = useStore((s) => s.playersById);
  const myTeam = useStore((s) => s.myTeam);
  const myAllies = useStore((s) => s.myAllies);

  const addTarget = useStore((s) => s.addCommsTarget);
  const removeTarget = useStore((s) => s.removeCommsTarget);
  const clearTargets = useStore((s) => s.clearCommsTargets);
  const setGroupMode = useStore((s) => s.setCommsGroupMode);
  const toggleOthers = useStore((s) => s.toggleCommsOthersExpanded);
  const setPendingQC = useStore((s) => s.setCommsPendingQC);
  const addRecentSent = useStore((s) => s.addCommsRecentSent);

  const me = useMyPlayer();
  const teammates = useTeammates();
  const allies = useAllies();

  const isConnected = currentClientID != null && currentClientID !== "";

  // Others: alive non-team, non-ally players
  const others = [...playersById.values()].filter((p) => {
    if (!p.isAlive || !me || p.id === me.id) return false;
    if (p.team != null && myTeam != null && p.team === myTeam) return false;
    if (p.smallID != null && myAllies.has(p.smallID)) return false;
    return true;
  });

  function toggleTarget(id: string) {
    if (commsTargets.has(id)) removeTarget(id);
    else addTarget(id);
  }

  function handleGroupSelect(mode: string) {
    setGroupMode(mode);
    clearTargets();
    if (mode === "all") {
      for (const p of playersById.values()) {
        if (p.isAlive && me && p.id !== me.id) addTarget(p.id);
      }
    } else if (mode === "team") {
      for (const p of teammates) addTarget(p.id);
    } else if (mode === "allies") {
      for (const p of allies) addTarget(p.id);
    } else if (mode === "others") {
      for (const p of others) addTarget(p.id);
    }
    // "clear" just clears
  }

  function handleSendEmoji(emojiIdx: number) {
    if (commsTargets.size === 0) return;
    for (const tid of commsTargets) {
      sendEmoji(tid, emojiIdx);
    }
    const emoji = EMOJI_LIST[emojiIdx] || "?";
    addRecentSent({ type: "emoji", label: emoji, targetName: `${commsTargets.size} players`, ts: Date.now() });
  }

  function handleSendQC(key: string, label: string, needsTarget?: boolean) {
    if (commsTargets.size === 0) return;
    if (needsTarget) {
      setPendingQC({ key, targetId: "" });
      return;
    }
    for (const tid of commsTargets) {
      sendQuickChat(tid, key);
    }
    addRecentSent({ type: "qc", label, targetName: `${commsTargets.size} players`, ts: Date.now() });
  }

  function handlePendingTargetSelect(targetId: string) {
    if (!commsPendingQC) return;
    for (const tid of commsTargets) {
      sendQuickChat(tid, commsPendingQC.key, targetId);
    }
    const cat = QC_CATEGORIES.flatMap((c) => c.items).find((it) => it.key === commsPendingQC.key);
    addRecentSent({
      type: "qc",
      label: cat?.label || commsPendingQC.key,
      targetName: `${commsTargets.size} players`,
      ts: Date.now(),
    });
    setPendingQC(null);
  }

  // Target picker mode
  if (commsPendingQC) {
    const allPlayers = [...playersById.values()].filter(
      (p) => p.isAlive && me && p.id !== me.id,
    );
    return (
      <div className="flex flex-col gap-8 p-8">
        <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
          <div className="text-hammer-gold text-sm font-bold">
            Select Target Player
          </div>
          <div className="text-hammer-muted text-xs">
            Choose a player to target with the quick chat command.
          </div>
          <div className="flex flex-wrap gap-4">
            {allPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePendingTargetSelect(p.id)}
                className="px-8 py-4 text-xs font-mono border border-hammer-border bg-hammer-bg text-hammer-text cursor-pointer hover:bg-hammer-green/10 hover:text-hammer-green"
              >
                {p.displayName || p.name || `ID:${p.smallID}`}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPendingQC(null)}
            className="px-8 py-4 text-xs font-mono border border-hammer-border bg-hammer-bg text-hammer-red cursor-pointer hover:bg-hammer-red/10 self-start"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Connection Status */}
      <div className="flex items-center gap-4">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: isConnected ? "#7ff2a3" : "#ff6b6b" }}
        />
        <span className="text-hammer-text text-xs">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Send To */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-hammer-green text-sm font-bold">Send To</span>
            <span className="text-hammer-muted text-xs">({commsTargets.size} selected)</span>
          </div>
        </div>

        {/* Group buttons */}
        <div className="flex flex-wrap gap-4">
          {(["all", "team", "allies", "others", "clear"] as const).map((g) => (
            <button
              key={g}
              onClick={() => handleGroupSelect(g)}
              className={`px-8 py-4 text-xs font-mono border-none cursor-pointer ${
                commsGroupMode === g
                  ? "bg-hammer-green/20 text-hammer-green"
                  : "bg-transparent text-hammer-muted hover:text-hammer-text"
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>

        {/* Team section */}
        {teammates.length > 0 && (
          <div className="flex flex-col gap-4">
            <span className="text-hammer-blue text-xs font-bold">Team</span>
            <div className="flex flex-wrap gap-4">
              {teammates.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTarget(p.id)}
                  className={`px-8 py-4 text-xs font-mono border border-hammer-border cursor-pointer ${
                    commsTargets.has(p.id)
                      ? "bg-hammer-green/20 text-hammer-green"
                      : "bg-hammer-bg text-hammer-text hover:bg-hammer-blue/10"
                  }`}
                >
                  {p.displayName || p.name || `ID:${p.smallID}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Allies section */}
        {allies.length > 0 && (
          <div className="flex flex-col gap-4">
            <span className="text-hammer-green text-xs font-bold">Allies</span>
            <div className="flex flex-wrap gap-4">
              {allies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTarget(p.id)}
                  className={`px-8 py-4 text-xs font-mono border border-hammer-border cursor-pointer ${
                    commsTargets.has(p.id)
                      ? "bg-hammer-green/20 text-hammer-green"
                      : "bg-hammer-bg text-hammer-text hover:bg-hammer-green/10"
                  }`}
                >
                  {p.displayName || p.name || `ID:${p.smallID}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Others section */}
        <div className="flex flex-col gap-4">
          <button
            onClick={toggleOthers}
            className="flex items-center gap-4 bg-transparent border-none cursor-pointer p-0 text-left"
          >
            <span className="text-hammer-muted text-xs font-bold">
              Others ({others.length})
            </span>
            <span className="text-hammer-muted text-xs">
              {commsOthersExpanded ? "\u25BC" : "\u25B6"}
            </span>
          </button>
          {commsOthersExpanded && (
            <div className="flex flex-wrap gap-4">
              {others.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTarget(p.id)}
                  className={`px-8 py-4 text-xs font-mono border border-hammer-border cursor-pointer ${
                    commsTargets.has(p.id)
                      ? "bg-hammer-green/20 text-hammer-green"
                      : "bg-hammer-bg text-hammer-text hover:bg-hammer-bg"
                  }`}
                >
                  {p.displayName || p.name || `ID:${p.smallID}`}
                </button>
              ))}
              {others.length === 0 && (
                <span className="text-hammer-muted text-xs">No other players.</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Emojis */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
        <div className="text-hammer-green text-sm font-bold">Emojis</div>
        <div className="flex flex-wrap gap-4">
          {EMOJI_LIST.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleSendEmoji(idx)}
              className="w-8 h-8 flex items-center justify-center text-sm bg-hammer-bg border border-hammer-border cursor-pointer hover:bg-hammer-green/10"
              title={emoji}
              disabled={commsTargets.size === 0}
            >
              {emoji}
            </button>
          ))}
        </div>
        {commsTargets.size === 0 && (
          <span className="text-hammer-muted text-xs">Select targets to send emojis.</span>
        )}
      </div>

      {/* Quick Chat */}
      <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-8">
        <div className="text-hammer-green text-sm font-bold">Quick Chat</div>
        {QC_CATEGORIES.map((cat) => (
          <div key={cat.label} className="flex flex-col gap-4">
            <span className="text-hammer-muted text-xs font-bold">{cat.label}</span>
            <div className="flex flex-wrap gap-4">
              {cat.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleSendQC(item.key, item.label, item.needsTarget)}
                  className="px-8 py-4 text-xs font-mono border border-hammer-border bg-hammer-bg text-hammer-text cursor-pointer hover:bg-hammer-blue/10 hover:text-hammer-blue disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={commsTargets.size === 0}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {commsTargets.size === 0 && (
          <span className="text-hammer-muted text-xs">Select targets to send quick chats.</span>
        )}
      </div>

      {/* Recent Sent */}
      {commsRecentSent.length > 0 && (
        <div className="bg-hammer-card border border-hammer-border p-8 flex flex-col gap-4">
          <div className="text-hammer-green text-sm font-bold">Recent Sent</div>
          {commsRecentSent.slice(0, 15).map((entry, i) => (
            <div key={i} className="flex items-center gap-8 text-xs">
              <span className="text-hammer-muted">{timeAgo(entry.ts)}</span>
              <span className="text-hammer-text">
                {entry.type === "emoji" ? entry.label : `"${entry.label}"`}
              </span>
              <span className="text-hammer-muted">{"\u2192"} {entry.targetName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
