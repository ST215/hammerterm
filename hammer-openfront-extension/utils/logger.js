/**
 * Enhanced Logging System for Hammer OpenFront Helper
 * 
 * Captures all console logs, errors, and exceptions for LLM-assisted debugging.
 * Usage:
 *   1. Include this file before other scripts
 *   2. Use console.log/warn/error as normal
 *   3. Call window.__exportLogsForLLM() to get JSON for Claude
 */

(function() {
  'use strict';

  // Configuration
  const MAX_LOG_ENTRIES = 1000; // Circular buffer
  const CONTEXT = typeof window !== 'undefined' && window.location ?
    (window.location.href.includes('chrome-extension://') ? 'extension' : 'page') :
    'unknown';

  // Log levels (numeric for easy comparison)
  const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  const LEVEL_NAMES = ['debug', 'info', 'warn', 'error'];

  // Map console methods to numeric levels
  const CONSOLE_LEVEL_MAP = {
    'debug': LOG_LEVELS.DEBUG,
    'log': LOG_LEVELS.INFO,
    'info': LOG_LEVELS.INFO,
    'warn': LOG_LEVELS.WARN,
    'error': LOG_LEVELS.ERROR
  };

  // Minimum log level to capture (can be changed via storage)
  let minLogLevel = LOG_LEVELS.DEBUG; // Default: capture everything

  // Log buffer (circular)
  const logBuffer = [];
  let logIndex = 0;

  // Extract category from log message (e.g., "[SAM]" from "[OF-Ext][SAM] message")
  function extractCategory(args) {
    if (args.length > 0 && typeof args[0] === 'string') {
      const match = args[0].match(/\[([^\]]+)\]$/);
      return match ? match[1] : null;
    }
    return null;
  }

  // Add log entry to buffer
  function addLog(entry) {
    // Filter by minimum log level
    const entryLevel = CONSOLE_LEVEL_MAP[entry.level] || LOG_LEVELS.INFO;
    if (entryLevel < minLogLevel) {
      return; // Skip this log
    }

    // Extract category from message
    entry.category = extractCategory(entry.args);

    if (logBuffer.length < MAX_LOG_ENTRIES) {
      logBuffer.push(entry);
    } else {
      // Circular buffer: overwrite oldest entry
      logBuffer[logIndex % MAX_LOG_ENTRIES] = entry;
      logIndex++;
    }
  }

  // Serialize value for logging (handles errors, objects, etc.)
  function serializeValue(value) {
    try {
      if (value instanceof Error) {
        return {
          type: 'Error',
          message: value.message,
          stack: value.stack,
          name: value.name
        };
      } else if (typeof value === 'object' && value !== null) {
        // Avoid circular references
        try {
          JSON.stringify(value);
          return value;
        } catch (e) {
          return '[Circular or Complex Object]';
        }
      }
      return value;
    } catch (e) {
      return '[Serialization Error]';
    }
  }

  // Wrap console method
  function wrapConsole(level) {
    const original = console[level];
    console[level] = function(...args) {
      try {
        addLog({
          level,
          args: args.map(serializeValue),
          timestamp: new Date().toISOString(),
          context: CONTEXT
        });
      } catch (e) {
        // Fail silently - don't break the app
      }
      return original.apply(console, args);
    };
  }

  // Install console wrappers
  ['log', 'warn', 'error', 'info', 'debug'].forEach(wrapConsole);

  // Capture uncaught errors
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      addLog({
        type: 'uncaughtError',
        level: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error && event.error.stack,
        timestamp: new Date().toISOString(),
        context: CONTEXT
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      addLog({
        type: 'unhandledRejection',
        level: 'error',
        reason: serializeValue(event.reason),
        stack: event.reason && event.reason.stack,
        timestamp: new Date().toISOString(),
        context: CONTEXT
      });
    });
  }

  // Load log level preference from storage
  function loadLogLevel() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['of_log_level'], (result) => {
        if (result.of_log_level !== undefined) {
          minLogLevel = result.of_log_level;
          console.log('[Logger] Loaded log level:', LEVEL_NAMES[minLogLevel]);
        }
      });
    }
  }

  // Set log level
  window.__setLogLevel = function(level) {
    if (typeof level === 'string') {
      level = LOG_LEVELS[level.toUpperCase()];
    }
    if (level >= 0 && level <= 3) {
      minLogLevel = level;
      console.log('[Logger] Log level set to:', LEVEL_NAMES[minLogLevel]);
      // Save to storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ of_log_level: minLogLevel });
      }
    }
  };

  // Get current log level
  window.__getLogLevel = function() {
    return {
      numeric: minLogLevel,
      name: LEVEL_NAMES[minLogLevel]
    };
  };

  // Load log level on init
  loadLogLevel();

  // Export function for LLM debugging
  window.__exportLogsForLLM = function(options = {}) {
    const {
      limit = 100,        // Max logs to return
      level = null,       // Filter by level (e.g., 'error')
      minLevel = null,    // Minimum level (e.g., 'warn' = warn + error)
      since = null,       // ISO timestamp - only logs after this
      context = null,     // Filter by context
      category = null     // Filter by category (e.g., 'SAM', 'Keyboard')
    } = options;

    let logs = logBuffer.slice(); // Copy buffer

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    if (minLevel) {
      const minLevelNum = LOG_LEVELS[minLevel.toUpperCase()] || 0;
      logs = logs.filter(log => (CONSOLE_LEVEL_MAP[log.level] || 0) >= minLevelNum);
    }
    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }
    if (context) {
      logs = logs.filter(log => log.context === context);
    }
    if (category) {
      logs = logs.filter(log => log.category === category);
    }

    // Take most recent entries
    logs = logs.slice(-limit);

    // Build export object
    const exportData = {
      extensionVersion: '0.1.0',
      context: CONTEXT,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' && window.location ? window.location.href : 'unknown',
      timestamp: new Date().toISOString(),
      totalLogs: logBuffer.length,
      exportedLogs: logs.length,
      logs: logs
    };

    return JSON.stringify(exportData, null, 2);
  };

  // Quick export for errors only
  window.__exportErrorsForLLM = function() {
    return window.__exportLogsForLLM({ level: 'error', limit: 50 });
  };

  // Get recent logs (for preview in popup)
  window.__getRecentLogs = function(count = 5) {
    return logBuffer.slice(-count);
  };

  // Clear log buffer
  window.__clearLogs = function() {
    logBuffer.length = 0;
    logIndex = 0;
    console.log('[Logger] Log buffer cleared');
  };

  console.log('[Logger] Enhanced logging system initialized');
  console.log('[Logger] Use window.__exportLogsForLLM() to export logs for debugging');
})();
