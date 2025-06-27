import * as path from 'path';
import { listPidFiles, readPidFile, removePidFile } from './fs-helpers.js';
import { getPidDir, parseRepository } from './index.js';
import { logger } from './logger.js';

interface ProcessInfo {
  pidFile: string;
  pid: number;
  runnerId: string;
}

/**
 * Stop all running processes by reading PID files
 * @param repositories Array of repository strings to stop processes for
 * @returns Number of processes stopped and failed
 */
export async function stopAllProcesses(
  repositories: string[],
): Promise<{ stoppedCount: number; failedCount: number }> {
  const runningProcesses: Map<string, ProcessInfo[]> = new Map();
  let totalProcesses = 0;

  // Find all running processes by reading PID files
  for (const repoString of repositories) {
    const repository = parseRepository(repoString);
    const repoKey = `${repository.owner}/${repository.repo}`;
    const pidDir = getPidDir(repository.owner, repository.repo);

    try {
      // List all PID files for this repository
      const pidFiles = await listPidFiles(pidDir);
      const processes: ProcessInfo[] = [];

      for (const pidFile of pidFiles) {
        const pidPath = path.join(pidDir, pidFile);
        const pid = await readPidFile(pidPath);

        if (pid !== null) {
          // Extract runner ID from filename (format: runner-xxxxx.pid)
          const runnerId = pidFile.replace('.pid', '');
          processes.push({ pidFile: pidPath, pid, runnerId });
        }
      }

      if (processes.length > 0) {
        runningProcesses.set(repoKey, processes);
        totalProcesses += processes.length;
      }
    } catch (error) {
      logger.error(`Failed to list processes for ${repoKey}:`, error as Error);
    }
  }

  if (totalProcesses === 0) {
    return { stoppedCount: 0, failedCount: 0 };
  }

  let stoppedCount = 0;
  let failedCount = 0;

  // Stop all runner processes by sending signals
  for (const [_repoKey, processes] of runningProcesses.entries()) {
    for (const processInfo of processes) {
      try {
        // Try graceful shutdown first
        process.kill(processInfo.pid, 'SIGINT');

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if process still exists
        try {
          process.kill(processInfo.pid, 0); // Signal 0 just checks if process exists
          // Process still running, try SIGTERM
          process.kill(processInfo.pid, 'SIGTERM');
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Check again
          try {
            process.kill(processInfo.pid, 0);
            // Still running, force kill
            process.kill(processInfo.pid, 'SIGKILL');
          } catch {
            // Process no longer exists, good
          }
        } catch {
          // Process no longer exists after SIGINT, good
        }

        // Remove PID file
        await removePidFile(processInfo.pidFile);
        stoppedCount++;
      } catch (error) {
        logger.error(`Failed to stop runner ${processInfo.runnerId}:`, error as Error);
        failedCount++;
      }
    }
  }

  return { stoppedCount, failedCount };
}

/**
 * Check if a process is running by PID
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale PID files (where process no longer exists)
 * @param repositories Array of repository strings to clean PID files for
 * @returns Number of stale PID files cleaned
 */
export async function cleanStalePidFiles(repositories: string[]): Promise<number> {
  let cleanedCount = 0;

  for (const repoString of repositories) {
    const repository = parseRepository(repoString);
    const pidDir = getPidDir(repository.owner, repository.repo);

    try {
      const pidFiles = await listPidFiles(pidDir);

      for (const pidFile of pidFiles) {
        const pidPath = path.join(pidDir, pidFile);
        const pid = await readPidFile(pidPath);

        if (pid !== null && !isProcessRunning(pid)) {
          // Process no longer exists, remove stale PID file
          await removePidFile(pidPath);
          cleanedCount++;
          logger.debug(`Cleaned stale PID file: ${pidPath}`);
        }
      }
    } catch (error) {
      logger.debug(`Failed to clean PID files for ${repoString}:`, {
        error: (error as Error).message,
      });
    }
  }

  return cleanedCount;
}

/**
 * Check for running processes across repositories
 * @param repositories Array of repository strings to check
 * @returns Object with total count and count by repository
 */
export async function checkRunningProcesses(
  repositories: string[],
): Promise<{ totalCount: number; byRepository: Map<string, number> }> {
  const byRepository = new Map<string, number>();
  let totalCount = 0;

  for (const repoString of repositories) {
    const repository = parseRepository(repoString);
    const repoKey = `${repository.owner}/${repository.repo}`;
    const pidDir = getPidDir(repository.owner, repository.repo);

    try {
      const pidFiles = await listPidFiles(pidDir);
      let runningCount = 0;

      for (const pidFile of pidFiles) {
        const pidPath = path.join(pidDir, pidFile);
        const pid = await readPidFile(pidPath);

        if (pid !== null && isProcessRunning(pid)) {
          runningCount++;
          totalCount++;
        }
      }

      if (runningCount > 0) {
        byRepository.set(repoKey, runningCount);
      }
    } catch (error) {
      logger.debug(`Failed to check processes for ${repoString}:`, {
        error: (error as Error).message,
      });
    }
  }

  return { totalCount, byRepository };
}
