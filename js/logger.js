/**
 * Centralized logger for the kiosk application
 * Provides log levels, timestamps, and consistent formatting
 */

import { getLogLevel } from './config.js';

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * Logger class
 */
export class Logger {
  constructor(options = {}) {
    this.minLevel = options.minLevel !== undefined ? options.minLevel : LogLevel.INFO;
    this.useColors = options.useColors !== undefined ? options.useColors : true;
    this.useTimestamps = options.useTimestamps !== undefined ? options.useTimestamps : true;
    this.prefix = options.prefix || '';
  }

  _format(level, args) {
    const levelName = Object.keys(LogLevel).find(key => LogLevel[key] === level);
    const timestamp = this.useTimestamps ? `[${new Date().toISOString()}] ` : '';
    const color = this._getColor(level);
    const reset = this.useColors ? '\x1b[0m' : '';
    const levelTag = this.useColors ? `${color}[${levelName}]\x1b[0m` : `[${levelName}]`;
    const prefix = this.prefix ? `[${this.prefix}] ` : '';

    return `${timestamp}${prefix}${levelTag} ${this._stringify(args)}`;
  }

  _getColor(level) {
    switch (level) {
      case LogLevel.DEBUG: return '\x1b[36m'; // cyan
      case LogLevel.INFO: return '\x1b[32m';  // green
      case LogLevel.WARN: return '\x1b[33m'; // yellow
      case LogLevel.ERROR: return '\x1b[31m'; // red
      default: return '';
    }
  }

  _stringify(args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return '[Object]';
        }
      }
      return String(arg);
    }).join(' ');
  }

  debug(...args) {
    if (this.minLevel <= LogLevel.DEBUG) {
      console.log(this._format(LogLevel.DEBUG, args));
    }
  }

  info(...args) {
    if (this.minLevel <= LogLevel.INFO) {
      console.log(this._format(LogLevel.INFO, args));
    }
  }

  warn(...args) {
    if (this.minLevel <= LogLevel.WARN) {
      console.warn(this._format(LogLevel.WARN, args));
    }
  }

  error(...args) {
    if (this.minLevel <= LogLevel.ERROR) {
      console.error(this._format(LogLevel.ERROR, args));
    }
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.minLevel = getLogLevel(level);
    } else {
      this.minLevel = level;
    }
  }

  // For compatibility with existing console calls
  log(...args) {
    this.info(...args);
  }
}

/**
 * Create a scoped logger with a prefix
 * @param {string} prefix - Component name prefix
 * @returns {Logger}
 */
export function createLogger(prefix) {
  return new Logger({ prefix });
}

// Default logger instance (used by modules that just import logger)
export const logger = new Logger();

// Export LogLevel for configuration
export { LogLevel };
