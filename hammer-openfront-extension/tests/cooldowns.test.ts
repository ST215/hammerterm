/**
 * Tests for cooldown / timer logic across all send systems.
 *
 * Three cooldown systems exist:
 *   1. Auto-troops — per-target, configurable (default 10s), stored in asTroopsLastSend
 *   2. Auto-gold   — per-target, configurable (default 10s), stored in asGoldLastSend
 *   3. Reciprocate  — per-donor, fixed 10s (RECIPROCATE_COOLDOWN_MS), module-level Map
 *
 * Key design rules:
 *   - Cooldowns are per-recipient (not global)
 *   - Auto-troops and auto-gold have SEPARATE cooldown maps
 *   - Reciprocate has ONE cooldown map shared across gold/troop sends
 *   - Cooldown starts AFTER a successful send, not on attempt
 *   - First send to a target always allowed (no prior timestamp)
 */
import { describe, expect, test } from "vitest";
import { RECIPROCATE_COOLDOWN_MS } from "../src/shared/constants";

// ═══════════════════════════════════════════════════════
// Shared cooldown simulation helpers
// ═══════════════════════════════════════════════════════

/** Simulates a per-target cooldown map (like auto-troops or auto-gold) */
class CooldownTracker {
  private lastSend = new Map<string, number>();

  canSend(targetId: string, now: number, cooldownMs: number): boolean {
    const last = this.lastSend.get(targetId) || 0;
    return now >= last + cooldownMs;
  }

  recordSend(targetId: string, now: number): void {
    this.lastSend.set(targetId, now);
  }

  getLastSend(targetId: string): number {
    return this.lastSend.get(targetId) || 0;
  }
}

// ═══════════════════════════════════════════════════════
// 1. Per-target isolation — different targets don't block each other
// ═══════════════════════════════════════════════════════

describe("per-target cooldown isolation", () => {
  test("sending to Alice does not block sending to Bob", () => {
    const tracker = new CooldownTracker();
    const now = 100_000;
    const cooldown = 10_000;

    tracker.recordSend("alice", now);
    // Alice on cooldown, Bob is not
    expect(tracker.canSend("alice", now + 5000, cooldown)).toBe(false);
    expect(tracker.canSend("bob", now + 5000, cooldown)).toBe(true);
  });

  test("cooldown expires independently per target", () => {
    const tracker = new CooldownTracker();
    const cooldown = 10_000;

    tracker.recordSend("alice", 100_000);
    tracker.recordSend("bob", 105_000); // Bob sent 5s later

    // At 110_000: Alice expired (10s), Bob still on cooldown (5s left)
    expect(tracker.canSend("alice", 110_000, cooldown)).toBe(true);
    expect(tracker.canSend("bob", 110_000, cooldown)).toBe(false);

    // At 115_000: both expired
    expect(tracker.canSend("bob", 115_000, cooldown)).toBe(true);
  });

  test("first send to any target is always allowed", () => {
    const tracker = new CooldownTracker();
    const cooldown = 10_000;
    const now = Date.now();

    // Never sent before → lastSend is 0 → now >= 0 + 10000 → true
    expect(tracker.canSend("alice", now, cooldown)).toBe(true);
    expect(tracker.canSend("bob", now, cooldown)).toBe(true);
    expect(tracker.canSend("charlie", now, cooldown)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 2. Auto-troops cooldown behavior
// ═══════════════════════════════════════════════════════

describe("auto-troops cooldown", () => {
  test("respects configurable cooldown period (default 10s)", () => {
    const tracker = new CooldownTracker();
    const cooldown = 10_000;
    const now = 100_000;

    tracker.recordSend("target1", now);

    // During cooldown
    expect(tracker.canSend("target1", now + 1000, cooldown)).toBe(false);
    expect(tracker.canSend("target1", now + 5000, cooldown)).toBe(false);
    expect(tracker.canSend("target1", now + 9999, cooldown)).toBe(false);

    // Exactly at cooldown boundary
    expect(tracker.canSend("target1", now + 10_000, cooldown)).toBe(true);

    // After cooldown
    expect(tracker.canSend("target1", now + 15_000, cooldown)).toBe(true);
  });

  test("custom cooldown period (30s)", () => {
    const tracker = new CooldownTracker();
    const cooldown = 30_000;
    const now = 100_000;

    tracker.recordSend("target1", now);

    expect(tracker.canSend("target1", now + 10_000, cooldown)).toBe(false);
    expect(tracker.canSend("target1", now + 29_999, cooldown)).toBe(false);
    expect(tracker.canSend("target1", now + 30_000, cooldown)).toBe(true);
  });

  test("multiple targets in sequence with cooldown tracking", () => {
    const tracker = new CooldownTracker();
    const cooldown = 10_000;
    const targets = ["t1", "t2", "t3"];
    const now = 100_000;

    // Send to all three at once
    for (const t of targets) {
      expect(tracker.canSend(t, now, cooldown)).toBe(true);
      tracker.recordSend(t, now);
    }

    // All on cooldown
    for (const t of targets) {
      expect(tracker.canSend(t, now + 5000, cooldown)).toBe(false);
    }

    // All expired
    for (const t of targets) {
      expect(tracker.canSend(t, now + 10_000, cooldown)).toBe(true);
    }
  });

  test("rapid-fire sends to same target — only first goes through", () => {
    const tracker = new CooldownTracker();
    const cooldown = 10_000;
    const now = 100_000;
    let sendCount = 0;

    // Simulate 5 rapid ticks (800ms apart) to same target
    for (let tick = 0; tick < 5; tick++) {
      const tickTime = now + tick * 800;
      if (tracker.canSend("target1", tickTime, cooldown)) {
        tracker.recordSend("target1", tickTime);
        sendCount++;
      }
    }
    expect(sendCount).toBe(1); // Only the first one
  });
});

// ═══════════════════════════════════════════════════════
// 3. Auto-gold cooldown behavior
// ═══════════════════════════════════════════════════════

describe("auto-gold cooldown", () => {
  test("auto-gold has separate cooldown from auto-troops", () => {
    const troopsCooldown = new CooldownTracker();
    const goldCooldown = new CooldownTracker();
    const cooldown = 10_000;
    const now = 100_000;

    // Send troops to target1
    troopsCooldown.recordSend("target1", now);

    // Troops on cooldown, but gold is NOT — separate maps
    expect(troopsCooldown.canSend("target1", now + 5000, cooldown)).toBe(false);
    expect(goldCooldown.canSend("target1", now + 5000, cooldown)).toBe(true);
  });

  test("sending gold does not affect troops cooldown", () => {
    const troopsCooldown = new CooldownTracker();
    const goldCooldown = new CooldownTracker();
    const cooldown = 10_000;
    const now = 100_000;

    // Send gold
    goldCooldown.recordSend("target1", now);

    // Gold on cooldown, troops still free
    expect(goldCooldown.canSend("target1", now + 5000, cooldown)).toBe(false);
    expect(troopsCooldown.canSend("target1", now + 5000, cooldown)).toBe(true);
  });

  test("both can be on cooldown simultaneously", () => {
    const troopsCooldown = new CooldownTracker();
    const goldCooldown = new CooldownTracker();
    const cooldown = 10_000;
    const now = 100_000;

    troopsCooldown.recordSend("target1", now);
    goldCooldown.recordSend("target1", now + 2000); // 2s later

    // At now+5000: both on cooldown
    expect(troopsCooldown.canSend("target1", now + 5000, cooldown)).toBe(false);
    expect(goldCooldown.canSend("target1", now + 5000, cooldown)).toBe(false);

    // At now+10000: troops expired, gold still on cooldown (2s left)
    expect(troopsCooldown.canSend("target1", now + 10_000, cooldown)).toBe(true);
    expect(goldCooldown.canSend("target1", now + 10_000, cooldown)).toBe(false);

    // At now+12000: both expired
    expect(goldCooldown.canSend("target1", now + 12_000, cooldown)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 4. Reciprocate cooldown — SINGLE map for both resource types
// ═══════════════════════════════════════════════════════

describe("reciprocate cooldown", () => {
  test("RECIPROCATE_COOLDOWN_MS is 10 seconds", () => {
    expect(RECIPROCATE_COOLDOWN_MS).toBe(10_000);
  });

  test("reciprocate uses ONE cooldown map (gold and troops share it)", () => {
    // This is the key difference from auto-send: reciprocate has a single
    // per-donor cooldown regardless of whether you sent gold or troops back.
    const recipCooldowns = new CooldownTracker();
    const now = 100_000;

    // Sent troops back to Alice
    recipCooldowns.recordSend("alice", now);

    // Alice sends gold 5s later — cooldown blocks reciprocation
    // regardless that the first send was troops
    expect(recipCooldowns.canSend("alice", now + 5000, RECIPROCATE_COOLDOWN_MS)).toBe(false);

    // After 10s, can reciprocate again
    expect(recipCooldowns.canSend("alice", now + 10_000, RECIPROCATE_COOLDOWN_MS)).toBe(true);
  });

  test("different donors have independent cooldowns", () => {
    const recipCooldowns = new CooldownTracker();
    const now = 100_000;

    recipCooldowns.recordSend("alice", now);

    // Alice on cooldown, Bob is not
    expect(recipCooldowns.canSend("alice", now + 5000, RECIPROCATE_COOLDOWN_MS)).toBe(false);
    expect(recipCooldowns.canSend("bob", now + 5000, RECIPROCATE_COOLDOWN_MS)).toBe(true);
  });

  test("handleAutoReciprocate entrance cooldown drops items silently", () => {
    // Simulates the entrance check in handleAutoReciprocate:
    // if cooldown active → skip entirely (don't queue)
    const recipCooldowns = new CooldownTracker();
    const queue: Array<{ donorId: string; receivedType: string }> = [];
    const now = 100_000;

    function handleAutoReciprocate(donorId: string, receivedType: string, atTime: number) {
      if (!recipCooldowns.canSend(donorId, atTime, RECIPROCATE_COOLDOWN_MS)) {
        return "dropped"; // silently dropped
      }
      queue.push({ donorId, receivedType });
      return "queued";
    }

    // First donation from Alice: queued
    expect(handleAutoReciprocate("alice", "troops", now)).toBe("queued");

    // Process queue → sends → sets cooldown
    recipCooldowns.recordSend("alice", now);

    // Second donation 5s later: dropped (not queued)
    expect(handleAutoReciprocate("alice", "gold", now + 5000)).toBe("dropped");
    expect(queue.length).toBe(1); // Only the first one was queued

    // Third donation after cooldown: queued
    expect(handleAutoReciprocate("alice", "troops", now + 11_000)).toBe("queued");
    expect(queue.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════
// 5. Queue processor cooldown re-queuing behavior
// ═══════════════════════════════════════════════════════

describe("reciprocate queue processor cooldown handling", () => {
  test("items on cooldown are re-queued to END, not dropped", () => {
    const recipCooldowns = new CooldownTracker();
    const now = 100_000;

    interface QueueItem {
      donorId: string;
      donorName: string;
      addedAt: number;
      attempts: number;
    }

    const queue: QueueItem[] = [
      { donorId: "alice", donorName: "Alice", addedAt: now, attempts: 0 },
      { donorId: "bob", donorName: "Bob", addedAt: now, attempts: 0 },
      { donorId: "charlie", donorName: "Charlie", addedAt: now, attempts: 0 },
    ];

    // Alice is on cooldown
    recipCooldowns.recordSend("alice", now - 5000); // 5s ago

    // Process queue (take batch of 3)
    const batch = queue.splice(0, 3);
    const processed: string[] = [];

    for (const item of batch) {
      if (!recipCooldowns.canSend(item.donorId, now, RECIPROCATE_COOLDOWN_MS)) {
        queue.push(item); // Re-queue to END
        continue;
      }
      processed.push(item.donorId);
      recipCooldowns.recordSend(item.donorId, now);
    }

    // Alice was re-queued, Bob and Charlie were processed
    expect(processed).toEqual(["bob", "charlie"]);
    expect(queue.length).toBe(1);
    expect(queue[0].donorId).toBe("alice"); // At the end
  });

  test("re-queued items eventually process when cooldown expires", () => {
    const recipCooldowns = new CooldownTracker();

    interface QueueItem {
      donorId: string;
      addedAt: number;
      attempts: number;
    }

    const queue: QueueItem[] = [
      { donorId: "alice", addedAt: 100_000, attempts: 0 },
    ];

    // Alice on cooldown from recent send
    recipCooldowns.recordSend("alice", 95_000);

    // Tick 1 at 100_000: cooldown active (5s into 10s), re-queue
    let batch = queue.splice(0, 3);
    for (const item of batch) {
      if (!recipCooldowns.canSend(item.donorId, 100_000, RECIPROCATE_COOLDOWN_MS)) {
        queue.push(item);
      }
    }
    expect(queue.length).toBe(1); // Still in queue

    // Tick 2 at 106_000: cooldown expired (11s since send)
    batch = queue.splice(0, 3);
    let processed = false;
    for (const item of batch) {
      if (recipCooldowns.canSend(item.donorId, 106_000, RECIPROCATE_COOLDOWN_MS)) {
        processed = true;
        recipCooldowns.recordSend(item.donorId, 106_000);
      }
    }
    expect(processed).toBe(true);
    expect(queue.length).toBe(0); // Drained
  });
});

// ═══════════════════════════════════════════════════════
// 6. Stale item expiry — items older than 5 minutes are dropped
// ═══════════════════════════════════════════════════════

describe("reciprocate queue stale item expiry", () => {
  const MAX_PENDING_AGE_MS = 300_000; // 5 minutes

  test("item added 1 minute ago is NOT stale", () => {
    const now = 400_000;
    const addedAt = 340_000; // 60s ago
    expect(now - addedAt > MAX_PENDING_AGE_MS).toBe(false);
  });

  test("item added 6 minutes ago IS stale and gets dropped", () => {
    const now = 460_000;
    const addedAt = 100_000; // 360s ago
    expect(now - addedAt > MAX_PENDING_AGE_MS).toBe(true);
  });

  test("stale items are dropped, not re-queued", () => {
    interface QueueItem {
      donorId: string;
      addedAt: number;
      attempts: number;
    }

    const now = 500_000;
    const queue: QueueItem[] = [
      { donorId: "alice", addedAt: 100_000, attempts: 0 }, // 400s old — stale
      { donorId: "bob", addedAt: 450_000, attempts: 0 },   // 50s old — fresh
    ];

    const batch = queue.splice(0, 3);
    const processed: string[] = [];
    const dropped: string[] = [];

    for (const item of batch) {
      if (now - item.addedAt > MAX_PENDING_AGE_MS) {
        dropped.push(item.donorId);
        continue; // Drop, don't re-queue
      }
      processed.push(item.donorId);
    }

    expect(dropped).toEqual(["alice"]);
    expect(processed).toEqual(["bob"]);
    expect(queue.length).toBe(0); // Nothing re-queued
  });
});

// ═══════════════════════════════════════════════════════
// 7. Max attempts — items that fail too many times are dropped
// ═══════════════════════════════════════════════════════

describe("reciprocate max attempts", () => {
  const MAX_ATTEMPTS = 5;

  test("item under max attempts is re-queued on failure", () => {
    const item = { donorId: "alice", attempts: 3 };
    item.attempts++;
    const requeue = item.attempts < MAX_ATTEMPTS;
    expect(requeue).toBe(true);
    expect(item.attempts).toBe(4);
  });

  test("item at max attempts is dropped on failure", () => {
    const item = { donorId: "alice", attempts: 4 };
    item.attempts++;
    const requeue = item.attempts < MAX_ATTEMPTS;
    expect(requeue).toBe(false);
    expect(item.attempts).toBe(5);
  });

  test("full lifecycle: item fails 5 times then dropped", () => {
    interface QueueItem {
      donorId: string;
      addedAt: number;
      attempts: number;
    }

    const queue: QueueItem[] = [
      { donorId: "alice", addedAt: Date.now(), attempts: 0 },
    ];

    let dropped = false;
    // Simulate 6 ticks where send always fails (amountToSend = 0)
    for (let tick = 0; tick < 6; tick++) {
      if (queue.length === 0) break;
      const batch = queue.splice(0, 1);
      for (const item of batch) {
        const amountToSend = 0; // Simulate no resources
        if (amountToSend === 0) {
          item.attempts++;
          if (item.attempts < MAX_ATTEMPTS) {
            queue.push(item); // Re-queue
          } else {
            dropped = true; // Drop
          }
        }
      }
    }
    expect(dropped).toBe(true);
    expect(queue.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 8. Auto-send tick simulation — cooldown + resource tracking
// ═══════════════════════════════════════════════════════

describe("auto-send tick simulation", () => {
  test("multiple ticks with cooldown: only sends once per cooldown window", () => {
    const tracker = new CooldownTracker();
    const cooldownMs = 10_000;
    const targets = [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bob" }];
    let totalSends = 0;

    // Simulate 15 ticks at 800ms intervals (12 seconds total)
    for (let tick = 0; tick < 15; tick++) {
      const now = 100_000 + tick * 800;
      for (const target of targets) {
        if (tracker.canSend(target.id, now, cooldownMs)) {
          tracker.recordSend(target.id, now);
          totalSends++;
        }
      }
    }

    // In 12 seconds with 10s cooldown:
    // Each target gets 1 send at tick 0, then another at tick ~13 (10.4s)
    // So 2 sends per target = 4 total
    expect(totalSends).toBe(4);
  });

  test("interleaved troops and gold sends respect separate cooldowns", () => {
    const troopsTracker = new CooldownTracker();
    const goldTracker = new CooldownTracker();
    const cooldownMs = 10_000;
    const now = 100_000;

    // Tick 1: send both troops and gold to target1
    expect(troopsTracker.canSend("t1", now, cooldownMs)).toBe(true);
    troopsTracker.recordSend("t1", now);
    expect(goldTracker.canSend("t1", now, cooldownMs)).toBe(true);
    goldTracker.recordSend("t1", now);

    // Tick 2 (5s later): both on cooldown
    expect(troopsTracker.canSend("t1", now + 5000, cooldownMs)).toBe(false);
    expect(goldTracker.canSend("t1", now + 5000, cooldownMs)).toBe(false);

    // Tick 3 (10s later): both available again
    expect(troopsTracker.canSend("t1", now + 10_000, cooldownMs)).toBe(true);
    expect(goldTracker.canSend("t1", now + 10_000, cooldownMs)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 9. Edge cases
// ═══════════════════════════════════════════════════════

describe("cooldown edge cases", () => {
  test("cooldown of 0 allows every tick", () => {
    const tracker = new CooldownTracker();
    const cooldownMs = 0;
    let sends = 0;

    for (let tick = 0; tick < 5; tick++) {
      const now = 100_000 + tick * 800;
      if (tracker.canSend("t1", now, cooldownMs)) {
        tracker.recordSend("t1", now);
        sends++;
      }
    }
    expect(sends).toBe(5); // Every tick sends
  });

  test("very large cooldown blocks for a long time", () => {
    const tracker = new CooldownTracker();
    const cooldownMs = 60_000; // 1 minute
    const now = 100_000;

    tracker.recordSend("t1", now);
    expect(tracker.canSend("t1", now + 30_000, cooldownMs)).toBe(false);
    expect(tracker.canSend("t1", now + 59_999, cooldownMs)).toBe(false);
    expect(tracker.canSend("t1", now + 60_000, cooldownMs)).toBe(true);
  });

  test("timestamps are monotonically increasing — no time travel issues", () => {
    const tracker = new CooldownTracker();
    const cooldownMs = 10_000;

    // Send at t=100000
    tracker.recordSend("t1", 100_000);

    // Query at t=90000 (time went backwards — shouldn't happen but be safe)
    // 90000 >= 100000 + 10000 = 110000? No → blocked
    expect(tracker.canSend("t1", 90_000, cooldownMs)).toBe(false);
  });

  test("multiple rapid donations from same player only queue once (cooldown gate)", () => {
    const recipCooldowns = new CooldownTracker();
    const queue: string[] = [];

    function enqueueIfNotOnCooldown(donorId: string, now: number): boolean {
      if (!recipCooldowns.canSend(donorId, now, RECIPROCATE_COOLDOWN_MS)) {
        return false; // Dropped
      }
      queue.push(donorId);
      return true;
    }

    const now = 100_000;
    // Alice sends 3 donations in rapid succession (within 100ms)
    expect(enqueueIfNotOnCooldown("alice", now)).toBe(true);
    // Note: cooldown only set AFTER processing, not on enqueue.
    // So all three get queued if no processing happened yet!
    expect(enqueueIfNotOnCooldown("alice", now + 50)).toBe(true);
    expect(enqueueIfNotOnCooldown("alice", now + 100)).toBe(true);
    expect(queue.length).toBe(3);

    // After first processes and sets cooldown, the queue processor
    // will re-queue the other two on cooldown (not drop them).
    // This is correct queue behavior.
  });

  test("splice(0, 3) takes items OUT of queue (not slice)", () => {
    // Critical correctness test — the old bug was using slice instead of splice
    const queue = ["a", "b", "c", "d", "e"];
    const batch = queue.splice(0, 3);

    expect(batch).toEqual(["a", "b", "c"]);
    expect(queue).toEqual(["d", "e"]); // Remaining in queue

    // slice would have left the queue unchanged:
    const queue2 = ["a", "b", "c", "d", "e"];
    const batch2 = queue2.slice(0, 3);
    expect(batch2).toEqual(["a", "b", "c"]);
    expect(queue2).toEqual(["a", "b", "c", "d", "e"]); // NOT removed!
  });

  test("re-queued items go to END, not front", () => {
    const queue = ["a", "b", "c"];
    const batch = queue.splice(0, 2); // Take "a", "b"

    // "a" needs re-queue (on cooldown), "b" processes
    queue.push(batch[0]); // "a" goes to end

    expect(queue).toEqual(["c", "a"]); // "c" is next, not "a"
  });
});

// ═══════════════════════════════════════════════════════
// 10. Store-level cooldown state (auto-troops/gold slices)
// ═══════════════════════════════════════════════════════

describe("auto-send store cooldown state", () => {
  test("nextSend computed from lastSend + cooldownMs", () => {
    const lastSend = 100_000;
    const cooldownSec = 10;
    const cooldownMs = cooldownSec * 1000;
    const nextSend = lastSend + cooldownMs;

    expect(nextSend).toBe(110_000);
  });

  test("updateSendTimes stores both lastSend and nextSend", () => {
    // Simulates what the store action does
    const sendTimes: Record<string, { last: number; next: number }> = {};

    function updateSendTimes(targetId: string, lastSend: number, nextSend: number) {
      sendTimes[targetId] = { last: lastSend, next: nextSend };
    }

    updateSendTimes("t1", 100_000, 110_000);
    updateSendTimes("t2", 105_000, 115_000);

    expect(sendTimes["t1"].last).toBe(100_000);
    expect(sendTimes["t1"].next).toBe(110_000);
    expect(sendTimes["t2"].last).toBe(105_000);
    expect(sendTimes["t2"].next).toBe(115_000);
  });
});
