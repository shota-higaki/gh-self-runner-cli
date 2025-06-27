import * as p from '@clack/prompts';
import { CLIError, formatError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Wraps a command action with standardized error handling
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic constraint for flexible function signatures
export function withErrorHandling<T extends any[]>(
  action: (...args: T) => Promise<void> | void,
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      if (error instanceof CLIError) {
        p.log.error(error.message);
        if (error.details) {
          logger.dim(`  ${error.details}`);
        }
        process.exit(error.exitCode);
      } else if (error instanceof Error) {
        p.log.error(error.message);
        if (process.env.DEBUG) {
          logger.error(error.stack || '', error);
        }
        process.exit(1);
      } else {
        p.log.error(formatError(error));
        process.exit(1);
      }
    }
  };
}

/**
 * Handle cancellation from prompts
 */
export function handleCancel(): never {
  p.cancel('Operation cancelled');
  process.exit(0);
}

/**
 * Check if a value is cancelled and handle it
 */
export function checkCancel<T>(value: T | symbol): asserts value is T {
  if (p.isCancel(value)) {
    handleCancel();
  }
}
