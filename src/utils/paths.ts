import path from 'path';

/**
 * Path constants for the GitHub self-hosted runners
 */
export const PATHS = {
  // Base directory for all runner-related files
  BASE_DIR: '.github/self-hosted-runners',

  // Configuration file
  CONFIG_FILE: '.github/self-hosted-runners/config.yml',

  // Old paths (for migration)
  OLD_RUNNERS_DIR: '.runners',
  OLD_CONFIG_FILE: '.github-runners.yml',
} as const;

/**
 * Get the runner directory path for a specific repository
 */
export function getRunnerRepoDir(owner: string, repo: string): string {
  return path.resolve(process.cwd(), PATHS.BASE_DIR, 'runners', `${owner}-${repo}`);
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
