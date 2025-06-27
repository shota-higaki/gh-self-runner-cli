import * as p from '@clack/prompts';
import color from 'picocolors';
import type { Repository, RunnerStatus } from '../../types';
import { parseRepository } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import { checkCancel } from './error-handler.js';

/**
 * Prompt for repository input with validation
 */
export async function promptForRepository(
  message = 'Enter the GitHub repository (owner/repo)',
): Promise<Repository> {
  const repository = await p.text({
    message,
    placeholder: 'owner/repo',
    validate: (value) => {
      if (!value || !value.trim()) {
        return 'Repository is required';
      }
      try {
        parseRepository(value);
        return undefined;
      } catch {
        return 'Invalid repository format. Use: owner/repo or https://github.com/owner/repo';
      }
    },
  });

  checkCancel(repository);
  return parseRepository(repository);
}

/**
 * Get status indicator and text for a runner
 */
export function getRunnerStatusDisplay(runner: RunnerStatus): {
  indicator: string;
  text: string;
} {
  if (runner.status === 'idle') {
    return {
      indicator: color.green('●'),
      text: color.green('Idle'),
    };
  } else if (runner.status === 'active') {
    return {
      indicator: color.yellow('●'),
      text: color.yellow('Active'),
    };
  } else {
    return {
      indicator: color.gray('●'),
      text: color.gray('Offline'),
    };
  }
}

/**
 * Display runner status list
 */
export function displayRunnerStatus(runners: RunnerStatus[], title = 'Current runners:'): void {
  if (runners.length === 0) {
    p.log.info('No runners found');
    return;
  }

  p.log.info(title);
  runners.forEach((runner) => {
    const { indicator, text } = getRunnerStatusDisplay(runner);
    logger.plain(`  ${indicator} ${runner.name} - ${text}`);
  });
}

/**
 * Prompt for runner count
 */
export async function promptForRunnerCount(
  message = 'How many parallel runners do you want to create?',
  defaultValue = '1',
): Promise<number> {
  const runnerCount = await p.text({
    message,
    placeholder: defaultValue,
    initialValue: defaultValue,
    validate: (value) => {
      if (!value || value.trim() === '') return undefined;
      const num = parseInt(value, 10);
      if (Number.isNaN(num) || num < 1) {
        return 'Please enter a valid number (minimum 1)';
      }
      if (num > 10) {
        return 'Maximum 10 runners allowed';
      }
      return undefined;
    },
  });

  checkCancel(runnerCount);
  return parseInt(runnerCount || defaultValue, 10);
}

/**
 * Create a spinner with consistent styling
 */
export function createSpinner() {
  return p.spinner();
}

/**
 * Log success with consistent styling
 */
export function logSuccess(message: string): void {
  p.log.success(color.green(`✓ ${message}`));
}

/**
 * Log warning with consistent styling
 */
export function logWarning(message: string): void {
  p.log.warn(color.yellow(`! ${message}`));
}

/**
 * Log info with consistent styling
 */
export function logInfo(message: string): void {
  p.log.info(color.cyan(`i ${message}`));
}

/**
 * Log error with consistent styling
 */
export function logError(message: string): void {
  p.log.error(color.red(`× ${message}`));
}
