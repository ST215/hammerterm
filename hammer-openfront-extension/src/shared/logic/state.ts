import type { DonationRecord, PortRecord } from "../types";

export function bump(map: Map<string, DonationRecord>, key: string): DonationRecord {
  if (!map.has(key))
    map.set(key, {
      gold: 0,
      troops: 0,
      count: 0,
      goldSends: 0,
      troopsSends: 0,
      last: null,
      lastDonorTroops: 0,
    });
  return map.get(key)!;
}

export function bumpPorts(ports: Map<string, PortRecord>, playerId: string, gold: number, t: number): void {
  if (!ports.has(playerId))
    ports.set(playerId, { totalGold: 0, times: [], avgIntSec: 0, lastIntSec: 0, gpm: 0 });
  const p = ports.get(playerId)!;
  p.totalGold += gold;
  p.times.push(t);
  if (p.times.length > 60) p.times.shift();
  if (p.times.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < p.times.length; i++) diffs.push((p.times[i] - p.times[i - 1]) / 1000);
    const sum = diffs.reduce((a, b) => a + b, 0);
    p.avgIntSec = Math.round(sum / diffs.length);
    p.lastIntSec = Math.round(diffs[diffs.length - 1]);
    p.gpm = Math.round(p.totalGold / (sum / 60 || 0.0001));
  }
}
