/**
 * recorder.ts — Full-Match Flight Recorder.
 *
 * Captures everything needed to reconstruct and debug a complete match offline:
 * - All automation decisions with timing and context
 * - Player state progression snapshots (troops/gold/tiles for ALL players)
 * - Store configuration changes (when settings changed)
 * - Bridge throughput metrics (update frequency, throttle events)
 * - Rate limiter state (queue depth, drops)
 * - Message flow (donations, alliances, betrayals)
 * - WebSocket traffic summaries
 * - Hook discovery and status
 *
 * Design: zero-cost no-op when off. When on, appends to a flat array
 * with no per-event JSON.stringify — just object pushes. The expensive
 * serialization only happens at export time.
 *
 * Capacity: 200,000 events (~40MB). A 30-min match typically generates
 * 30-80K events depending on activity.
 */

export interface RecorderEvent {
  t: number;                       // ms since recording start
  cat: string;                     // category
  evt: string;                     // event name
  d: Record<string, unknown>;      // metadata
}

export interface PlayerSnapshot {
  id: string;
  sid: number | null;              // smallID
  name: string;
  team: number | null;
  alive: boolean;
  troops: number;
  gold: number;
  tiles: number;
  clientID: string | null;
}

export interface ConfigSnapshot {
  asTroops: {
    running: boolean;
    ratio: number;
    threshold: number;
    cooldownSec: number;
    allTeam: boolean;
    allAllies: boolean;
    targetCount: number;
  };
  asGold: {
    running: boolean;
    ratio: number;
    threshold: number;
    cooldownSec: number;
    allTeam: boolean;
    allAllies: boolean;
    targetCount: number;
  };
  reciprocate: {
    enabled: boolean;
    mode: string;
    autoPct: number;
    palantirMin: number;
    palantirMax: number;
    onTroops: boolean;
    onGold: boolean;
  };
  broadcast: {
    enabled: boolean;
    useSequence: boolean;
    sequenceLen: number;
  };
}

export interface BridgeMetrics {
  playerUpdatesReceived: number;   // total player update messages
  playerUpdatesApplied: number;    // updates that passed throttle
  playerUpdatesThrottled: number;  // updates dropped by stats throttle
  displayEventsReceived: number;   // total display events
  displayEventsProcessed: number;  // events that passed dedup
  displayEventsDeduped: number;    // events dropped by dedup
  wsMessagesIn: number;
  wsMessagesOut: number;
  wsMessagesFiltered: number;
  intentsSent: number;             // total intents dispatched
  intentsQueued: number;           // intents that went to queue (not immediate)
  intentsRateLimited: number;      // times rate limiter blocked drain
  dashboardSyncs: number;          // snapshots sent to dashboard
  dashboardSyncsSkipped: number;   // skipped due to no change
}

const MAX_EVENTS = 200_000;
const SNAPSHOT_INTERVAL_MS = 10_000;   // player snapshots every 10s
const CONFIG_INTERVAL_MS = 30_000;     // config snapshots every 30s
const METRICS_INTERVAL_MS = 5_000;     // bridge metrics every 5s

let events: RecorderEvent[] = [];
let playerSnapshots: { t: number; players: PlayerSnapshot[] }[] = [];
let configSnapshots: { t: number; config: ConfigSnapshot }[] = [];
let recording = false;
let startedAt = 0;
let dropped = 0;
let metadata: Record<string, unknown> = {};
let snapshotTimer: ReturnType<typeof setInterval> | null = null;

// Bridge metrics accumulator (reset on each flush)
const metrics: BridgeMetrics = {
  playerUpdatesReceived: 0,
  playerUpdatesApplied: 0,
  playerUpdatesThrottled: 0,
  displayEventsReceived: 0,
  displayEventsProcessed: 0,
  displayEventsDeduped: 0,
  wsMessagesIn: 0,
  wsMessagesOut: 0,
  wsMessagesFiltered: 0,
  intentsSent: 0,
  intentsQueued: 0,
  intentsRateLimited: 0,
  dashboardSyncs: 0,
  dashboardSyncsSkipped: 0,
};

// Callbacks for snapshot data — set by bridge.ts at init
let getPlayersSnapshot: (() => PlayerSnapshot[]) | null = null;
let getConfigSnapshot: (() => ConfigSnapshot) | null = null;

export function registerSnapshotProviders(
  playersFn: () => PlayerSnapshot[],
  configFn: () => ConfigSnapshot,
): void {
  getPlayersSnapshot = playersFn;
  getConfigSnapshot = configFn;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export function isRecording(): boolean {
  return recording;
}

export function startRecording(): void {
  events = [];
  playerSnapshots = [];
  configSnapshots = [];
  dropped = 0;
  metadata = {};
  resetMetrics();
  startedAt = Date.now();
  recording = true;

  // Take initial snapshots
  takePlayerSnapshot();
  takeConfigSnapshot();

  // Set up periodic snapshots
  if (snapshotTimer) clearInterval(snapshotTimer);
  let tickCount = 0;
  snapshotTimer = setInterval(() => {
    tickCount++;
    // Player snapshot every 10s (interval fires every 5s)
    if (tickCount % 2 === 0) takePlayerSnapshot();
    // Config snapshot every 30s
    if (tickCount % 6 === 0) takeConfigSnapshot();
    // Flush bridge metrics every 5s
    flushMetrics();
  }, METRICS_INTERVAL_MS);
}

export function stopRecording(): void {
  recording = false;
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  // Take final snapshots
  takePlayerSnapshot();
  takeConfigSnapshot();
  flushMetrics();
}

export function setMetadata(meta: Record<string, unknown>): void {
  metadata = meta;
}

/**
 * Record an event. Zero-cost when recording is off.
 * Categories:
 *   bridge   — init, bootstrap, game-reset, dashboard sync
 *   hook     — hook discovery (worker, ws, gameview, eventbus)
 *   state    — periodic state snapshots
 *   msg      — donation messages (received/sent troops/gold, deduped)
 *   auto-t   — auto-troops decisions (sent, skipped, error)
 *   auto-g   — auto-gold decisions (sent, skipped, error)
 *   recip    — reciprocate engine (queued, sent, skipped, dropped, deferred)
 *   cmd      — user commands (send.troops, send.emoji, etc.)
 *   ws       — websocket traffic (in, out)
 *   config   — store config changes (ratio, threshold, targets, running)
 *   limiter  — rate limiter events (queued, rate-limited, drain)
 *   metrics  — periodic bridge throughput metrics
 */
export function record(
  cat: string,
  evt: string,
  d?: Record<string, unknown>,
): void {
  if (!recording) return;
  if (events.length >= MAX_EVENTS) {
    events.shift();
    dropped++;
  }
  events.push({ t: Date.now() - startedAt, cat, evt, d: d ?? {} });
}

// ---------------------------------------------------------------------------
// Bridge metrics tracking (called from bridge.ts and send.ts)
// ---------------------------------------------------------------------------

export function trackMetric(key: keyof BridgeMetrics, increment = 1): void {
  if (!recording) return;
  metrics[key] += increment;
}

function resetMetrics(): void {
  for (const key of Object.keys(metrics) as (keyof BridgeMetrics)[]) {
    metrics[key] = 0;
  }
}

function flushMetrics(): void {
  if (!recording) return;
  // Only record if there's been activity
  const total = Object.values(metrics).reduce((s, v) => s + v, 0);
  if (total === 0) return;
  record("metrics", "bridge", { ...metrics });
  resetMetrics();
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

function takePlayerSnapshot(): void {
  if (!recording || !getPlayersSnapshot) return;
  const players = getPlayersSnapshot();
  if (players.length > 0) {
    playerSnapshots.push({ t: Date.now() - startedAt, players });
  }
}

function takeConfigSnapshot(): void {
  if (!recording || !getConfigSnapshot) return;
  const config = getConfigSnapshot();
  configSnapshots.push({ t: Date.now() - startedAt, config });
}

// ---------------------------------------------------------------------------
// Convenience: record config changes inline
// ---------------------------------------------------------------------------

export function recordConfigChange(field: string, value: unknown, prev?: unknown): void {
  if (!recording) return;
  record("config", "changed", { field, value, prev });
}

// ---------------------------------------------------------------------------
// Query (for UI)
// ---------------------------------------------------------------------------

export function getEventCount(): number {
  return events.length;
}

export function getRecentEvents(n: number): RecorderEvent[] {
  return events.slice(-n);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportRecording(): object {
  return {
    version: "15.14.0-ext",
    format: 2, // v2 = full match recording with snapshots
    exportedAt: Date.now(),
    session: {
      startedAt,
      durationMs: recording ? Date.now() - startedAt : (events.length > 0 ? events[events.length - 1].t : 0),
      recording,
    },
    stats: {
      totalEvents: events.length + dropped,
      captured: events.length,
      dropped,
      playerSnapshots: playerSnapshots.length,
      configSnapshots: configSnapshots.length,
    },
    metadata,
    // Core timeline — every decision, message, and command
    events: [...events],
    // Player state progression — troops/gold/tiles for ALL players every 10s
    playerTimeline: [...playerSnapshots],
    // Automation config over time — settings changes
    configTimeline: [...configSnapshots],
  };
}
