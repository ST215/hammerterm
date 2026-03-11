/**
 * recorder.ts — Flight Recorder for structured diagnostic capture.
 *
 * Standalone ring buffer with zero-cost no-op when recording is off.
 * No store dependency — safe to import from automation files.
 */

export interface RecorderEvent {
  t: number;
  cat: string;
  evt: string;
  d: Record<string, unknown>;
}

const MAX_EVENTS = 5000;

let events: RecorderEvent[] = [];
let recording = false;
let startedAt = 0;
let dropped = 0;
let metadata: Record<string, unknown> = {};

export function isRecording(): boolean {
  return recording;
}

export function startRecording(): void {
  events = [];
  dropped = 0;
  metadata = {};
  startedAt = Date.now();
  recording = true;
}

export function setMetadata(meta: Record<string, unknown>): void {
  metadata = meta;
}

export function stopRecording(): void {
  recording = false;
}

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

export function getEventCount(): number {
  return events.length;
}

export function getRecentEvents(n: number): RecorderEvent[] {
  return events.slice(-n);
}

export function exportRecording(): object {
  return {
    version: "15.0.0-ext",
    exportedAt: Date.now(),
    session: {
      startedAt,
      durationMs: Date.now() - startedAt,
    },
    stats: { totalEvents: events.length + dropped, dropped },
    metadata,
    events: [...events],
  };
}
