import { useMemo } from "react";
import { useStore } from "@store/index";
import { useMyPlayer } from "@ui/hooks/usePlayerHelpers";
import { short, comma, fullNum } from "@shared/utils";
import type { DonationRecord } from "@shared/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="text-xs text-hammer-muted uppercase tracking-wider mb-1 border-b border-hammer-border pb-0_5">
        {title}
      </div>
      {children}
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  color = "text-hammer-text",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
      <div className="text-2xs text-hammer-muted uppercase tracking-wider mb-0_5">
        {label}
      </div>
      <div className={`text-sm font-mono ${color}`}>{value}</div>
      {sub && (
        <div className="text-2xs text-hammer-muted mt-0_5">{sub}</div>
      )}
    </div>
  );
}

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
    <div className="w-full bg-hammer-bg rounded h-1_5 overflow-hidden">
      <div
        className={`h-full ${color} rounded transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}", "4.", "5."];

function topFromMap(
  map: Map<string, DonationRecord>,
): { name: string; total: number }[] {
  const entries: { name: string; total: number }[] = [];
  for (const [name, rec] of map) {
    entries.push({ name, total: rec.gold + rec.troops });
  }
  entries.sort((a, b) => b.total - a.total);
  return entries;
}

export default function StatsView() {
  const me = useMyPlayer();
  const inbound = useStore((s) => s.inbound);
  const outbound = useStore((s) => s.outbound);
  const feedIn = useStore((s) => s.feedIn);
  const feedOut = useStore((s) => s.feedOut);
  const gps30 = useStore((s) => s.gps30);
  const gpm60 = useStore((s) => s.gpm60);
  const gpm120 = useStore((s) => s.gpm120);

  const myName = me?.displayName || me?.name || "Unknown";
  const myTroops = me?.troops ?? 0;
  const myGold = Number(me?.gold ?? 0);
  const myTiles = me?.tilesOwned ?? 0;

  // We treat max troops as the current troops for display if we don't have a max.
  // In OpenFront, troops are dynamic, so we just show current.
  const maxTroops = myTroops; // Placeholder -- no max concept in store

  const aggregates = useMemo(() => {
    let recvGold = 0;
    let recvTroops = 0;
    let recvCount = 0;
    for (const [, rec] of inbound) {
      recvGold += rec.gold;
      recvTroops += rec.troops;
      recvCount += rec.count;
    }
    let sentGold = 0;
    let sentTroops = 0;
    let sentCount = 0;
    for (const [, rec] of outbound) {
      sentGold += rec.gold;
      sentTroops += rec.troops;
      sentCount += rec.count;
    }
    const totalRecv = recvGold + recvTroops;
    const totalSent = sentGold + sentTroops;
    const net = totalRecv - totalSent;
    const efficiency =
      totalSent > 0 ? ((totalRecv / totalSent) * 100).toFixed(1) : "---";
    const totalTx = recvCount + sentCount;
    const avgDonation = totalTx > 0 ? (totalRecv + totalSent) / totalTx : 0;

    return {
      recvGold,
      recvTroops,
      sentGold,
      sentTroops,
      totalRecv,
      totalSent,
      net,
      efficiency,
      recvCount,
      sentCount,
      totalTx,
      avgDonation,
    };
  }, [inbound, outbound]);

  const topSupporters = useMemo(() => topFromMap(inbound).slice(0, 5), [inbound]);
  const topRecipients = useMemo(() => topFromMap(outbound).slice(0, 5), [outbound]);

  const topSupporter = topSupporters[0] ?? null;
  const topRecipient = topRecipients[0] ?? null;

  return (
    <div className="font-mono text-hammer-text text-sm">
      {/* Current Status */}
      <Section title="Current Status">
        <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-hammer-green text-sm font-bold">
              {myName}
            </span>
            <span className="text-2xs text-hammer-muted">
              {myTiles} tiles
            </span>
          </div>
          <div className="mb-0_5">
            <div className="flex items-center justify-between text-2xs mb-0_5">
              <span className="text-hammer-muted">Troops</span>
              <span className="text-hammer-text">{comma(myTroops)}</span>
            </div>
            <PercentBar value={myTroops} max={maxTroops || 1} />
          </div>
          <div className="flex items-center justify-between text-2xs">
            <span className="text-hammer-muted">Gold</span>
            <span className="text-hammer-gold">{comma(myGold)}</span>
          </div>
        </div>
      </Section>

      {/* Session Totals */}
      <Section title="Session Totals">
        <div className="grid grid-cols-2 gap-1">
          <StatBox
            label="Total Received"
            value={short(aggregates.totalRecv)}
            sub={`${short(aggregates.recvGold)}g + ${short(aggregates.recvTroops)}t`}
            color="text-hammer-green"
          />
          <StatBox
            label="Total Sent"
            value={short(aggregates.totalSent)}
            sub={`${short(aggregates.sentGold)}g + ${short(aggregates.sentTroops)}t`}
            color="text-hammer-red"
          />
          <StatBox
            label="Net Balance"
            value={short(aggregates.net)}
            color={
              aggregates.net >= 0 ? "text-hammer-green" : "text-hammer-red"
            }
          />
          <StatBox
            label="Efficiency"
            value={
              aggregates.efficiency === "---"
                ? "---"
                : `${aggregates.efficiency}%`
            }
            sub="recv / sent"
            color="text-hammer-blue"
          />
        </div>
      </Section>

      {/* Top Contributors */}
      <Section title="Top Contributors">
        <div className="grid grid-cols-2 gap-1">
          <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
            <div className="text-2xs text-hammer-muted uppercase mb-0_5">
              Top Supporter
            </div>
            {topSupporter ? (
              <>
                <div className="text-xs text-hammer-green truncate">
                  {topSupporter.name}
                </div>
                <div className="text-2xs text-hammer-muted">
                  {short(topSupporter.total)} total
                </div>
              </>
            ) : (
              <div className="text-2xs text-hammer-muted">None yet</div>
            )}
          </div>
          <div className="bg-hammer-surface rounded p-2 border border-hammer-border">
            <div className="text-2xs text-hammer-muted uppercase mb-0_5">
              Top Recipient
            </div>
            {topRecipient ? (
              <>
                <div className="text-xs text-hammer-blue truncate">
                  {topRecipient.name}
                </div>
                <div className="text-2xs text-hammer-muted">
                  {short(topRecipient.total)} total
                </div>
              </>
            ) : (
              <div className="text-2xs text-hammer-muted">None yet</div>
            )}
          </div>
        </div>
      </Section>

      {/* Donation Velocity */}
      <Section title="Donation Velocity">
        <div className="grid grid-cols-3 gap-1">
          <StatBox
            label="Transactions"
            value={String(aggregates.totalTx)}
            sub={`${aggregates.recvCount} in / ${aggregates.sentCount} out`}
          />
          <StatBox
            label="Avg Size"
            value={short(aggregates.avgDonation)}
            color="text-hammer-blue"
          />
          <StatBox
            label="Feed Entries"
            value={String(feedIn.length + feedOut.length)}
            sub={`${feedIn.length} in / ${feedOut.length} out`}
          />
        </div>
      </Section>

      {/* Leaderboard */}
      {topSupporters.length > 0 && (
        <Section title="Leaderboard - Top Supporters">
          <div className="flex flex-col gap-0_5">
            {topSupporters.map((e, i) => (
              <div
                key={e.name}
                className="flex items-center justify-between bg-hammer-surface rounded px-2 py-0_5 border border-hammer-border"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs w-5 shrink-0">
                    {MEDALS[i] ?? `${i + 1}.`}
                  </span>
                  <span className="text-hammer-text text-xs truncate">
                    {e.name}
                  </span>
                </div>
                <span className="text-hammer-gold text-2xs shrink-0">
                  {short(e.total)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Gold Rate */}
      <Section title="Gold Rate">
        <div className="grid grid-cols-3 gap-1">
          <StatBox
            label="GPS (30s)"
            value={short(gps30)}
            color="text-hammer-gold"
          />
          <StatBox
            label="GPM (60s)"
            value={short(gpm60)}
            color="text-hammer-gold"
          />
          <StatBox
            label="GPM (120s)"
            value={short(gpm120)}
            color="text-hammer-gold"
          />
        </div>
      </Section>
    </div>
  );
}
