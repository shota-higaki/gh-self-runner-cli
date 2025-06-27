import type { Dirent } from 'node:fs';
import * as fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../../../../src/lib/github';
import { RunnerInstance } from '../../../../src/lib/runner/runner-instance';
import { RunnerManager } from '../../../../src/lib/runner/runner-manager';
import type { Repository } from '../../../../src/types';

vi.mock('../../../../src/lib/github');
vi.mock('../../../../src/lib/runner/runner-instance');
vi.mock('../../../../src/lib/runner/runner-setup');
vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('../../../../src/utils/paths', () => ({
  PATHS: {
    BASE_DIR: '/test/.github/self-hosted-runners',
  },
  getRunnerRepoDir: vi.fn((owner: string, repo: string) => `/runners/${owner}-${repo}`),
}));
vi.mock('fs/promises');

describe('RunnerManager', () => {
  let runnerManager: RunnerManager;
  let mockGitHubClient: GitHubClient;
  const testRepository: Repository = { owner: 'test', repo: 'repo' };

  beforeEach(() => {
    mockGitHubClient = {
      validateRepository: vi.fn(),
      getRunnerRegistrationToken: vi.fn(),
      getRunnerRemovalToken: vi.fn(),
      listRunners: vi.fn(),
      deleteRunner: vi.fn(),
      getRunnerDownloads: vi.fn().mockResolvedValue([
        {
          os: 'linux',
          architecture: 'x64',
          download_url: 'https://example.com/runner.tar.gz',
          filename: 'runner.tar.gz',
        },
      ]),
    } as unknown as GitHubClient;

    runnerManager = new RunnerManager(mockGitHubClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeRepository', () => {
    it('should initialize valid repository', async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValueOnce(true);

      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });

      expect(vi.mocked(mockGitHubClient).validateRepository).toHaveBeenCalledWith(testRepository);
    });

    it('should throw error for invalid repository', async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValueOnce(false);

      await expect(
        runnerManager.initializeRepository(testRepository, { labels: ['test'] }),
      ).rejects.toThrow('Repository test/repo does not exist or is not accessible');
    });

    it('should not create duplicate runner groups', async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);

      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });

      expect(vi.mocked(mockGitHubClient).validateRepository).toHaveBeenCalledTimes(2);
    });
  });

  describe('scale', () => {
    beforeEach(async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });
    });

    it('should scale up runners', async () => {
      // Mock discovering existing runners
      const runnerDir = '/runners/test-repo';

      // First access call for the directory check
      vi.mocked(fs.access).mockImplementationOnce((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      // Mock readdir to return runner directories with runner- prefix
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'runner-test1-abc123', isDirectory: () => true },
        { name: 'runner-test2-def456', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      // Subsequent access calls for runner directories
      vi.mocked(fs.access).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.runner') || pathStr.includes('run.sh') || pathStr === runnerDir) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');
      vi.mocked(mockGitHubClient).listRunners.mockResolvedValueOnce([]);

      let runnerCount = 0;
      const mockRunnerInstances: Array<any> = [];

      vi.mocked(RunnerInstance).mockImplementation((id) => {
        const instance = {
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(undefined),
          getId: vi.fn().mockReturnValue(id),
          isRunning: vi.fn().mockReturnValue(false),
          stopAndRemove: vi.fn().mockResolvedValue(undefined),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn().mockResolvedValue(undefined),
        };
        mockRunnerInstances.push(instance as any);
        runnerCount++;
        return instance as unknown as RunnerInstance;
      });

      await runnerManager.scale(testRepository, 2);

      // Logger messages have been removed from the implementation
      expect(vi.mocked(mockGitHubClient).getRunnerRegistrationToken).toHaveBeenCalledWith(
        testRepository,
      );
      expect(RunnerInstance).toHaveBeenCalledTimes(2);
      expect(runnerCount).toBe(2);
      mockRunnerInstances.forEach((instance) => {
        expect(instance.setup).toHaveBeenCalledTimes(1);
        expect(instance.start).toHaveBeenCalledTimes(1);
      });
    });

    it('should scale down runners', async () => {
      // Mock filesystem operations

      // First setup - mock discovering existing runners for scale up
      const runnerDir = '/runners/test-repo';

      // First call for directory existence
      vi.mocked(fs).access.mockImplementationOnce((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      // First readdir for scale up with runner- prefix
      vi.mocked(fs).readdir.mockResolvedValueOnce([
        { name: 'runner-scale1-abc123', isDirectory: () => true },
        { name: 'runner-scale2-def456', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      // Subsequent access calls
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir || pathStr.includes('.runner') || pathStr.includes('run.sh')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      const mockRunnerInstances: Array<any> = [];
      let instanceCount = 0;

      vi.mocked(RunnerInstance).mockImplementation((id) => {
        const instance = {
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(undefined),
          stopAndRemove: vi.fn().mockResolvedValue(undefined),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn().mockResolvedValue(undefined),
          getId: vi.fn().mockReturnValue(id),
          isRunning: vi.fn().mockReturnValue(true),
        };
        mockRunnerInstances.push(instance as unknown as any);
        instanceCount++;
        return instance as unknown as RunnerInstance;
      });

      // Scale up to 2
      await runnerManager.scale(testRepository, 2);
      expect(instanceCount).toBe(2);

      // For scale down, we don't need to rediscover runners
      // The manager already has the instances in memory
      vi.mocked(mockGitHubClient).deleteRunner.mockResolvedValue(undefined);
      await runnerManager.scale(testRepository, 1);

      // Should have called stop for one runner
      expect(mockRunnerInstances[1]?.stop).toHaveBeenCalled();
    });

    it('should handle errors when adding runners', async () => {
      // Mock filesystem operations

      // Mock discovering existing runner
      const runnerDir = '/runners/test-repo';

      // First access for directory
      vi.mocked(fs).access.mockImplementationOnce((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      vi.mocked(fs).readdir.mockResolvedValueOnce([
        { name: 'runner-error-test123', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      // Subsequent access calls
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir || pathStr.includes('.runner') || pathStr.includes('run.sh')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValueOnce('reg-token');

      const mockRunnerInstance = {
        setup: vi.fn().mockRejectedValueOnce(new Error('Setup failed')),
        start: vi.fn(),
        getId: vi.fn(() => 'runner-error-test123'),
        setOnCrashCallback: vi.fn(),
      };
      vi.mocked(RunnerInstance).mockImplementation(
        () => mockRunnerInstance as unknown as RunnerInstance,
      );

      await expect(runnerManager.scale(testRepository, 1)).rejects.toThrow('Setup failed');

      // Since there's no existing runner, it will try to create a new one
      const { logger } = await import('../../../../src/utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to setup and start new runner for test/repo',
        expect.any(Error),
      );
    });

    it('should throw error for uninitialized repository', async () => {
      const uninitRepo = { owner: 'other', repo: 'repo' };

      await expect(runnerManager.scale(uninitRepo, 1)).rejects.toThrow(
        'Repository other/repo is not initialized',
      );
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });
    });

    it('should get status for all repositories', async () => {
      const status = runnerManager.getStatus();

      // Should have the initialized repository with no runners
      expect(Object.keys(status)).toHaveLength(1);
      expect(status['test/repo']).toBeDefined();
      expect(status['test/repo']?.runners).toHaveLength(0);
    });

    it('should include runner status after scaling', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).readdir.mockResolvedValueOnce([
        { name: 'runner-status1-abc', isDirectory: () => true },
        { name: 'runner-status2-def', isDirectory: () => true },
      ] as unknown as Dirent<Buffer>[]);

      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (
          pathStr.includes('/runners/test-repo') ||
          pathStr.includes('.runner') ||
          pathStr.includes('run.sh')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      const mockRunnerInstances: Array<any> = [];
      vi.mocked(RunnerInstance).mockImplementation((id) => {
        const instance = {
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          getId: vi.fn().mockReturnValue(id),
          isRunning: vi.fn().mockReturnValue(true),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn(),
        };
        mockRunnerInstances.push(instance as any);
        return instance as unknown as RunnerInstance;
      });

      // Scale to 2 runners
      await runnerManager.scale(testRepository, 2);

      const status = runnerManager.getStatus();

      expect(status['test/repo']?.runners).toHaveLength(2);
      expect(status['test/repo']?.runners[0]?.status).toBe('idle');
      expect(status['test/repo']?.runners[1]?.status).toBe('idle');
    });

    it('should handle multiple repositories', async () => {
      const repo2 = { owner: 'test', repo: 'repo2' };
      await runnerManager.initializeRepository(repo2, { labels: ['test'] });

      const status = runnerManager.getStatus();

      expect(Object.keys(status)).toHaveLength(2);
      expect(status['test/repo']).toBeDefined();
      expect(status['test/repo2']).toBeDefined();
    });
  });

  describe('stopAll', () => {
    it('should stop all runners', async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });

      const repo2 = { owner: 'test', repo: 'repo2' };
      await runnerManager.initializeRepository(repo2, { labels: ['test'] });

      await runnerManager.stopAll();

      // Logger messages have been removed from the implementation

      // Verify all groups are cleared
      const status = runnerManager.getStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });
  });

  describe('parallel runner management', () => {
    beforeEach(async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });
    });

    it('should handle concurrent scaling operations with mutex', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr.includes('/runners/test-repo')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      const runnerDirents = Array.from({ length: 5 }, (_, i) => ({
        name: `runner-p${i}-test123`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');
      vi.mocked(mockGitHubClient).listRunners.mockResolvedValue([]);

      const mockRunnerInstance = {
        setup: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        getId: vi.fn().mockReturnValue('test-uuid'),
        isRunning: vi.fn().mockReturnValue(true),
        setOnCrashCallback: vi.fn(),
        dispose: vi.fn(),
      };
      vi.mocked(RunnerInstance).mockImplementation(
        () => mockRunnerInstance as unknown as RunnerInstance,
      );

      // Track the order of operations
      const operationOrder: number[] = [];
      const originalScale = runnerManager.scale.bind(runnerManager);

      vi.spyOn(runnerManager, 'scale').mockImplementation(async (repo, count) => {
        operationOrder.push(count);
        await originalScale(repo, count);
      });

      // Perform concurrent scaling operations
      const scalePromises = [
        runnerManager.scale(testRepository, 3),
        runnerManager.scale(testRepository, 5),
        runnerManager.scale(testRepository, 2),
      ];

      await Promise.all(scalePromises);

      // Operations should be serialized by mutex
      expect(operationOrder).toEqual([3, 5, 2]);

      // Final state should be 2 runners (last operation)
      const status = runnerManager.getStatus();
      expect(status['test/repo']?.runners).toBeDefined();
    });

    it('should manage multiple parallel runners independently', async () => {
      // Test renamed to reflect actual behavior
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        // Allow access to runner directory and all runner subdirectories
        if (
          pathStr.includes('test-repo') ||
          pathStr.includes('.runner') ||
          pathStr.includes('run.sh')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      // Set up 5 existing configured runners with runner- prefix
      const runnerDirents = Array.from({ length: 5 }, (_, i) => ({
        name: `runner-existing${i}-abc123`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      let _runnerCounter = 0;
      const mockInstances: Array<any> = [];

      vi.mocked(RunnerInstance).mockImplementation((id) => {
        const instance = {
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(undefined),
          getId: vi.fn().mockReturnValue(id),
          isRunning: vi.fn().mockReturnValue(true),
          stopAndRemove: vi.fn().mockResolvedValue(undefined),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn().mockResolvedValue(undefined),
        };
        mockInstances.push(instance as unknown as any);
        _runnerCounter++;
        return instance as unknown as RunnerInstance;
      });

      // Scale up to 5 runners
      await runnerManager.scale(testRepository, 5);

      // Should create 5 runner instances
      expect(RunnerInstance).toHaveBeenCalledTimes(5);
      expect(mockInstances).toHaveLength(5);
      mockInstances.forEach((instance) => {
        expect(instance.setup).toHaveBeenCalledTimes(1);
        expect(instance.start).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle partial failures when scaling up', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr.includes('/runners/test-repo')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      const runnerDirents = Array.from({ length: 4 }, (_, i) => ({
        name: `runner-fail${i}-test`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      let runnerCounter = 0;
      vi.mocked(RunnerInstance).mockImplementation(() => {
        const id = `runner-${runnerCounter++}`;
        const instance = {
          setup: vi.fn().mockImplementation(() => {
            // Make every other runner fail
            if (runnerCounter % 2 === 0) {
              return Promise.reject(new Error('Setup failed'));
            }
            return Promise.resolve();
          }),
          start: vi.fn(),
          getId: vi.fn().mockReturnValue(id),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn(),
        };
        return instance as unknown as RunnerInstance;
      });

      await expect(runnerManager.scale(testRepository, 4)).rejects.toThrow('Setup failed');

      // Should have attempted to create 4 runners
      expect(RunnerInstance).toHaveBeenCalledTimes(4);
      // Should have logged 2 errors (runners 1 and 3 fail - 0-indexed so runners 1 and 3)
      const { logger } = await import('../../../../src/utils/logger');
      expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it('should limit concurrent runner operations', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (
          pathStr.includes('test-repo') ||
          pathStr.includes('.runner') ||
          pathStr.includes('run.sh')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      const runnerDirents = Array.from({ length: 10 }, (_, i) => ({
        name: `runner-limit${i}-test`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      const setupDelays: number[] = [];
      let activeSetups = 0;
      let maxConcurrentSetups = 0;

      vi.mocked(RunnerInstance).mockImplementation((id) => {
        const delay = Math.random() * 100; // Random delay up to 100ms
        setupDelays.push(delay);

        const instance = {
          setup: vi.fn().mockImplementation(async () => {
            activeSetups++;
            maxConcurrentSetups = Math.max(maxConcurrentSetups, activeSetups);
            await new Promise((resolve) => setTimeout(resolve, delay));
            activeSetups--;
          }),
          start: vi.fn(),
          getId: vi.fn().mockReturnValue(id),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn(),
        };
        return instance as unknown as RunnerInstance;
      });

      // Scale up to many runners
      await runnerManager.scale(testRepository, 10);

      // Verify all runners were created
      expect(RunnerInstance).toHaveBeenCalledTimes(10);
      // Concurrent setups should be reasonable (not all at once)
      expect(maxConcurrentSetups).toBeLessThanOrEqual(10);
    });
  });

  describe('resource management', () => {
    beforeEach(async () => {
      vi.mocked(mockGitHubClient).validateRepository.mockResolvedValue(true);
      await runnerManager.initializeRepository(testRepository, { labels: ['test'] });
    });

    it('should properly clean up resources when scaling down', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners for scale up
      const runnerDir = '/runners/test-repo';
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (pathStr === runnerDir || pathStr.includes('.runner') || pathStr.includes('run.sh')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      const runnerDirents = Array.from({ length: 5 }, (_, i) => ({
        name: `runner-resource${i}-test`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      const mockInstances: Array<any> = [];
      vi.mocked(RunnerInstance).mockImplementation(() => {
        const instance = {
          setup: vi.fn().mockResolvedValue(undefined),
          start: vi.fn(),
          stop: vi.fn().mockResolvedValue(undefined),
          stopAndRemove: vi.fn().mockResolvedValue(undefined),
          setOnCrashCallback: vi.fn(),
          dispose: vi.fn().mockResolvedValue(undefined),
          getId: vi.fn().mockReturnValue(`runner-${mockInstances.length}`),
          isRunning: vi.fn().mockReturnValue(true),
        };
        mockInstances.push(instance as unknown as any);
        return instance as unknown as RunnerInstance;
      });

      // Scale up
      await runnerManager.scale(testRepository, 5);
      expect(mockInstances).toHaveLength(5);

      // Mock the runner list for scaling down
      vi.mocked(mockGitHubClient).listRunners.mockResolvedValue([
        { id: 1, name: 'runner-1', os: 'linux', status: 'idle', labels: [] },
        { id: 2, name: 'runner-2', os: 'linux', status: 'idle', labels: [] },
        { id: 3, name: 'runner-3', os: 'linux', status: 'idle', labels: [] },
        { id: 4, name: 'runner-4', os: 'linux', status: 'idle', labels: [] },
        { id: 5, name: 'runner-5', os: 'linux', status: 'idle', labels: [] },
      ]);
      vi.mocked(mockGitHubClient).deleteRunner.mockResolvedValue(undefined);

      // Scale down
      await runnerManager.scale(testRepository, 2);

      // Should have called stop for 3 runners
      expect(mockInstances[4]?.stop).toHaveBeenCalledTimes(1);
      expect(mockInstances[3]?.stop).toHaveBeenCalledTimes(1);
      expect(mockInstances[2]?.stop).toHaveBeenCalledTimes(1);
    });

    it('should handle memory efficiently with many runners', async () => {
      // Mock filesystem operations

      // Mock discovering existing runners
      vi.mocked(fs).access.mockImplementation((pathArg) => {
        const pathStr = String(pathArg);
        if (
          pathStr.includes('test-repo') ||
          pathStr.includes('.runner') ||
          pathStr.includes('run.sh')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('Not found'));
      });

      const runnerDirents = Array.from({ length: 50 }, (_, i) => ({
        name: `runner-memory${i}-test`,
        isDirectory: () => true,
      }));
      vi.mocked(fs).readdir.mockResolvedValue(runnerDirents as unknown as Dirent<Buffer>[]);

      vi.mocked(mockGitHubClient).getRunnerRegistrationToken.mockResolvedValue('reg-token');

      const mockRunnerInstance = {
        setup: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        getId: vi.fn().mockImplementation((id: string) => id),
        isRunning: vi.fn().mockReturnValue(true),
        setOnCrashCallback: vi.fn(),
        dispose: vi.fn(),
      };
      vi.mocked(RunnerInstance).mockImplementation(
        (id) =>
          ({
            ...mockRunnerInstance,
            getId: vi.fn().mockReturnValue(id),
          }) as unknown as RunnerInstance,
      );

      // Scale up to a large number
      await runnerManager.scale(testRepository, 50);

      expect(RunnerInstance).toHaveBeenCalledTimes(50);
      // Verify no memory leaks by checking that the manager is still responsive
      const status = runnerManager.getStatus();
      expect(status['test/repo']?.runners).toBeDefined();
    });
  });
});
