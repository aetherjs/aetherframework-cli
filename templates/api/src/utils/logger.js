/**
 * High-Performance Async Logger (Pure ESM, No Dependencies, No Workers)
 * 
 * Features:
 * 1. Non-blocking I/O: Uses buffered async writes to keep main thread free.
 * 2. Zero Dependencies: Pure Node.js built-in modules only.
 * 3. ESM Compatible: Fully compatible with "type": "module".
 * 4. Pino-like API: Simple info/warn/error methods with JSON structured logging.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ============================================
// ESM COMPATIBILITY FIXES
// ============================================

// In ESM, __dirname and __filename are not available.
// We derive them from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

const LOG_DIR = path.join(process.cwd(), 'logs');
const BUFFER_SIZE = 64 * 1024; // 64KB batch size for disk writes
const FLUSH_INTERVAL_MS = 1000; // Max time to wait before flushing buffer

const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60
};

// Ensure log directory exists synchronously at startup
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================
// ASYNC WRITE STREAM MANAGER
// ============================================

/**
 * Manages asynchronous file writes using a buffer queue.
 * This decouples the main thread from disk I/O latency.
 */
class AsyncFileWriter {
  constructor(filePath) {
    this.filePath = filePath;
    this.buffer = [];
    this.bufferLength = 0;
    this.isWriting = false;
    this.pendingWrites = 0;
    
    // Start periodic flush to ensure logs aren't lost if process crashes
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    
    // Handle process exit gracefully
    this.boundExitHandler = this.exitHandler.bind(this);
    process.on('exit', this.boundExitHandler);
    process.on('SIGINT', this.boundExitHandler);
    process.on('SIGTERM', this.boundExitHandler);
  }

  /**
   * Add data to the buffer. Returns immediately (non-blocking).
   * @param {string} data - The log line to write
   */
  write(data) {
    this.buffer.push(data);
    this.bufferLength += data.length;

    // If buffer exceeds size limit, trigger immediate async flush
    if (this.bufferLength >= BUFFER_SIZE && !this.isWriting) {
      this.flush();
    }
  }

  /**
   * Flush the buffer to disk asynchronously.
   */
  async flush() {
    if (this.isWriting || this.buffer.length === 0) {
      return;
    }

    this.isWriting = true;
    const currentBuffer = this.buffer;
    const currentLength = this.bufferLength;
    
    // Reset buffer immediately so main thread can continue adding new logs
    this.buffer = [];
    this.bufferLength = 0;

    try {
      // Combine all lines into one string for a single system call
      const content = currentBuffer.join('');
      
      // Use Promise-based fs.appendFile for non-blocking I/O
      await fs.promises.appendFile(this.filePath, content, 'utf8');
    } catch (err) {
      // If write fails, prepend data back to buffer to retry next time
      // Note: In high-load scenarios, you might want to drop logs instead of blocking
      this.buffer.unshift(...currentBuffer);
      this.bufferLength += currentLength;
      console.error(`[Logger] Failed to write to ${this.filePath}:`, err.message);
    } finally {
      this.isWriting = false;
      
      // If new data arrived while writing, flush again immediately
      if (this.buffer.length > 0) {
        setImmediate(() => this.flush());
      }
    }
  }

  /**
   * Final flush before process exit
   */
  async exitHandler() {
    clearInterval(this.flushTimer);
    await this.flush();
  }
  
  /**
   * Cleanup listeners
   */
  destroy() {
    clearInterval(this.flushTimer);
    process.removeListener('exit', this.boundExitHandler);
    process.removeListener('SIGINT', this.boundExitHandler);
    process.removeListener('SIGTERM', this.boundExitHandler);
    return this.flush();
  }
}

// ============================================
// LOGGER CORE
// ============================================

class Logger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.INFO;
    this.prettyPrint = options.prettyPrint ?? (process.env.NODE_ENV !== 'production');
    
    // Initialize writers for different log files
    this.writers = {
      info: new AsyncFileWriter(path.join(LOG_DIR, 'info.log')),
      error: new AsyncFileWriter(path.join(LOG_DIR, 'error.log')),
      debug: new AsyncFileWriter(path.join(LOG_DIR, 'debug.log'))
    };

    // Cache hostname to avoid repeated OS calls
    this.hostname = os.hostname();
  }

  /**
   * Internal log handler
   * @param {string} levelName - 'INFO', 'ERROR', etc.
   * @param {number} levelValue - Numeric level
   * @param {string} msg - Log message
   * @param {object} [meta] - Optional metadata object
   */
  _log(levelName, levelValue, msg, meta) {
    // 1. Check Level
    if (levelValue < this.level) return;

    // 2. Prepare Data (Synchronous & Fast)
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    
    // Create log object
    const logObj = {
      level: levelName,
      time: timestamp,
      pid: pid,
      hostname: this.hostname,
      msg: msg
    };

    // Merge metadata if provided
    if (meta) {
      // Handle Error objects specifically to get stack traces
      if (meta instanceof Error) {
        logObj.err = {
          type: meta.constructor.name,
          message: meta.message,
          stack: meta.stack
        };
      } else if (typeof meta === 'object') {
        Object.assign(logObj, meta);
      }
    }

    // 3. Serialize to JSON (Synchronous)
    // Using try-catch in case of circular references
    let jsonStr;
    try {
      jsonStr = JSON.stringify(logObj) + '\n';
    } catch (e) {
      jsonStr = JSON.stringify({ ...logObj, msg: '[Circular Reference Detected]' }) + '\n';
    }

    // 4. Write to Disk (Asynchronous / Non-Blocking)
    // Determine which file writer to use
    let writerKey = 'info';
    if (levelValue >= LOG_LEVELS.ERROR) writerKey = 'error';
    else if (levelValue < LOG_LEVELS.INFO) writerKey = 'debug';
    
    this.writers[writerKey].write(jsonStr);

    // 5. Console Output (Only if prettyPrint is enabled)
    if (this.prettyPrint) {
      this._printConsole(levelName, msg, meta);
    }
  }

  /**
   * Pretty print to console for development
   */
  _printConsole(level, msg, meta) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level}]`;
    
    let output = '';
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        output = `\x1b[31m${prefix}\x1b[0m ${msg}`; // Red
        break;
      case 'WARN':
        output = `\x1b[33m${prefix}\x1b[0m ${msg}`; // Yellow
        break;
      case 'DEBUG':
        output = `\x1b[90m${prefix}\x1b[0m ${msg}`; // Gray
        break;
      default:
        output = `\x1b[32m${prefix}\x1b[0m ${msg}`; // Green
    }

    if (meta) {
      console.log(output, meta);
    } else {
      console.log(output);
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  trace(msg, meta) { this._log('TRACE', LOG_LEVELS.TRACE, msg, meta); }
  debug(msg, meta) { this._log('DEBUG', LOG_LEVELS.DEBUG, msg, meta); }
  info(msg, meta)  { this._log('INFO',  LOG_LEVELS.INFO,  msg, meta); }
  warn(msg, meta)  { this._log('WARN',  LOG_LEVELS.WARN,  msg, meta); }
  error(msg, meta) { this._log('ERROR', LOG_LEVELS.ERROR, msg, meta); }
  fatal(msg, meta) { this._log('FATAL', LOG_LEVELS.FATAL, msg, meta); }

  /**
   * Create a child logger with bound context
   * @param {object} bindings - Key-value pairs to attach to every log
   */
  child(bindings) {
    const parentLog = this._log.bind(this);
    const childLogger = {
      trace: (msg, meta) => parentLog('TRACE', LOG_LEVELS.TRACE, msg, { ...bindings, ...meta }),
      debug: (msg, meta) => parentLog('DEBUG', LOG_LEVELS.DEBUG, msg, { ...bindings, ...meta }),
      info:  (msg, meta) => parentLog('INFO',  LOG_LEVELS.INFO,  msg, { ...bindings, ...meta }),
      warn:  (msg, meta) => parentLog('WARN',  LOG_LEVELS.WARN,  msg, { ...bindings, ...meta }),
      error: (msg, meta) => parentLog('ERROR', LOG_LEVELS.ERROR, msg, { ...bindings, ...meta }),
      fatal: (msg, meta) => parentLog('FATAL', LOG_LEVELS.FATAL, msg, { ...bindings, ...meta })
    };
    return childLogger;
  }

  /**
   * Force flush all buffers (useful for testing or graceful shutdown)
   */
  async flush() {
    await Promise.all([
      this.writers.info.flush(),
      this.writers.error.flush(),
      this.writers.debug.flush()
    ]);
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

const logger = new Logger({
  level: process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO,
  prettyPrint: process.env.NODE_ENV !== 'production'
});

export default logger;
