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

  // Log buffer (circular)
  const logBuffer = [];
  let logIndex = 0;

  // Add log entry to buffer
  function addLog(entry) {
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

  // Export function for LLM debugging
  window.__exportLogsForLLM = function(options = {}) {
    const {
      limit = 100,        // Max logs to return
      level = null,       // Filter by level (e.g., 'error')
      since = null,       // ISO timestamp - only logs after this
      context = null      // Filter by context
    } = options;

    let logs = logBuffer.slice(); // Copy buffer

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }
    if (context) {
      logs = logs.filter(log => log.context === context);
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
