import type { Dirent } from 'node:fs';
import { spawn } from 'child_process';
import * as fsPromises from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient } from '../../src/lib/github';
import { RunnerManager } from '../../src/lib/runner';
import { RunnerInstance } from '../../src/lib/runner/runner-instance';
import type { ManagerConfig, Repository } from '../../src/types';
import { logger } from '../../src/utils/logger';
import * as platform from '../../src/utils/platform';

// Mock external dependencies
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('../../src/utils/logger');
vi.mock('../../src/utils/platform');
vi.mock('../../src/lib/runner/runner-setup');
vi.mock('../../src/utils/paths', () => ({
  PATHS: {
    BASE_DIR: '/test/.github/self-hosted-runners',
  },
  getRunnerRepoDir: vi.fn((owner: string, repo: string) => `/runners/${owner}-${repo}`),
  getRunnerDir: vi.fn(
    (owner: string, repo: string, id: string) => `/runners/${owner}-${repo}/${id}`,
  ),
  getRunnerLogPath: vi.fn(
    (owner: string, repo: string, id: string) => `/logs/${owner}-${repo}/${id}.log`,
  ),
  getRunnerPidPath: vi.fn(
    (owner: string, repo: string, id: string) => `/runners/${owner}-${repo}/${id}.pid`,
  ),
  getPidDir: vi.fn((owner: string, repo: string) => `/runners/${owner}-${repo}`),
}));
vi.mock('../../src/utils/fs-helpers', () => ({
  writePidFile: vi.fn(() => Promise.resolve()),
  removePidFile: vi.fn(() => Promise.resolve()),
  readPidFile: vi.fn(() => Promise.resolve(null)),
  listPidFiles: vi.fn(() => Promise.resolve([])),
  ensureDirectory: vi.fn(() => Promise.resolve()),
}));

// Mock fetch for runner downloads
// biome-ignore lint/suspicious/noExplicitAny: Test mock
global.fetch = vi.fn() as any;

describe('Parallel Runners Integration', () => {
  let githubClient: GitHubClient;
  let runnerManager: RunnerManager;

  const testRepo: Repository = { owner: 'test-org', repo: 'test-repo' };
  const testConfig: ManagerConfig = {
    github: { token: 'test-token' },
    repositories: ['test-org/test-repo'],
    runners: {
      parallel: 3,
      labels: ['self-hosted', 'linux', 'x64'],
    },
    logging: {
      level: 'info',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock platform utilities
    vi.mocked(platform.getPlatformInfo).mockReturnValue({
      isWindows: false,
      isLinux: false,
      isMacOS: true,
      runnerScript: 'run.sh',
      shell: '/bin/sh',
      shellArgs: [],
      pathSeparator: '/',
    });
    vi.mocked(platform.killProcess).mockResolvedValue(undefined);

    // Mock fetch for runner downloads
    vi.mocked(global.fetch).mockReset();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: {
        // Mock web stream
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true }),
        }),
      },
    } as unknown as Response);

    // Spy on RunnerInstance methods
    vi.spyOn(RunnerInstance.prototype, 'stopAndRemove').mockImplementation(async function (
      this: RunnerInstance,
    ) {
      // Just mock the implementation
    });

    // Mock GitHub API responses
    vi.spyOn(GitHubClient.prototype, 'validateRepository').mockResolvedValue(true);
    vi.spyOn(GitHubClient.prototype, 'getRunnerRegistrationToken').mockResolvedValue('reg-token');
    vi.spyOn(GitHubClient.prototype, 'listRunners').mockResolvedValue([]);
    vi.spyOn(GitHubClient.prototype, 'getRunnerDownloads').mockResolvedValue([
      {
        os: 'linux',
        architecture: 'x64',
        download_url: 'https://example.com/runner-linux-x64.tar.gz',
        filename: 'runner-linux-x64.tar.gz',
      },
      {
        os: 'osx',
        architecture: 'x64',
        download_url: 'https://example.com/runner-osx-x64.tar.gz',
        filename: 'runner-osx-x64.tar.gz',
      },
      {
        os: 'osx',
        architecture: 'arm64',
        download_url: 'https://example.com/runner-osx-arm64.tar.gz',
        filename: 'runner-osx-arm64.tar.gz',
      },
      {
        os: 'win',
        architecture: 'x64',
        download_url: 'https://example.com/runner-win-x64.zip',
        filename: 'runner-win-x64.zip',
      },
    ]);

    // Mock file system
    // Mock access to simulate runner is already set up
    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      // Simulate that runner directories and binaries exist
      if (
        path.includes('runners') &&
        (path.includes('.runner') || path.includes('run.sh') || path.includes('-'))
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('Not found'));
    });

    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);
    // biome-ignore lint/suspicious/noExplicitAny: Test mock
    vi.mocked(fsPromises.readdir).mockResolvedValue(['run.sh', 'config.sh'] as any);

    // Mock process spawning
    vi.mocked(spawn).mockReset();
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      killed: false,
      unref: vi.fn(),
    };
    // biome-ignore lint/suspicious/noExplicitAny: Test mock
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    // Initialize components
    githubClient = new GitHubClient({ token: 'test-token' });
    runnerManager = new RunnerManager(githubClient);
  });

  describe('Multiple Runner Lifecycle', () => {
    it('should initialize, start, and stop multiple runners', async () => {
      // Mock readdir to return runner directories with runner- prefix
      vi.mocked(fsPromises.readdir).mockReset();
      vi.mocked(fsPromises.readdir).mockResolvedValueOnce([
        { name: 'runner-test1-abc123', isDirectory: () => true },
        { name: 'runner-test2-def456', isDirectory: () => true },
        { name: 'runner-test3-ghi789', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      // Initialize repository
      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Scale up to 3 runners
      await runnerManager.scale(testRepo, 3);

      // Verify 3 runners were created
      expect(spawn).toHaveBeenCalledTimes(3);

      // Get status
      const status = runnerManager.getStatus();
      expect(status['test-org/test-repo']?.runners).toHaveLength(3);

      // Scale down to 1 runner
      await runnerManager.scale(testRepo, 1);

      // Get status after scale down
      const statusAfterScaleDown = runnerManager.getStatus();
      expect(statusAfterScaleDown['test-org/test-repo']?.runners).toHaveLength(1);

      // Stop all runners
      await runnerManager.stopAll();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple repositories with parallel runners', async () => {
      const repo1: Repository = { owner: 'org1', repo: 'repo1' };
      const repo2: Repository = { owner: 'org2', repo: 'repo2' };

      // Mock readdir for both repositories
      vi.mocked(fsPromises.readdir).mockReset();
      vi.mocked(fsPromises.readdir)
        .mockResolvedValueOnce([
          { name: 'runner-org1-aaa123', isDirectory: () => true },
          { name: 'runner-org1-bbb456', isDirectory: () => true },
        ] as unknown as Dirent<Buffer>[])
        .mockResolvedValueOnce([
          { name: 'runner-org2-ccc789', isDirectory: () => true },
          { name: 'runner-org2-ddd012', isDirectory: () => true },
          { name: 'runner-org2-eee345', isDirectory: () => true },
        ] as unknown as Dirent<Buffer>[]);

      // Initialize multiple repositories
      await Promise.all([
        runnerManager.initializeRepository(repo1, { labels: ['self-hosted'] }),
        runnerManager.initializeRepository(repo2, { labels: ['self-hosted'] }),
      ]);

      // Scale both repositories concurrently
      await Promise.all([runnerManager.scale(repo1, 2), runnerManager.scale(repo2, 3)]);

      expect(spawn).toHaveBeenCalledTimes(5); // 2 + 3 runners

      // Get combined status
      const status = runnerManager.getStatus();
      expect(Object.keys(status)).toHaveLength(2);
      expect(status['org1/repo1']?.runners).toHaveLength(2);
      expect(status['org2/repo2']?.runners).toHaveLength(3);
    });

    it('should handle rapid scaling changes', async () => {
      // Mock readdir to return 10 runners
      vi.mocked(fsPromises.readdir).mockReset();
      const runnerDirents: Array<{ name: string; isDirectory: () => boolean }> = Array.from(
        { length: 10 },
        (_, i) => ({
          name: `runner-scale${i}-test`,
          isDirectory: () => true,
        }),
      );
      vi.mocked(fsPromises.readdir).mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Simulate rapid scaling changes
      const scaleOperations = [1, 5, 2, 8, 3].map((count) => runnerManager.scale(testRepo, count));

      await Promise.all(scaleOperations);

      // Final state should reflect the last operation
      const status = runnerManager.getStatus();
      expect(status['test-org/test-repo']?.runners).toBeDefined();
    }, 10000);
  });

  describe('Error Recovery', () => {
    it('should recover from partial runner failures', async () => {
      // Mock readdir to return 4 runners
      vi.mocked(fsPromises.readdir).mockReset();
      vi.mocked(fsPromises.readdir).mockResolvedValueOnce([
        { name: 'runner-fail1-test', isDirectory: () => true },
        { name: 'runner-fail2-test', isDirectory: () => true },
        { name: 'runner-fail3-test', isDirectory: () => true },
        { name: 'runner-fail4-test', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Mock some runners failing to start
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          // Every other runner fails immediately
          const mockProcess = {
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, handler) => {
              if (event === 'error') {
                setTimeout(() => handler(new Error('Failed to start')), 0);
              }
            }),
            kill: vi.fn(),
            killed: false,
            unref: vi.fn(),
          };
          // biome-ignore lint/suspicious/noExplicitAny: Test mock
          return mockProcess as any;
        }
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
          killed: false,
          unref: vi.fn(),
          // biome-ignore lint/suspicious/noExplicitAny: Test mock
        } as any;
      });

      // Try to scale to 4 runners
      await runnerManager.scale(testRepo, 4);

      // Should have attempted all 4
      expect(spawn).toHaveBeenCalledTimes(4);
    });

    it('should handle runner setup failures during scale up', async () => {
      // Mock readdir to return empty (no existing runners)
      vi.mocked(fsPromises.readdir).mockReset();
      vi.mocked(fsPromises.readdir).mockResolvedValueOnce([]);

      // Mock access to always fail for this test
      const originalAccess = vi.mocked(fsPromises.access).getMockImplementation();
      vi.mocked(fsPromises.access).mockRejectedValue(new Error('Not found'));

      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Scaling should fail because runner binary doesn't exist
      await expect(runnerManager.scale(testRepo, 1)).rejects.toThrow('Runner not found at');

      // Verify info was logged about needing setup
      expect(logger.info).toHaveBeenCalledWith(
        'Need to set up 1 new runner(s). Starting automatic download and installation...',
      );

      // Restore original access mock
      vi.mocked(fsPromises.access).mockImplementation(originalAccess!);
    });
  });

  describe('Resource Limits', () => {
    it('should respect system resource limits', async () => {
      // Mock readdir to return 100 runners with runner- prefix
      vi.mocked(fsPromises.readdir).mockReset();
      const runnerDirents: Array<{ name: string; isDirectory: () => boolean }> = Array.from(
        { length: 100 },
        (_, i) => ({
          name: `runner-resource${i}-test`,
          isDirectory: () => true,
        }),
      );
      vi.mocked(fsPromises.readdir).mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Try to scale to a very large number
      const startTime = Date.now();
      await runnerManager.scale(testRepo, 100);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (not hanging)
      expect(duration).toBeLessThan(5000);

      expect(spawn).toHaveBeenCalledTimes(100);
    });

    it('should clean up resources properly when scaling down rapidly', async () => {
      // Mock readdir to return 20 runners with runner- prefix
      vi.mocked(fsPromises.readdir).mockReset();
      const runnerDirents: Array<{ name: string; isDirectory: () => boolean }> = Array.from(
        { length: 20 },
        (_, i) => ({
          name: `runner-cleanup${i}-test`,
          isDirectory: () => true,
        }),
      );
      vi.mocked(fsPromises.readdir).mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      await runnerManager.initializeRepository(testRepo, {
        labels: testConfig.runners.labels,
      });

      // Scale up
      await runnerManager.scale(testRepo, 20);

      // Rapid scale down
      await runnerManager.scale(testRepo, 5);

      // Verify runners were stopped (not deleted)
      // Should have spawned 20 runners initially
      expect(spawn).toHaveBeenCalledTimes(20);
    });
  });

  describe('Configuration Changes', () => {
    it('should handle configuration updates with running runners', async () => {
      // Mock readdir to return 3 runners
      vi.mocked(fsPromises.readdir).mockReset();
      vi.mocked(fsPromises.readdir).mockResolvedValue([
        { name: 'runner-config1-test', isDirectory: () => true },
        { name: 'runner-config2-test', isDirectory: () => true },
        { name: 'runner-config3-test', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      // Start with initial configuration
      await runnerManager.initializeRepository(testRepo, {
        labels: ['self-hosted', 'linux'],
      });
      await runnerManager.scale(testRepo, 2);

      // Update configuration with new labels
      const updatedConfig: ManagerConfig = {
        ...testConfig,
        runners: {
          ...testConfig.runners,
          labels: ['self-hosted', 'linux', 'x64', 'docker'],
        },
      };

      // Re-initialize with new config
      await runnerManager.initializeRepository(testRepo, {
        labels: updatedConfig.runners.labels,
      });

      // Scale up with new configuration
      await runnerManager.scale(testRepo, 3);

      // New runners should use updated configuration
      expect(spawn).toHaveBeenCalledTimes(3); // 2 initial + 1 new
    });
  });
});
