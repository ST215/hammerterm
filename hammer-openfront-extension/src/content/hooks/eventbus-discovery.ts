/**
 * EventBus discovery — finds the game's EventBus and discovers minified
 * event classes for donations, emojis, quick chat, and alliance requests.
 *
 * Ported from hammer.js lines ~2211-2835.
 */

import { registerInterval, registerCleanup } from "../cleanup";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let eventBus: any = null;
let eventBusAttempts = 0;
const MAX_EVENTBUS_ATTEMPTS = 50;

/** Discovered event classes (minified, found via property probing). */
let donateTroopsEventClass: any = null;
let donateGoldEventClass: any = null;
let emojiEventClass: any = null;
let quickChatEventClass: any = null;
let allianceRequestEventClass: any = null;

/** How each class was discovered (for diagnostics). */
let discoveryMethod: { troops: string | null; gold: string | null } = {
  troops: null,
  gold: null,
};

/** Last scan results for diagnostics UI. */
let lastScanResults: ProbeResult[] = [];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProbeResult {
  name: string;
  class: any;
  properties: string[];
  prototypeKeys: string[];
  hasRecipient: boolean;
  hasTroops: boolean;
  hasGold: boolean;
  hasEmoji: boolean;
  hasQuickChatKey: boolean;
  constructable: boolean;
  constructableWithArgs: boolean;
  isDonation: boolean;
  donationType: string | null;
  handlerCount?: number;
}

// ---------------------------------------------------------------------------
// probeEventClass — instantiate a class to detect its properties
// ---------------------------------------------------------------------------

function probeEventClass(EventClass: any): ProbeResult {
  const result: ProbeResult = {
    name: EventClass.name,
    class: EventClass,
    properties: [],
    prototypeKeys: [],
    hasRecipient: false,
    hasTroops: false,
    hasGold: false,
    hasEmoji: false,
    hasQuickChatKey: false,
    constructable: false,
    constructableWithArgs: false,
    isDonation: false,
    donationType: null,
  };

  // Check prototype for getter/method names
  try {
    result.prototypeKeys = Object.getOwnPropertyNames(
      EventClass.prototype,
    ).filter((k: string) => k !== "constructor");
  } catch {}

  // Try default constructor
  try {
    const inst = new EventClass();
    result.constructable = true;
    result.properties = Object.keys(inst);
    result.hasRecipient = "recipient" in inst;
    result.hasTroops = "troops" in inst;
    result.hasGold = "gold" in inst;
    result.hasEmoji = "emoji" in inst;
    result.hasQuickChatKey = "quickChatKey" in inst;
  } catch {}

  // Try constructor with args if default failed or missed properties
  if (
    !result.constructable ||
    (!result.hasRecipient && !result.hasTroops && !result.hasGold)
  ) {
    try {
      const inst = new EventClass(null, 0);
      result.constructableWithArgs = true;
      const keys = Object.keys(inst);
      if (keys.length > result.properties.length) result.properties = keys;
      if (!result.hasRecipient) result.hasRecipient = "recipient" in inst;
      if (!result.hasTroops) result.hasTroops = "troops" in inst;
      if (!result.hasGold) result.hasGold = "gold" in inst;
      if (!result.hasEmoji) result.hasEmoji = "emoji" in inst;
      if (!result.hasQuickChatKey)
        result.hasQuickChatKey = "quickChatKey" in inst;
    } catch {}
  }

  // Also check prototype keys for properties
  if (!result.hasRecipient)
    result.hasRecipient = result.prototypeKeys.includes("recipient");
  if (!result.hasTroops)
    result.hasTroops = result.prototypeKeys.includes("troops");
  if (!result.hasGold) result.hasGold = result.prototypeKeys.includes("gold");
  if (!result.hasEmoji)
    result.hasEmoji = result.prototypeKeys.includes("emoji");
  if (!result.hasQuickChatKey)
    result.hasQuickChatKey = result.prototypeKeys.includes("quickChatKey");

  // Classify
  if (result.hasRecipient && result.hasTroops) {
    result.isDonation = true;
    result.donationType = "troops";
  } else if (result.hasRecipient && result.hasGold) {
    result.isDonation = true;
    result.donationType = "gold";
  } else if (result.hasRecipient && result.hasEmoji) {
    result.donationType = "emoji";
  } else if (result.hasRecipient && result.hasQuickChatKey) {
    result.donationType = "quick_chat";
  } else if (
    result.hasRecipient &&
    !result.hasTroops &&
    !result.hasGold &&
    !result.hasEmoji &&
    !result.hasQuickChatKey
  ) {
    // Recipient-only event: likely alliance request or target player
    result.donationType = "recipient_only";
  }

  return result;
}

// ---------------------------------------------------------------------------
// scanAllEventClasses — iterate eventBus.listeners and probe each class
// ---------------------------------------------------------------------------

function scanAllEventClasses(): ProbeResult[] {
  if (!eventBus || !eventBus.listeners) return [];

  const results: ProbeResult[] = [];
  for (const [eventClass, handlers] of eventBus.listeners.entries()) {
    const probe = probeEventClass(eventClass);
    probe.handlerCount = (handlers as any[]).length;
    results.push(probe);
  }
  lastScanResults = results;
  return results;
}

// ---------------------------------------------------------------------------
// discoverDonationEventClasses — find troops/gold/emoji/quickchat classes
// ---------------------------------------------------------------------------

export function discoverDonationEventClasses(): boolean {
  if (!eventBus || !eventBus.listeners) {
    return false;
  }

  // Reset
  donateTroopsEventClass = null;
  donateGoldEventClass = null;
  emojiEventClass = null;
  quickChatEventClass = null;
  allianceRequestEventClass = null;
  discoveryMethod = { troops: null, gold: null };

  // Scan all classes
  const probes = scanAllEventClasses();

  // Property-based discovery (most reliable)
  for (const probe of probes) {
    if (probe.donationType === "troops" && !donateTroopsEventClass) {
      donateTroopsEventClass = probe.class;
      discoveryMethod.troops = "property";
    }
    if (probe.donationType === "gold" && !donateGoldEventClass) {
      donateGoldEventClass = probe.class;
      discoveryMethod.gold = "property";
    }
    if (probe.donationType === "emoji" && !emojiEventClass) {
      emojiEventClass = probe.class;
    }
    if (probe.donationType === "quick_chat" && !quickChatEventClass) {
      quickChatEventClass = probe.class;
    }
    if (probe.donationType === "recipient_only" && !allianceRequestEventClass) {
      allianceRequestEventClass = probe.class;
    }
  }

  // Log results
  const troopsStatus = donateTroopsEventClass
    ? `troops=${donateTroopsEventClass.name} (${discoveryMethod.troops})`
    : "troops=NOT FOUND";
  const goldStatus = donateGoldEventClass
    ? `gold=${donateGoldEventClass.name} (${discoveryMethod.gold})`
    : "gold=NOT FOUND";

  if (donateGoldEventClass && donateTroopsEventClass) {
    console.log(`[Hammer] Event classes: ${troopsStatus}, ${goldStatus}`);
    return true;
  }

  console.warn(
    `[Hammer] Event class discovery incomplete: ${troopsStatus}, ${goldStatus}`,
  );
  return false;
}

// ---------------------------------------------------------------------------
// findEventBus — search DOM custom elements for the EventBus
// ---------------------------------------------------------------------------

function findEventBus(): boolean {
  if (eventBus) return true;

  eventBusAttempts++;

  // Try events-display element
  try {
    const eventsDisplay = document.querySelector("events-display") as any;
    if (eventsDisplay?.eventBus) {
      eventBus = eventsDisplay.eventBus;
      console.log("[Hammer] Found EventBus via events-display");
      onEventBusFound();
      return true;
    }
  } catch {}

  // Try game-view element
  try {
    const gameView = document.querySelector("game-view") as any;
    if (gameView?.eventBus) {
      eventBus = gameView.eventBus;
      console.log("[Hammer] Found EventBus via game-view");
      onEventBusFound();
      return true;
    }
  } catch {}

  // Try common window property names
  const commonProps = ["eventBus", "_eventBus", "bus", "events"];
  for (const prop of commonProps) {
    try {
      const val = (window as any)[prop];
      if (val && typeof val.emit === "function") {
        eventBus = val;
        console.log(`[Hammer] Found EventBus at window.${prop}`);
        onEventBusFound();
        return true;
      }
    } catch {}
  }

  if (eventBusAttempts >= MAX_EVENTBUS_ATTEMPTS) {
    console.warn(
      "[Hammer] Failed to find EventBus after",
      MAX_EVENTBUS_ATTEMPTS,
      "attempts. Will fall back to direct WebSocket intents.",
    );
  }

  return false;
}

// ---------------------------------------------------------------------------
// onEventBusFound — run initial scan & discovery once EventBus is located
// ---------------------------------------------------------------------------

function onEventBusFound(): void {
  setTimeout(() => {
    scanAllEventClasses();
    discoverDonationEventClasses();
  }, 100);
}

// ---------------------------------------------------------------------------
// installEventBusDiscovery — start periodic search for EventBus
// ---------------------------------------------------------------------------

export function installEventBusDiscovery(): void {
  // Idempotent — if already found, just re-scan classes
  if (eventBus) {
    scanAllEventClasses();
    discoverDonationEventClasses();
    return;
  }

  eventBusAttempts = 0;

  const searchInterval = setInterval(() => {
    if (findEventBus()) {
      clearInterval(searchInterval);
    }
    if (eventBusAttempts >= MAX_EVENTBUS_ATTEMPTS) {
      clearInterval(searchInterval);
    }
  }, 200);

  registerInterval(searchInterval);
  registerCleanup(() => {
    clearInterval(searchInterval);
  });
}

// ---------------------------------------------------------------------------
// Exports — public API for other modules (send.ts, diagnostics, etc.)
// ---------------------------------------------------------------------------

export function getEventBus(): any {
  return eventBus;
}

export function getDiscoveredClasses() {
  return {
    donateTroopsEventClass,
    donateGoldEventClass,
    emojiEventClass,
    quickChatEventClass,
    allianceRequestEventClass,
    discoveryMethod,
  };
}

export function getLastScanResults(): ProbeResult[] {
  return lastScanResults;
}

export function getEventBusState() {
  return {
    found: eventBus !== null,
    attempts: eventBusAttempts,
    maxAttempts: MAX_EVENTBUS_ATTEMPTS,
    hasTroopsClass: donateTroopsEventClass !== null,
    hasGoldClass: donateGoldEventClass !== null,
    hasEmojiClass: emojiEventClass !== null,
    hasQuickChatClass: quickChatEventClass !== null,
    hasAllianceClass: allianceRequestEventClass !== null,
    discoveryMethod,
    scanResultCount: lastScanResults.length,
  };
}
