import type { LogEntry } from "../types";
import { LOG_LEVELS, CONSOLE_LEVEL_MAP } from "../constants";

export function extractCategory(args: unknown[]): string | null {
  if (args.length > 0 && typeof args[0] === "string") {
    const match = (args[0] as string).match(/\[([^\]]+)\]/);
    return match ? match[1] : null;
  }
  return null;
}

export function serializeValue(value: unknown): unknown {
  try {
    if (value instanceof Error) {
      return { type: "Error", message: value.message, stack: value.stack, name: value.name };
    } else if (typeof value === "object" && value !== null) {
      try {
        JSON.stringify(value);
        return value;
      } catch {
        return "[Circular]";
      }
    }
    return value;
  } catch {
    return "[SerializationError]";
  }
}

export function createLogBuffer(maxEntries: number = 1000) {
  let minLogLevel: number = LOG_LEVELS.DEBUG;
  const logBuffer: LogEntry[] = [];
  let logIndex = 0;

  function addLog(entry: LogEntry): void {
    const entryLevel = CONSOLE_LEVEL_MAP[entry.level] || LOG_LEVELS.INFO;
    if (entryLevel < minLogLevel) return;
    entry.category = extractCategory(entry.args);
    if (logBuffer.length < maxEntries) {
      logBuffer.push(entry);
    } else {
      logBuffer[logIndex % maxEntries] = entry;
      logIndex++;
    }
  }

  function exportLogs(options: { limit?: number; level?: string | null; minLevel?: string | null } = {}) {
    const { limit = 100, level = null, minLevel = null } = options;
    let logs = logBuffer.slice();
    if (level) logs = logs.filter((log) => log.level === level);
    if (minLevel) {
      const minLevelNum = LOG_LEVELS[minLevel.toUpperCase() as keyof typeof LOG_LEVELS] || 0;
      logs = logs.filter((log) => (CONSOLE_LEVEL_MAP[log.level] || 0) >= minLevelNum);
    }
    logs = logs.slice(-limit);
    return {
      totalLogs: logBuffer.length,
      exportedLogs: logs.length,
      logs,
    };
  }

  function setMinLevel(level: number) {
    minLogLevel = level;
  }

  return { addLog, exportLogs, getBuffer: () => logBuffer, setMinLevel };
}
