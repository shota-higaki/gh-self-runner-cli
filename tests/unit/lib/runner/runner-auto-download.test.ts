import type { Dirent } from 'node:fs';
import * as fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../../../../src/lib/github';
import { RunnerManager } from '../../../../src/lib/runner';
import { RunnerInstance } from '../../../../src/lib/runner/runner-instance';
import type { Repository, RunnerConfig } from '../../../../src/types';

// Mock dependencies
vi.mock('../../../../src/lib/github');
vi.mock('../../../../src/lib/runner/runner-setup');
vi.mock('../../../../src/lib/runner/runner-instance');
vi.mock('../../../../src/utils/logger');
vi.mock('fs/promises');

describe('Runner Auto-Download', () => {
  let runnerManager: RunnerManager;
  let mockGitHubClient: GitHubClient;
  const repository: Repository = { owner: 'test-owner', repo: 'test-repo' };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup GitHub client mock
    mockGitHubClient = {
      validateRepository: vi.fn().mockResolvedValue(true),
      listRunners: vi.fn().mockResolvedValue([]),
      getRunnerRegistrationToken: vi.fn().mockResolvedValue('test-token'),
      getRunnerDownloads: vi.fn(),
      deleteRunner: vi.fn(),
      getRunnerRemovalToken: vi.fn(),
    } as unknown as GitHubClient;

    // Setup RunnerInstance mock
    vi.mocked(RunnerInstance).mockImplementation(
      () =>
        ({
          getId: vi.fn().mockReturnValue('test-id'),
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(undefined),
          isRunning: vi.fn().mockReturnValue(true),
          setOnCrashCallback: vi.fn(),
          stopAndRemove: vi.fn().mockResolvedValue(undefined),
          dispose: vi.fn().mockResolvedValue(undefined),
        }) as any,
    );

    // Setup fs mock
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

    runnerManager = new RunnerManager(mockGitHubClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should inform when new runners need to be set up', async () => {
    // Initialize repository
    await runnerManager.initializeRepository(repository, {
      labels: ['self-hosted', 'linux', 'x64'],
    });

    // Mock no existing runners
    // Mock filesystem operations
    vi.mocked(fs).readdir.mockResolvedValue([]);

    // Mock RunnerInstance to fail on setup for new runners
    // Mock RunnerInstance
    vi.mocked(RunnerInstance).mockImplementation(() => ({
      getId: vi.fn().mockReturnValue('test-id'),
      setup: vi.fn().mockRejectedValue(new Error('Runner not found')),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
      setOnCrashCallback: vi.fn(),
      stopAndRemove: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }));

    // Try to scale - should fail since setup fails
    await expect(runnerManager.scale(repository, 2)).rejects.toThrow('Runner not found');

    // No runners should be started since setup failed
    const status = runnerManager.getStatus();
    const repoStatus = status['test-owner/test-repo'];
    expect(repoStatus).toBeDefined();
    expect(repoStatus?.runners).toHaveLength(0);
  });

  it('should use existing runners before setting up new ones', async () => {
    // Mock existing runner with runner- prefix format
    // Mock filesystem operations
    vi.mocked(fs).readdir.mockResolvedValue([
      { name: 'runner-abc123-def456', isDirectory: () => true },
    ] as unknown as Dirent<Buffer>[]);
    // Mock access for runner files - using runner- prefix for directories
    vi.mocked(fs).access.mockImplementation((path: string) => {
      // Allow access to repo directory, .runner and run.sh files, and runner directories
      if (
        path.includes('test-owner-test-repo') ||
        path.includes('.runner') ||
        path.includes('run.sh') ||
        path.includes('runner-')
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('Not found'));
    });

    // Setup RunnerInstance mock - track how many times it's called
    // Mock RunnerInstance
    let instanceCount = 0;
    const instances: Array<any> = [];

    vi.mocked(RunnerInstance).mockImplementation((id: string) => {
      const instance = {
        getId: vi.fn().mockReturnValue(id),
        setup: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true),
        setOnCrashCallback: vi.fn(),
        stopAndRemove: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
      instances.push(instance as unknown as any);
      instanceCount++;
      return instance;
    });

    // Initialize repository
    await runnerManager.initializeRepository(repository, {
      labels: ['self-hosted', 'linux', 'x64'],
    });

    // Scale to 2 runners (should use 1 existing and create 1 new)
    await runnerManager.scale(repository, 2);

    // Logger messages have been removed from the implementation

    // Should have created 2 runner instances total
    expect(instanceCount).toBe(2);

    // Both should have been set up and started
    instances.forEach((instance) => {
      expect(instance.setup).toHaveBeenCalledTimes(1);
      expect(instance.start).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle runner setup failures gracefully', async () => {
    // Mock no existing runners
    // Mock filesystem operations
    vi.mocked(fs).readdir.mockResolvedValue([]);

    // Mock RunnerInstance to fail on setup
    // Mock RunnerInstance
    vi.mocked(RunnerInstance).mockImplementation(() => ({
      getId: vi.fn().mockReturnValue('test-id'),
      setup: vi.fn().mockRejectedValue(new Error('Runner not found')),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
      setOnCrashCallback: vi.fn(),
      stopAndRemove: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }));

    // Initialize repository
    await runnerManager.initializeRepository(repository, {
      labels: ['self-hosted', 'linux', 'x64'],
    });

    // Scale should fail
    await expect(runnerManager.scale(repository, 1)).rejects.toThrow('Runner not found');

    // Verify error was logged
    const { logger } = await import('../../../../src/utils/logger');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to setup and start new runner'),
      expect.any(Error),
    );
  });

  it('should use custom labels when setting up runners', async () => {
    const customLabels = ['self-hosted', 'gpu', 'custom'];

    // Initialize repository with custom labels
    await runnerManager.initializeRepository(repository, {
      labels: customLabels,
    });

    // Mock RunnerInstance
    // Mock RunnerInstance
    let capturedConfig: RunnerConfig | undefined;
    vi.mocked(RunnerInstance).mockImplementation((id: string, config: RunnerConfig) => {
      capturedConfig = config;
      return {
        getId: vi.fn().mockReturnValue(id),
        setup: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true),
        setOnCrashCallback: vi.fn(),
        stopAndRemove: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
    });

    // Scale to 1 runner
    await runnerManager.scale(repository, 1);

    // Verify custom labels were used in runner config
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?.labels).toEqual(customLabels);
  });
});
