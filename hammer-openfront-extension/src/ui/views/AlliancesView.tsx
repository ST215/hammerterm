import { useState, useCallback, useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer, useTeammates, useAllies } from "@ui/hooks/usePlayerHelpers";
import { short, dTroops, num } from "@shared/utils";
import { sendEmoji, sendQuickChat, asSendTroops, asSendGold, sendAllianceRequest } from "@content/game/send";
import { EMOJI_COMPACT } from "@shared/emoji-table";
import { Section, StatCard, Badge } from "@ui/components/ds";
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

interface DonationSummary {
  goldSentToMe: number;
  troopsSentToMe: number;
  goldISent: number;
  troopsISent: number;
  totalToMe: number;
  totalISent: number;
}

const SEND_PCTS = [10, 25, 50] as const;

function PlayerRow({
  player,
  tag,
  tagColor,
  maxTroops,
  donations,
  badges,
  myTroops,
  myGold,
}: {
  player: PlayerData;
  tag: string;
  tagColor: string;
  maxTroops: number;
  donations: DonationSummary;
  badges: string[];
  myTroops: number;
  myGold: number;
}) {
  const allianceCommsExpanded = useStore((s) => s.allianceCommsExpanded);
  const toggleExpanded = useStore((s) => s.toggleAllianceCommsExpanded);
  const setView = useStore((s) => s.setView);
  const setCommsTargets = useStore((s) => s.setCommsTargets);

  const isExpanded = allianceCommsExpanded.get(player.id) ?? false;
  const name = player.displayName || player.name || "Unknown";
  const troops = dTroops(player.troops);
  const gold = num(player.gold);
  const troopPct = maxTroops > 0 ? Math.min(100, (troops / maxTroops) * 100) : 0;
  const alive = player.isAlive !== false;

  const handleToggle = useCallback(() => toggleExpanded(player.id), [player.id, toggleExpanded]);
  const handleFullComms = useCallback(() => {
    setCommsTargets(new Set([player.id]));
    setView("comms");
  }, [player.id, setCommsTargets, setView]);
  const handleEmoji = useCallback((idx: number) => sendEmoji(player.id, idx), [player.id]);
  const handleQC = useCallback((key: string) => sendQuickChat(player.id, key), [player.id]);

  return (
    <div className={`bg-hammer-raised rounded border ${tagColor} ${!alive ? "opacity-50" : ""}`}>
      {/* Compact header */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className={`text-2xs ${tagColor.replace("border-", "text-")}`}>[{tag}]</span>
        <span className="text-xs text-hammer-text font-bold truncate">{name}</span>
        {!alive && <Badge label="DEAD" color="red" />}
        {badges.map((b) => (
          <Badge key={b} label={b} color="gold" />
        ))}
        <div className="ml-auto flex items-center gap-2 text-2xs shrink-0">
          <span className="text-hammer-blue">{short(troops)}t</span>
          <span className="text-hammer-gold">{short(gold)}g</span>
        </div>
      </div>

      {/* Troop bar */}
      <div className="px-2 pb-1">
        <div className="w-full bg-hammer-bg rounded h-1 overflow-hidden">
          <div
            className="h-full bg-hammer-blue rounded transition-all"
            style={{ width: `${troopPct}%` }}
          />
        </div>
      </div>

      {/* Donation exchange (if any) */}
      {(donations.totalToMe > 0 || donations.totalISent > 0) && (
        <div className="flex items-center gap-3 px-2 pb-1 text-2xs">
          {donations.totalToMe > 0 && (
            <span className="text-hammer-green">
              ↓ {donations.goldSentToMe > 0 ? `${short(donations.goldSentToMe)}g` : ""}
              {donations.goldSentToMe > 0 && donations.troopsSentToMe > 0 ? " " : ""}
              {donations.troopsSentToMe > 0 ? `${short(donations.troopsSentToMe)}t` : ""}
              {" from"}
            </span>
          )}
          {donations.totalISent > 0 && (
            <span className="text-hammer-dim">
              ↑ {donations.goldISent > 0 ? `${short(donations.goldISent)}g` : ""}
              {donations.goldISent > 0 && donations.troopsISent > 0 ? " " : ""}
              {donations.troopsISent > 0 ? `${short(donations.troopsISent)}t` : ""}
              {" sent"}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-0.5 px-2 pb-1.5">
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

      {/* Quick-send buttons */}
      <div className="flex gap-0.5 px-2 pb-1">
        {SEND_PCTS.map((pct) => (
          <button
            key={`t${pct}`}
            onClick={() => asSendTroops(player.id, Math.floor(myTroops * pct / 100))}
            className="text-2xs rounded py-0.5 px-1 border border-hammer-border bg-hammer-surface text-hammer-blue hover:border-hammer-blue transition-colors cursor-pointer"
            title={`Send ${pct}% of your troops`}
          >
            {pct}%t
          </button>
        ))}
        {SEND_PCTS.map((pct) => (
          <button
            key={`g${pct}`}
            onClick={() => asSendGold(player.id, Math.floor(myGold * pct / 100))}
            className="text-2xs rounded py-0.5 px-1 border border-hammer-border bg-hammer-surface text-hammer-gold hover:border-hammer-gold transition-colors cursor-pointer"
            title={`Send ${pct}% of your gold`}
          >
            {pct}%g
          </button>
        ))}
      </div>

      {/* Expanded comms panel */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 border-t border-hammer-border-subtle">
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
  const playersById = useStore((s) => s.playersById);
  const myAllies = useStore((s) => s.myAllies);
  const inbound = useStore((s) => s.inbound);
  const outbound = useStore((s) => s.outbound);
  const [showBots, setShowBots] = useState(false);
  const [allianceRequested, setAllianceRequested] = useState<Set<string>>(new Set());

  const myTroops = dTroops(me?.troops);
  const myGold = num(me?.gold ?? 0);

  const maxTroops = Math.max(
    myTroops,
    ...teammates.map((p) => dTroops(p.troops)),
    ...allies.map((p) => dTroops(p.troops)),
    1,
  );

  // Build per-player donation summaries
  const donationMap = useMemo(() => {
    const map = new Map<string, DonationSummary>();
    const empty: DonationSummary = { goldSentToMe: 0, troopsSentToMe: 0, goldISent: 0, troopsISent: 0, totalToMe: 0, totalISent: 0 };

    for (const [id, rec] of inbound.entries()) {
      const d = { ...empty };
      d.goldSentToMe = rec.gold;
      d.troopsSentToMe = rec.troops;
      d.totalToMe = rec.gold + rec.troops;
      map.set(id, d);
    }

    for (const [id, rec] of outbound.entries()) {
      const existing = map.get(id) || { ...empty };
      existing.goldISent = rec.gold;
      existing.troopsISent = rec.troops;
      existing.totalISent = rec.gold + rec.troops;
      map.set(id, existing);
    }

    return map;
  }, [inbound, outbound]);

  // Compute team health
  const teamHealth = useMemo(() => {
    const allMembers = [...teammates, ...(me ? [me as PlayerData] : [])];
    const alive = allMembers.filter((p) => p.isAlive !== false);
    const totalTroops = allMembers.reduce((s, p) => s + dTroops(p.troops), 0);
    const totalGold = allMembers.reduce((s, p) => s + num(p.gold), 0);
    return {
      total: allMembers.length,
      alive: alive.length,
      dead: allMembers.length - alive.length,
      totalTroops,
      totalGold,
    };
  }, [teammates, me]);

  // Compute role badges
  const roleBadges = useMemo(() => {
    const badges = new Map<string, string[]>();
    const allPlayers = [...teammates, ...allies];
    if (allPlayers.length === 0) return badges;

    let topTroops = { id: "", val: 0 };
    let topGold = { id: "", val: 0 };
    let topDonor = { id: "", val: 0 };

    for (const p of allPlayers) {
      const t = dTroops(p.troops);
      const g = num(p.gold);
      const donated = donationMap.get(p.id)?.totalToMe ?? 0;

      if (t > topTroops.val) topTroops = { id: p.id, val: t };
      if (g > topGold.val) topGold = { id: p.id, val: g };
      if (donated > topDonor.val) topDonor = { id: p.id, val: donated };
    }

    if (topTroops.val > 0) {
      const b = badges.get(topTroops.id) || [];
      b.push("ARMY");
      badges.set(topTroops.id, b);
    }
    if (topGold.val > 0) {
      const b = badges.get(topGold.id) || [];
      b.push("BANK");
      badges.set(topGold.id, b);
    }
    if (topDonor.val > 0) {
      const b = badges.get(topDonor.id) || [];
      b.push("DONOR");
      badges.set(topDonor.id, b);
    }

    return badges;
  }, [teammates, allies, donationMap]);

  const getDonations = (id: string): DonationSummary =>
    donationMap.get(id) || { goldSentToMe: 0, troopsSentToMe: 0, goldISent: 0, troopsISent: 0, totalToMe: 0, totalISent: 0 };

  // Non-allied, non-team players available for alliance requests
  const allianceCandidates = useMemo(() => {
    if (!me) return { humans: [] as PlayerData[], bots: [] as PlayerData[] };
    const tmIds = new Set(teammates.map((p) => p.id));
    const allyIds = new Set(allies.map((p) => p.id));
    const humans: PlayerData[] = [];
    const bots: PlayerData[] = [];

    for (const p of playersById.values()) {
      if (p.id === me.id) continue;
      if (!p.isAlive) continue;
      if (tmIds.has(p.id)) continue;
      if (allyIds.has(p.id)) continue;
      // Same team = already teammate (shouldn't need alliance)
      if (p.team != null && me.team != null && p.team === me.team) continue;

      if (p.clientID) {
        humans.push(p);
      } else {
        bots.push(p);
      }
    }

    const sortFn = (a: PlayerData, b: PlayerData) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "");
    humans.sort(sortFn);
    bots.sort(sortFn);
    return { humans, bots };
  }, [playersById, me, teammates, allies]);

  const visibleCandidates = showBots
    ? [...allianceCandidates.humans, ...allianceCandidates.bots]
    : allianceCandidates.humans;

  const handleAllianceRequest = useCallback((playerId: string) => {
    sendAllianceRequest(playerId);
    setAllianceRequested((prev) => new Set(prev).add(playerId));
  }, []);

  const handleRequestAll = useCallback(() => {
    for (const p of visibleCandidates) {
      if (!allianceRequested.has(p.id)) {
        sendAllianceRequest(p.id);
      }
    }
    setAllianceRequested((prev) => {
      const next = new Set(prev);
      for (const p of visibleCandidates) next.add(p.id);
      return next;
    });
  }, [visibleCandidates, allianceRequested]);

  const hasAny = teammates.length > 0 || allies.length > 0;

  return (
    <div>
      {!hasAny && (
        <div className="flex flex-col items-center justify-center text-hammer-muted font-mono text-sm py-4">
          <div className="text-base mb-1">No teammates or allies yet</div>
          <div className="text-2xs">Send alliance requests below, or wait for team assignment.</div>
        </div>
      )}

      {/* Team Health */}
      {teammates.length > 0 && (
        <Section title="Team Health">
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Alive" value={`${teamHealth.alive}/${teamHealth.total}`} color={teamHealth.dead > 0 ? "text-hammer-warn" : "text-hammer-green"} />
            <StatCard label="Dead" value={String(teamHealth.dead)} color={teamHealth.dead > 0 ? "text-hammer-red" : "text-hammer-dim"} />
            <StatCard label="Troops" value={short(teamHealth.totalTroops)} color="text-hammer-blue" />
            <StatCard label="Gold" value={short(teamHealth.totalGold)} color="text-hammer-gold" />
          </div>
        </Section>
      )}

      {/* Teammates */}
      {teammates.length > 0 && (
        <Section title="Teammates" count={teammates.length}>
          <div className="flex flex-col gap-1">
            {teammates.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                tag="TM"
                tagColor="border-hammer-blue"
                maxTroops={maxTroops}
                donations={getDonations(p.id)}
                badges={roleBadges.get(p.id) || []}
                myTroops={myTroops}
                myGold={myGold}
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
              <PlayerRow
                key={p.id}
                player={p}
                tag="AL"
                tagColor="border-hammer-green"
                maxTroops={maxTroops}
                donations={getDonations(p.id)}
                badges={roleBadges.get(p.id) || []}
                myTroops={myTroops}
                myGold={myGold}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Alliance Requests */}
      <Section title="Alliance Requests">
        {/* Controls row */}
        <div className="flex items-center gap-1 mb-1">
          <button
            onClick={handleRequestAll}
            disabled={visibleCandidates.length === 0}
            className={`px-2 py-0.5 rounded text-2xs font-bold border transition-colors cursor-pointer ${
              visibleCandidates.length > 0
                ? "bg-hammer-green/20 border-hammer-green text-hammer-green hover:bg-hammer-green/30"
                : "bg-hammer-surface border-hammer-border text-hammer-dim cursor-not-allowed"
            }`}
          >
            Request All ({visibleCandidates.length})
          </button>
          <button
            onClick={() => setShowBots((b) => !b)}
            className={`px-2 py-0.5 rounded text-2xs border transition-colors cursor-pointer ${
              showBots
                ? "bg-hammer-warn/20 border-hammer-warn text-hammer-warn"
                : "bg-hammer-surface border-hammer-border text-hammer-muted hover:text-hammer-text"
            }`}
          >
            {showBots ? "Hide" : "Show"} Bots ({allianceCandidates.bots.length})
          </button>
        </div>

        {visibleCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {visibleCandidates.map((p) => {
              const isBot = !p.clientID;
              const sent = allianceRequested.has(p.id);
              const name = p.displayName || p.name || "Unknown";
              return (
                <button
                  key={p.id}
                  onClick={() => handleAllianceRequest(p.id)}
                  disabled={sent}
                  className={`px-1.5 py-0.5 rounded text-2xs border transition-colors ${
                    sent
                      ? "bg-hammer-green/10 border-hammer-green/50 text-hammer-green cursor-default"
                      : "bg-hammer-surface border-hammer-border text-hammer-text hover:border-hammer-green hover:text-hammer-green cursor-pointer"
                  }`}
                  title={sent ? `Alliance request sent to ${name}` : `Send alliance request to ${name}`}
                >
                  {isBot && <span className="text-hammer-warn mr-0.5">[BOT]</span>}
                  {sent ? "✓ " : "+ "}
                  {name}
                  <span className="text-hammer-dim ml-1">{short(dTroops(p.troops))}t</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-2xs text-hammer-dim">
            {allianceCandidates.bots.length > 0
              ? "No human players to ally with. Toggle 'Show Bots' to see tribes."
              : "No players available for alliance requests."}
          </div>
        )}
      </Section>
    </div>
  );
}
