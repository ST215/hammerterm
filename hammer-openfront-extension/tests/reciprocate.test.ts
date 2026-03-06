/**
 * Tests for reciprocation system logic.
 *
 * Source: hammer-scripts/hammer.js lines 642-1003
 * Bucket: Reciprocation — cross-resource logic, notification merging, queue, cooldowns
 *
 * NOTE: The actual handleQuickReciprocate / handleAutoReciprocate / processReciprocateQueue
 * functions are tightly coupled to DOM (showStatus) and game APIs (asSendGold/asSendTroops).
 * Here we test the pure LOGIC patterns used by those functions.
 */
import { describe, expect, test } from "vitest";

// ───────────────────────────────────────────────────────
// Cross-resource logic: received gold → send troops, received troops → send gold
// This is the core v11.0.4 fix.
// ───────────────────────────────────────────────────────

function determineSendType(receivedType: string): "troops" | "gold" {
  // From handleAutoReciprocate (line 933): const sendTroops = pending.receivedType === "gold"
  return receivedType === "gold" ? "troops" : "gold";
}

function calculateReciprocateAmount(
  myResource: number,
  percentage: number,
): number {
  return Math.floor((myResource * percentage) / 100);
}

describe("cross-resource reciprocation", () => {
  test("received gold → send troops back", () => {
    expect(determineSendType("gold")).toBe("troops");
  });

  test("received troops → send gold back", () => {
    expect(determineSendType("troops")).toBe("gold");
  });

  test("popup cross-resource: latest.gold > 0 → sendTroops=true", () => {
    // From renderReciprocatePopup (line 724):
    // const sendTroops = latest.gold > 0
    const latest = { gold: 5000, troops: 0 };
    const sendTroops = latest.gold > 0;
    expect(sendTroops).toBe(true);

    const latest2 = { gold: 0, troops: 5000 };
    const sendTroops2 = latest2.gold > 0;
    expect(sendTroops2).toBe(false);
  });
});

describe("reciprocate amount calculation", () => {
  test("50% of 10000 = 5000", () => {
    expect(calculateReciprocateAmount(10000, 50)).toBe(5000);
  });

  test("25% of 1000 = 250", () => {
    expect(calculateReciprocateAmount(1000, 25)).toBe(250);
  });

  test("100% of 999 = 999", () => {
    expect(calculateReciprocateAmount(999, 100)).toBe(999);
  });

  test("10% of 15 = 1 (floors)", () => {
    expect(calculateReciprocateAmount(15, 10)).toBe(1);
  });

  test("0 resource → 0 amount", () => {
    expect(calculateReciprocateAmount(0, 50)).toBe(0);
  });

  test("small percentage of small resource → 0", () => {
    expect(calculateReciprocateAmount(5, 10)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────
// Notification merging
// ───────────────────────────────────────────────────────
interface RecipNotification {
  id: number;
  donorId: string;
  donorName: string;
  troops: number;
  gold: number;
  timestamp: number;
  dismissed: boolean;
}

function mergeOrPushNotification(
  notifications: RecipNotification[],
  donor: { id: string; name: string; troops: number; gold: number },
): void {
  // From showReciprocateNotification (lines 654-677)
  const existing = notifications.find((n) => n.donorId === donor.id && !n.dismissed);
  if (existing) {
    existing.troops += donor.troops || 0;
    existing.gold += donor.gold || 0;
    existing.timestamp = Date.now();
    return;
  }
  notifications.push({
    id: Date.now(),
    donorId: donor.id,
    donorName: donor.name,
    troops: donor.troops || 0,
    gold: donor.gold || 0,
    timestamp: Date.now(),
    dismissed: false,
  });
  if (notifications.length > 5) notifications.shift();
}

describe("notification merging", () => {
  test("creates new notification for new donor", () => {
    const notifications: RecipNotification[] = [];
    mergeOrPushNotification(notifications, { id: "p1", name: "Alice", troops: 1000, gold: 0 });
    expect(notifications.length).toBe(1);
    expect(notifications[0].donorName).toBe("Alice");
    expect(notifications[0].troops).toBe(1000);
  });

  test("merges into existing undismissed notification from same donor", () => {
    const notifications: RecipNotification[] = [
      { id: 1, donorId: "p1", donorName: "Alice", troops: 500, gold: 0, timestamp: 1000, dismissed: false },
    ];
    mergeOrPushNotification(notifications, { id: "p1", name: "Alice", troops: 300, gold: 0 });
    expect(notifications.length).toBe(1);
    expect(notifications[0].troops).toBe(800); // 500 + 300
  });

  test("does not merge with dismissed notification", () => {
    const notifications: RecipNotification[] = [
      { id: 1, donorId: "p1", donorName: "Alice", troops: 500, gold: 0, timestamp: 1000, dismissed: true },
    ];
    mergeOrPushNotification(notifications, { id: "p1", name: "Alice", troops: 300, gold: 0 });
    expect(notifications.length).toBe(2);
  });

  test("caps at 5 notifications (shifts oldest)", () => {
    const notifications: RecipNotification[] = [];
    for (let i = 0; i < 6; i++) {
      mergeOrPushNotification(notifications, { id: `p${i}`, name: `Player${i}`, troops: 100, gold: 0 });
    }
    expect(notifications.length).toBe(5);
    expect(notifications[0].donorId).toBe("p1"); // p0 was shifted out
  });

  test("merges gold and troops separately", () => {
    const notifications: RecipNotification[] = [
      { id: 1, donorId: "p1", donorName: "Alice", troops: 0, gold: 1000, timestamp: 1000, dismissed: false },
    ];
    mergeOrPushNotification(notifications, { id: "p1", name: "Alice", troops: 500, gold: 200 });
    expect(notifications[0].troops).toBe(500);
    expect(notifications[0].gold).toBe(1200);
  });
});

// ───────────────────────────────────────────────────────
// Cooldown logic
// ───────────────────────────────────────────────────────
describe("reciprocate cooldown", () => {
  const COOLDOWN_MS = 10_000;

  test("within cooldown period → skip", () => {
    const lastSent = Date.now() - 5000; // 5 seconds ago
    const isOnCooldown = Date.now() - lastSent < COOLDOWN_MS;
    expect(isOnCooldown).toBe(true);
  });

  test("after cooldown period → allow", () => {
    const lastSent = Date.now() - 15000; // 15 seconds ago
    const isOnCooldown = Date.now() - lastSent < COOLDOWN_MS;
    expect(isOnCooldown).toBe(false);
  });
});

// ───────────────────────────────────────────────────────
// History entry format (v11.0.4 cross-resource)
// ───────────────────────────────────────────────────────
describe("reciprocation history entry", () => {
  test("troopsSent entry when sending troops", () => {
    const entry: Record<string, unknown> = {
      donorId: "p1",
      donorName: "Alice",
      percentage: 50,
      timestamp: Date.now(),
      mode: "manual",
    };
    const sendTroops = true;
    const amountToSend = 5000;
    if (sendTroops) {
      entry.troopsSent = amountToSend;
    } else {
      entry.goldSent = amountToSend;
    }
    expect(entry.troopsSent).toBe(5000);
    expect(entry.goldSent).toBeUndefined();
  });

  test("goldSent entry when sending gold", () => {
    const entry: Record<string, unknown> = {
      donorId: "p1",
      donorName: "Alice",
      percentage: 50,
      timestamp: Date.now(),
      mode: "auto",
    };
    const sendTroops = false;
    const amountToSend = 3000;
    if (sendTroops) {
      entry.troopsSent = amountToSend;
    } else {
      entry.goldSent = amountToSend;
    }
    expect(entry.goldSent).toBe(3000);
    expect(entry.troopsSent).toBeUndefined();
  });

  test("history display picks correct icon", () => {
    const withTroops = { troopsSent: 1000, goldSent: undefined };
    const withGold = { troopsSent: undefined, goldSent: 2000 };

    // From reciprocateView (line 4589-4590):
    const sentIcon1 = withTroops.troopsSent ? "🪖" : "💰";
    const sentAmount1 = withTroops.troopsSent || withGold.goldSent || 0;
    expect(sentIcon1).toBe("🪖");
    expect(sentAmount1).toBe(1000);

    const sentIcon2 = withGold.troopsSent ? "🪖" : "💰";
    const sentAmount2 = withGold.troopsSent || withGold.goldSent || 0;
    expect(sentIcon2).toBe("💰");
    expect(sentAmount2).toBe(2000);
  });
});

// ───────────────────────────────────────────────────────
// Pending queue stale request filtering
// ───────────────────────────────────────────────────────
describe("reciprocate queue expiry", () => {
  const MAX_AGE_MS = 300_000; // 5 minutes

  test("request within 5 minutes is valid", () => {
    const addedAt = Date.now() - 60_000; // 1 minute ago
    const isStale = Date.now() - addedAt > MAX_AGE_MS;
    expect(isStale).toBe(false);
  });

  test("request older than 5 minutes is stale", () => {
    const addedAt = Date.now() - 400_000; // ~6.7 minutes ago
    const isStale = Date.now() - addedAt > MAX_AGE_MS;
    expect(isStale).toBe(true);
  });
});
