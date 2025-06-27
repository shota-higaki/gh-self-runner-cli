import * as fs from 'fs/promises';
import * as path from 'path';
import type { Repository, RunnerConfig, RunnerGroup } from '../../types';
import {
  getPlatformInfo,
  getRunnerRepoDir,
  logger,
  stringifyRepository,
} from '../../utils/index.js';
import type { GitHubClient } from '../github';
import { RunnerInstance } from './runner-instance.js';

function generateRunnerId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `runner-${timestamp}-${randomSuffix}`;
}

class SimpleMutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export class RunnerManager {
  private runnerGroups: Map<string, RunnerGroup> = new Map();
  private runnerInstances: Map<string, RunnerInstance[]> = new Map();
  private scalingMutexes: Map<string, SimpleMutex> = new Map();
  private githubClient: GitHubClient;

  constructor(githubClient: GitHubClient) {
    this.githubClient = githubClient;
  }

  async initializeRepository(
    repository: Repository,
    config: Partial<RunnerConfig> & { labels?: string[] },
  ): Promise<void> {
    const repoKey = stringifyRepository(repository);

    logger.debug(`Initializing repository: ${repoKey}`);

    // Validate repository exists
    try {
      const isValid = await this.githubClient.validateRepository(repository);
      if (!isValid) {
        throw new Error(`Repository ${repoKey} does not exist or is not accessible`);
      }
    } catch (error) {
      logger.error(`Failed to validate repository ${repoKey}`, error as Error);
      throw error;
    }

    // Create runner group if not exists
    if (!this.runnerGroups.has(repoKey)) {
      this.runnerGroups.set(repoKey, {
        id: generateRunnerId(),
        repository,
        runners: [],
        targetCount: 0,
        labels: config.labels ? config.labels : [],
      });
      this.runnerInstances.set(repoKey, []);
    } else {
      // Update labels if provided
      const group = this.runnerGroups.get(repoKey)!;
      if (config.labels) {
        group.labels = config.labels;
      }
    }
  }

  async scale(repository: Repository, targetCount: number): Promise<void> {
    const repoKey = stringifyRepository(repository);

    // Ensure mutex exists for this repository
    if (!this.scalingMutexes.has(repoKey)) {
      this.scalingMutexes.set(repoKey, new SimpleMutex());
    }
    const mutex = this.scalingMutexes.get(repoKey)!;

    // Execute scaling operation exclusively
    await mutex.runExclusive(async () => {
      const group = this.runnerGroups.get(repoKey);
      const instances = this.runnerInstances.get(repoKey);

      if (!group || !instances) {
        throw new Error(`Repository ${repoKey} is not initialized`);
      }

      const currentCount = instances.length;
      logger.debug(`Scaling ${repoKey} from ${currentCount} to ${targetCount} runners`);

      if (targetCount > currentCount) {
        // Scale up
        await this.addRunners(repository, targetCount - currentCount);
      } else if (targetCount < currentCount) {
        // Scale down
        await this.removeRunners(repository, currentCount - targetCount);
      }

      // Update target count
      group.targetCount = targetCount;
    });
  }

  /**
   * Discover existing runners that have been previously configured
   * These runners have runner directories but might not be currently running
   */
  private async discoverExistingRunners(repository: Repository): Promise<string[]> {
    const repoDir = getRunnerRepoDir(repository.owner, repository.repo);
    const runnerIds: string[] = [];

    try {
      const entries = await fs.readdir(repoDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if it's a valid runner directory
          if (entry.name.startsWith('runner-')) {
            // Check if runner is properly configured
            const runnerPath = path.join(repoDir, entry.name);
            try {
              await fs.access(path.join(runnerPath, '.runner'));
              const { runnerScript } = getPlatformInfo();
              await fs.access(path.join(runnerPath, runnerScript));
              runnerIds.push(entry.name);
            } catch {
              // Runner directory exists but not properly configured
              logger.warn(`Runner directory ${entry.name} exists but is not properly configured`);
            }
          }
        }
      }
    } catch {
      // Repository runner directory doesn't exist
    }

    return runnerIds;
  }

  private async addRunners(repository: Repository, count: number): Promise<void> {
    const repoKey = stringifyRepository(repository);
    const group = this.runnerGroups.get(repoKey);
    const instances = this.runnerInstances.get(repoKey);

    if (!group || !instances) {
      throw new Error(`Repository ${repoKey} is not initialized`);
    }

    // First, discover existing runners
    const existingRunnerIds = await this.discoverExistingRunners(repository);
    const currentRunnerIds = instances.map((r) => r.getId());
    const availableRunnerIds = existingRunnerIds.filter((id) => !currentRunnerIds.includes(id));

    logger.debug(
      `Found ${existingRunnerIds.length} configured runners, ${availableRunnerIds.length} available to start`,
    );

    // Determine how many runners we can start and how many need to be set up
    const runnersToStart = Math.min(count, availableRunnerIds.length);
    const runnersToSetup = count - runnersToStart;

    if (runnersToSetup > 0) {
      logger.info(
        `Need to set up ${runnersToSetup} new runner(s). Starting automatic download and installation...`,
      );
    }

    const runnerPromises: Promise<void>[] = [];

    // Start existing runners
    for (let i = 0; i < runnersToStart; i++) {
      const runnerId = availableRunnerIds[i];
      if (runnerId) {
        runnerPromises.push(this.startExistingRunner(repository, runnerId, repoKey));
      }
    }

    // Set up new runners if needed
    for (let i = 0; i < runnersToSetup; i++) {
      runnerPromises.push(this.setupAndStartNewRunner(repository, repoKey, group.labels || []));
    }

    // Wait for all runners to be started
    await Promise.all(runnerPromises);
  }

  private async startExistingRunner(
    repository: Repository,
    runnerId: string,
    repoKey: string,
  ): Promise<void> {
    const group = this.runnerGroups.get(repoKey);
    const instances = this.runnerInstances.get(repoKey);

    if (!group || !instances) {
      return;
    }

    // Get registration token (might be needed for re-registration)
    const registrationToken = await this.githubClient.getRunnerRegistrationToken(repository);

    const runnerConfig: RunnerConfig = {
      repository,
      name: `${repository.repo}-${runnerId}`,
      labels: group.labels || ['self-hosted', 'linux', 'x64'], // Use group labels or defaults
    };

    const runner = new RunnerInstance(runnerId, runnerConfig, registrationToken);

    try {
      await runner.setup();
      runner.start();
      instances.push(runner);
      logger.debug(`Started existing runner ${runnerId} for ${repoKey}`);
    } catch (error) {
      logger.error(`Failed to start existing runner ${runnerId} for ${repoKey}`, error as Error);
      throw error;
    }
  }

  private async setupAndStartNewRunner(
    repository: Repository,
    repoKey: string,
    labels: string[],
  ): Promise<void> {
    const group = this.runnerGroups.get(repoKey);
    const instances = this.runnerInstances.get(repoKey);

    if (!group || !instances) {
      return;
    }

    const runnerId = generateRunnerId();

    // Get registration token
    const registrationToken = await this.githubClient.getRunnerRegistrationToken(repository);

    const { isWindows, isLinux } = getPlatformInfo();
    const os = isWindows ? 'windows' : isLinux ? 'linux' : 'macos';
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const defaultLabels = ['self-hosted', os, arch];

    const runnerConfig: RunnerConfig = {
      repository,
      name: `${repository.repo}-${runnerId}`,
      labels: labels.length > 0 ? labels : defaultLabels,
    };

    // Note: Runner setup is handled in RunnerInstance.setup() method
    // which calls the setupRunner method if needed

    const runner = new RunnerInstance(runnerId, runnerConfig, registrationToken);

    try {
      await runner.setup();
      runner.start();
      instances.push(runner);
      logger.debug(`Set up and started new runner ${runnerId} for ${repoKey}`);
    } catch (error) {
      logger.error(`Failed to setup and start new runner for ${repoKey}`, error as Error);
      throw error;
    }
  }

  private async removeRunners(repository: Repository, count: number): Promise<void> {
    const repoKey = stringifyRepository(repository);
    const instances = this.runnerInstances.get(repoKey);

    if (!instances) {
      throw new Error(`Repository ${repoKey} is not initialized`);
    }

    const runnersToRemove = instances.slice(-count);
    const remainingRunners = instances.slice(0, -count);

    await Promise.all(runnersToRemove.map((runner) => runner.stop()));

    this.runnerInstances.set(repoKey, remainingRunners);
  }

  getStatus(): {
    [key: string]: {
      runners: Array<{
        id: string;
        status: 'active' | 'idle' | 'offline';
      }>;
    };
  } {
    const result: {
      [key: string]: {
        runners: Array<{
          id: string;
          status: 'active' | 'idle' | 'offline';
        }>;
      };
    } = {};

    for (const [repoKey] of this.runnerGroups) {
      const instances = this.runnerInstances.get(repoKey) || [];
      result[repoKey] = {
        runners: instances.map((runner) => ({
          id: runner.getId(),
          // If the runner process is running, it's at least idle (could be active)
          // If the runner process is not running, it's offline
          // Note: To get accurate active vs idle status, we would need to query GitHub API
          status: runner.isRunning() ? 'idle' : 'offline',
        })),
      };
    }

    return result;
  }

  async startAll(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const [, instances] of this.runnerInstances) {
      for (const instance of instances) {
        if (!instance.isRunning()) {
          startPromises.push(
            Promise.resolve().then(() => {
              try {
                instance.start();
              } catch (error) {
                logger.error(`Failed to start runner ${instance.getId()}`, error as Error);
              }
            }),
          );
        }
      }
    }

    await Promise.all(startPromises);
  }

  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [, instances] of this.runnerInstances) {
      for (const instance of instances) {
        stopPromises.push(instance.stop());
      }
    }

    await Promise.all(stopPromises);

    this.runnerGroups.clear();
    this.runnerInstances.clear();
    this.scalingMutexes.clear();
  }

  async stopRepository(repository: Repository): Promise<void> {
    const repoKey = stringifyRepository(repository);
    const instances = this.runnerInstances.get(repoKey);

    if (!instances) {
      return;
    }

    logger.info(`Stopping ${instances.length} runners for ${repoKey}`);

    const stopPromises = instances.map((instance) => instance.stop());
    await Promise.all(stopPromises);

    this.runnerGroups.delete(repoKey);
    this.runnerInstances.delete(repoKey);
    this.scalingMutexes.delete(repoKey);
  }

  /**
   * Remove all runners for a repository, including their configuration
   */
  async removeRepository(repository: Repository): Promise<void> {
    const repoKey = stringifyRepository(repository);
    const instances = this.runnerInstances.get(repoKey);

    if (!instances || instances.length === 0) {
      return;
    }

    const removePromises = instances.map((instance) => instance.stopAndRemove());
    await Promise.all(removePromises);

    this.runnerGroups.delete(repoKey);
    this.runnerInstances.delete(repoKey);
    this.scalingMutexes.delete(repoKey);
  }

  /**
   * Clean up all resources
   */
  async dispose(): Promise<void> {
    await this.stopAll();
  }

  /**
   * Get the number of runners for a repository
   */
  getRunnerCount(repository: Repository): number {
    const repoKey = stringifyRepository(repository);
    const instances = this.runnerInstances.get(repoKey);
    return instances ? instances.length : 0;
  }

  /**
   * Check if a repository has been initialized
   */
  isRepositoryInitialized(repository: Repository): boolean {
    const repoKey = stringifyRepository(repository);
    return this.runnerGroups.has(repoKey);
  }
}
