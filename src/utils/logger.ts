import color from 'picocolors';

// Enhanced logger with colored output
const LOG_LEVELS = {
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

export interface LoggerOptions {
  showTimestamp?: boolean;
  showLevel?: boolean;
}

class SimpleLogger {
  private level: LogLevel;
  private isCLI: boolean;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    this.level = envLevel && envLevel in LOG_LEVELS ? envLevel : 'info';
    // In CLI mode, we don't show debug logs by default
    this.isCLI = process.env.NODE_ENV !== 'test' && process.stdout.isTTY;

    // Override level for CLI mode - never show debug unless explicitly set
    if (this.isCLI && !process.env.LOG_LEVEL) {
      this.level = 'info';
    }
  }

  setLevel(level: string): void {
    const normalizedLevel = level.toLowerCase() as LogLevel;
    if (normalizedLevel in LOG_LEVELS) {
      this.level = normalizedLevel;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, options?: LoggerOptions): string {
    const showTimestamp = options?.showTimestamp ?? !this.isCLI;
    const showLevel = options?.showLevel ?? !this.isCLI;

    let formatted = '';

    if (showTimestamp) {
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
      formatted += `${timestamp} `;
    }

    if (showLevel) {
      formatted += `[${level}]: `;
    }

    formatted += message;
    return formatted;
  }

  // CLI-friendly output methods (no timestamp/level prefix)
  success(message: string): void {
    if (this.shouldLog('info')) {
      console.log(color.green(`✓ ${message}`));
    }
  }

  warning(message: string): void {
    if (this.shouldLog('warn')) {
      console.log(color.yellow(`⚠ ${message}`));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      const fullMessage = meta ? `${message} ${JSON.stringify(meta)}` : message;

      if (this.isCLI) {
        // For CLI, use clean output without timestamp
        console.log(color.cyan(`ℹ ${fullMessage}`));
      } else {
        // For non-CLI (logs, tests), use timestamped format
        console.log(color.blue(this.formatMessage('info', fullMessage)));
      }
    }
  }

  error(message: string, error?: Error): void {
    if (this.shouldLog('error')) {
      let fullMessage = message;
      if (error instanceof Error) {
        fullMessage += `: ${error.message}`;
        if (this.level === 'debug' && error.stack) {
          fullMessage += `\n${error.stack}`;
        }
      } else if (error) {
        fullMessage += ` ${JSON.stringify(error)}`;
      }

      if (this.isCLI) {
        // For CLI, use clean error output
        console.error(color.red(`✖ ${fullMessage}`));
      } else {
        // For non-CLI, use timestamped format
        console.error(color.red(this.formatMessage('error', fullMessage)));
      }
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      const fullMessage = meta ? `${message} ${JSON.stringify(meta)}` : message;

      if (this.isCLI) {
        // For CLI, use clean warning output
        console.warn(color.yellow(`⚠ ${fullMessage}`));
      } else {
        // For non-CLI, use timestamped format
        console.warn(color.yellow(this.formatMessage('warn', fullMessage)));
      }
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    // Debug messages are only shown when explicitly enabled
    if (this.shouldLog('debug')) {
      const fullMessage = meta ? `${message} ${JSON.stringify(meta)}` : message;
      // Always use timestamped format for debug
      console.log(
        color.gray(
          this.formatMessage('debug', fullMessage, { showTimestamp: true, showLevel: true }),
        ),
      );
    }
  }

  // CLI output helpers
  dim(message: string): void {
    if (this.isCLI) {
      console.log(color.dim(message));
    } else {
      this.info(message);
    }
  }

  bold(message: string): void {
    if (this.isCLI) {
      console.log(color.bold(message));
    } else {
      this.info(message);
    }
  }

  plain(message: string): void {
    console.log(message);
  }

  emptyLine(): void {
    console.log();
  }

  // No-op for file transport compatibility
  addFileTransport(_filename: string): void {
    // File logging removed - use standard output redirection if needed
  }
}

export const logger = new SimpleLogger();
