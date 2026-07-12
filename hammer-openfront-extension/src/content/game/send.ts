/**
 * send.ts — Game action infrastructure: troops, gold, emoji, quickchat, alliance.
 *
 * All send commands are dispatched to the MAIN world via the bridge,
 * where EventBus or WebSocket are used to execute them.
 *
 * A global intent queue enforces the server's rate limits:
 *   - Max 8 intents/second (server allows 10, we leave headroom)
 *   - Max 120 intents/minute (server allows 150)
 */

import { useStore } from "@store/index";
import { sendToMainWorld } from "../bridge";
import { record, trackMetric } from "../../recorder";

// ---------- Global intent rate limiter ----------

const MAX_PER_SECOND = 8; // server limit is 10, leave 2 for manual player actions
const MAX_PER_MINUTE = 120; // server limit is 150
const DRAIN_INTERVAL_MS = 125; // drain queue every 125ms (8/sec)

interface QueuedIntent {
  payload: any;
  recordCategory: string;
  recordDetail: string;
  recordMeta: Record<string, unknown>;
  logMsg: string;
}

const intentQueue: QueuedIntent[] = [];
const sentTimestamps: number[] = []; // tracks when each intent was actually sent
let drainTimer: ReturnType<typeof setInterval> | null = null;

function pruneTimestamps(now: number): void {
  // Remove entries older than 60s
  while (sentTimestamps.length > 0 && now - sentTimestamps[0] > 60_000) {
    sentTimestamps.shift();
  }
}

function countInWindow(now: number, windowMs: number): number {
  let count = 0;
  for (let i = sentTimestamps.length - 1; i >= 0; i--) {
    if (now - sentTimestamps[i] <= windowMs) count++;
    else break;
  }
  return count;
}

function drainQueue(): void {
  if (intentQueue.length === 0) return;

  const now = Date.now();
  pruneTimestamps(now);

  // Check per-minute limit
  if (countInWindow(now, 60_000) >= MAX_PER_MINUTE) {
    trackMetric("intentsRateLimited");
    return;
  }

  // Check per-second limit
  if (countInWindow(now, 1_000) >= MAX_PER_SECOND) {
    trackMetric("intentsRateLimited");
    return;
  }

  const item = intentQueue.shift()!;
  trackMetric("intentsSent");
  sendToMainWorld(item.payload);
  sentTimestamps.push(now);
  record(item.recordCategory, item.recordDetail, item.recordMeta);
  log(item.logMsg);
}

function ensureDrainTimer(): void {
  if (drainTimer) return;
  drainTimer = setInterval(drainQueue, DRAIN_INTERVAL_MS);
}

function enqueueIntent(
  payload: any,
  recordCategory: string,
  recordDetail: string,
  recordMeta: Record<string, unknown>,
  logMsg: string,
): boolean {
  // Never send intents into a replay — it's read-only playback. This is the
  // single choke point covering all automation + manual sends.
  if (useStore.getState().isReplay) {
    trackMetric("intentsBlockedReplay");
    return false;
  }
  ensureDrainTimer();

  // If queue is empty and we're under limits, send immediately
  const now = Date.now();
  pruneTimestamps(now);
  if (
    intentQueue.length === 0 &&
    countInWindow(now, 1_000) < MAX_PER_SECOND &&
    countInWindow(now, 60_000) < MAX_PER_MINUTE
  ) {
    trackMetric("intentsSent");
    sendToMainWorld(payload);
    sentTimestamps.push(now);
    record(recordCategory, recordDetail, recordMeta);
    log(logMsg);
    return true;
  }

  // Otherwise queue it — will be drained by the next interval tick
  trackMetric("intentsQueued");
  intentQueue.push({ payload, recordCategory, recordDetail, recordMeta, logMsg });
  return true;
}

/**
 * Send an intent immediately, bypassing the rate limiter queue.
 * Use for manual user-initiated actions (UI button clicks) that need
 * instant feedback. Do NOT use for automated loops.
 */
function sendIntentNow(
  payload: any,
  recordCategory: string,
  recordDetail: string,
  recordMeta: Record<string, unknown>,
  logMsg: string,
): void {
  if (useStore.getState().isReplay) {
    trackMetric("intentsBlockedReplay");
    return;
  }
  sendToMainWorld(payload);
  const now = Date.now();
  sentTimestamps.push(now);
  pruneTimestamps(now);
  record(recordCategory, recordDetail, recordMeta);
  log(logMsg);
}

// ---------- Paced multi-target sender ----------

export interface PacedProgress {
  sent: number;
  total: number;
  /**
   * Terminal event: the batch has ended — either it finished naturally or was
   * cancelled (including via cancelAllPaced() on new-match reset). Consumers use
   * this to clear their "sending N/M" progress line even when a batch is aborted
   * out-of-band (where no per-send event ever reaches the setpoint).
   */
  done?: boolean;
}

export interface PacedHandle {
  cancel: () => void;
}

interface PacedOptions {
  spacingMs?: number;
  jitterMs?: number;
  onProgress?: (p: PacedProgress) => void;
}

// Active paced batches, tracked module-level so cancelAllPaced() (fired on
// new-match reset) can stop every in-flight batch — otherwise a paced blast
// keeps firing stale-PlayerID intents into the next match.
const activePacers = new Set<PacedHandle>();

/**
 * Fire fn(id) for each id at human cadence (spacingMs ± jitterMs) instead of
 * dumping the whole selection into the global limiter in one event-loop tick.
 * The first target fires immediately; each subsequent one after a randomized
 * delay. Returns a cancel handle and registers it module-level so
 * cancelAllPaced() can abort it. onProgress fires after each send.
 */
export function sendPaced(
  ids: string[],
  fn: (id: string) => void,
  opts: PacedOptions = {},
): PacedHandle {
  const { spacingMs = 900, jitterMs = 400, onProgress } = opts;
  let idx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const handle: PacedHandle = {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      activePacers.delete(handle);
      // Fire a terminal event so consumers clear their progress line — this is
      // the only signal cancelAllPaced() (new-match reset) gives the UI.
      onProgress?.({ sent: idx, total: ids.length, done: true });
    },
  };

  function step(): void {
    if (cancelled) return;
    fn(ids[idx]);
    idx++;
    onProgress?.({ sent: idx, total: ids.length });
    if (idx >= ids.length) {
      handle.cancel();
      return;
    }
    timer = setTimeout(step, spacingMs + Math.random() * jitterMs);
  }

  activePacers.add(handle);
  if (ids.length === 0) {
    handle.cancel();
    return handle;
  }
  step(); // first target fires immediately
  return handle;
}

/** Cancel every in-flight paced batch. Called on new-match reset. */
export function cancelAllPaced(): void {
  for (const h of [...activePacers]) h.cancel();
}

// ---------- Helpers ----------

function log(...args: unknown[]): void {
  console.log("[Hammer]", ...args);
}

// ---------- asSendTroops ----------

export function asSendTroops(targetId: string, amount: number | null): boolean {
  return enqueueIntent(
    { action: "troops", targetId, amount },
    "cmd", "send.troops", { targetId, amount: amount ?? 0 },
    `[SEND] Troops command dispatched: ${targetId} ${amount}`,
  );
}

// ---------- asSendGold ----------

export function asSendGold(targetId: string, amount: number): boolean {
  return enqueueIntent(
    { action: "gold", targetId, amount },
    "cmd", "send.gold", { targetId, amount },
    `[SEND] Gold command dispatched: ${targetId} ${amount}`,
  );
}

// ---------- asSetAttackRatio ----------

/**
 * Set the game's attack-ratio slider (fraction 0.01–1.0 of troops committed per
 * manual attack). This is a pure client-side write — it sends NO server intent,
 * so it deliberately bypasses the rate-limiter queue and may be called as often
 * as the governor likes. Blocked only during replay playback.
 */
export function asSetAttackRatio(ratio: number): void {
  if (useStore.getState().isReplay) return;
  const clamped = Math.max(0.01, Math.min(1.0, ratio));
  sendToMainWorld({ action: "set-attack-ratio", amount: clamped });
}

/**
 * Push the governor's absolute reserve floor (INTERNAL troop units) to the
 * MAIN world, where the per-click emit-wrap clamps manual attacks so they can
 * never spend below it. Refreshed every governor tick. Client-side only — no
 * server intent, so it bypasses the rate limiter. Blocked during replay.
 */
export function asSetAttackFloor(floorTroops: number): void {
  if (useStore.getState().isReplay) return;
  sendToMainWorld({ action: "set-attack-floor", amount: Math.max(0, floorTroops) });
}

/**
 * Hand the attack ratio back to the player's native slider. Reads the game's
 * ControlPanel (which the player's own drag / T-Y keep current) and copies its
 * value into the shared uiState, so after the governor disengages the next
 * manual attack uses the visible slider's value, not the governor's last write.
 * Client-side only — not rate-limited.
 */
export function asReleaseAttackRatio(): void {
  if (useStore.getState().isReplay) return;
  sendToMainWorld({ action: "release-attack-ratio" });
}

// ---------- sendEmoji ----------

export function sendEmoji(recipientId: string, emojiIndex: number): boolean {
  return enqueueIntent(
    { action: "emoji", recipientId, emojiIndex },
    "cmd", "send.emoji", { recipientId, emojiIndex },
    `[SEND] Emoji command dispatched: ${recipientId} ${emojiIndex}`,
  );
}

// ---------- sendQuickChat ----------

export function sendQuickChat(
  recipientId: string,
  quickChatKey: string,
  targetPlayerId?: string,
): boolean {
  return enqueueIntent(
    { action: "quickchat", recipientId, key: quickChatKey, targetPlayerId },
    "cmd", "send.quickchat", { recipientId, key: quickChatKey, targetPlayerId },
    `[SEND] QuickChat command dispatched: ${recipientId} ${quickChatKey}`,
  );
}

// ---------- sendAllianceRequest ----------

export function sendAllianceRequest(recipientId: string): boolean {
  return enqueueIntent(
    { action: "alliance", recipientId },
    "cmd", "send.alliance", { recipientId },
    `[SEND] Alliance command dispatched: ${recipientId}`,
  );
}

// ---------- sendBetray ----------

/** Break alliance with a player (uses separate break-alliance event class) */
export function sendBetray(recipientId: string): boolean {
  return enqueueIntent(
    { action: "betray", recipientId },
    "cmd", "send.betray", { recipientId },
    `[SEND] Betray command dispatched: ${recipientId}`,
  );
}

// ---------- sendEmbargo ----------

/** Stop trading with a player (embargo start) — rate-limited for automation */
export function sendEmbargoStart(targetId: string): boolean {
  return enqueueIntent(
    { action: "embargo", targetId, embargoAction: "start" },
    "cmd", "embargo.start", { targetId },
    `[SEND] Embargo start (stop trading): ${targetId}`,
  );
}

/** Resume trading with a player (embargo stop) — rate-limited for automation */
export function sendEmbargoStop(targetId: string): boolean {
  return enqueueIntent(
    { action: "embargo", targetId, embargoAction: "stop" },
    "cmd", "embargo.stop", { targetId },
    `[SEND] Embargo stop (resume trading): ${targetId}`,
  );
}

/** Stop trading — immediate (bypasses queue, for UI button clicks) */
export function sendEmbargoStartNow(targetId: string): void {
  sendIntentNow(
    { action: "embargo", targetId, embargoAction: "start" },
    "cmd", "embargo.start", { targetId },
    `[SEND] Embargo start (immediate): ${targetId}`,
  );
}

/** Resume trading — immediate (bypasses queue, for UI button clicks) */
export function sendEmbargoStopNow(targetId: string): void {
  sendIntentNow(
    { action: "embargo", targetId, embargoAction: "stop" },
    "cmd", "embargo.stop", { targetId },
    `[SEND] Embargo stop (immediate): ${targetId}`,
  );
}

/** Embargo ALL players at once (server-side, single intent) */
export function sendEmbargoAll(): boolean {
  return enqueueIntent(
    { action: "embargo_all", embargoAction: "start" },
    "cmd", "embargo_all.start", {},
    `[SEND] Embargo all (stop trading with everyone)`,
  );
}

/** Resume trading with ALL players at once (server-side, single intent) */
export function sendResumeAll(): boolean {
  return enqueueIntent(
    { action: "embargo_all", embargoAction: "stop" },
    "cmd", "embargo_all.stop", {},
    `[SEND] Resume all (resume trading with everyone)`,
  );
}

// ---------- getPlayerView ----------

/**
 * PlayerView objects live in the MAIN world — not accessible from isolated world.
 * This function is kept for API compatibility but always returns null.
 * All actual PlayerView access happens in hooks.content.ts (MAIN world).
 */
export function getPlayerView(_playerId: string): unknown | null {
  return null;
}

// ---------- verifyClientID ----------

export function verifyClientID(): {
  hammerClientID: string | null;
  gameViewClientID: string | null;
  transportClientID: string | null;
  match: boolean;
} {
  return {
    hammerClientID: useStore.getState().currentClientID,
    gameViewClientID: null,
    transportClientID: null,
    match: false,
  };
}
