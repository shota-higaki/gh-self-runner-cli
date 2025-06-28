import path from 'path';
import { getConfigDirectory, readConfigDirectoryReference } from './config-directory.js';

/**
 * Get the base directory for configuration
 * First checks for a local reference file, then uses the global config directory
 */
export function getBaseDirectory(): string {
  // Check if there's a local reference to a config directory
  const referencedDir = readConfigDirectoryReference();
  if (referencedDir) {
    return referencedDir;
  }

  // Otherwise use the global config directory
  return getConfigDirectory();
}

/**
 * Path constants for the GitHub self-hosted runners
 */
export const PATHS = {
  // Base directory for all runner-related files
  get BASE_DIR() {
    return getBaseDirectory();
  },

  // Configuration file
  get CONFIG_FILE() {
    return path.join(this.BASE_DIR, 'config.yml');
  },

  // Old paths (for migration)
  OLD_RUNNERS_DIR: '.runners',
  OLD_CONFIG_FILE: '.github-runners.yml',
} as const;

/**
 * Get the runner directory path for a specific repository
 */
export function getRunnerRepoDir(owner: string, repo: string): string {
  return path.resolve(PATHS.BASE_DIR, 'runners', `${owner}-${repo}`);
}

/**
 * Get the runner directory path for a specific runner
 */
export function getRunnerDir(owner: string, repo: string, runnerId: string): string {
  return path.join(getRunnerRepoDir(owner, repo), runnerId);
}

/**
 * Get the log file path for a specific runner
 */
export function getRunnerLogPath(owner: string, repo: string, runnerId: string): string {
  return path.join(getRunnerDir(owner, repo, runnerId), 'runner.log');
}

/**
 * Get the PID file path for a specific runner
 */
export function getRunnerPidPath(owner: string, repo: string, runnerId: string): string {
  return path.join(getRunnerRepoDir(owner, repo), `${runnerId}.pid`);
}

/**
 * Get the PID directory path for a specific repository
 */
export function getPidDir(owner: string, repo: string): string {
  return getRunnerRepoDir(owner, repo);
}
