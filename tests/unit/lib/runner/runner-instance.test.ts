import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerInstance } from '../../../../src/lib/runner/runner-instance';
import type { RunnerConfig } from '../../../../src/types';
import * as platform from '../../../../src/utils/platform';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('../../../../src/utils/logger');
vi.mock('../../../../src/utils/platform');
vi.mock('../../../../src/utils/paths', () => ({
  getRunnerDir: vi.fn(
    (owner: string, repo: string, id: string) => `/test/runners/${owner}-${repo}/${id}`,
  ),
  getRunnerLogPath: vi.fn(
    (owner: string, repo: string, id: string) => `/test/logs/${owner}-${repo}/${id}.log`,
  ),
  getRunnerPidPath: vi.fn(
    (owner: string, repo: string, id: string) => `/test/runners/${owner}-${repo}/${id}.pid`,
  ),
}));
vi.mock('../../../../src/utils/fs-helpers', () => ({
  writePidFile: vi.fn(() => Promise.resolve()),
  removePidFile: vi.fn(() => Promise.resolve()),
}));

describe('RunnerInstance', () => {
  let runnerInstance: RunnerInstance;
  let mockProcess: Partial<ChildProcess>;

  const mockConfig: RunnerConfig = {
    repository: { owner: 'test-owner', repo: 'test-repo' },
    name: 'test-runner',
    labels: ['self-hosted', 'linux', 'x64'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock process
    mockProcess = {
      stdout: { on: vi.fn() } as unknown as NodeJS.ReadStream,
      stderr: { on: vi.fn() } as unknown as NodeJS.ReadStream,
      on: vi.fn(),
      kill: vi.fn(),
      killed: false,
      pid: 1234,
      unref: vi.fn(),
    };

    // Setup mocks
    // biome-ignore lint/suspicious/noExplicitAny: Mock type casting
    vi.mocked(spawn).mockReturnValue(mockProcess as any);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

    const mockWriteStream = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    // biome-ignore lint/suspicious/noExplicitAny: Mock type casting
    vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

    // Mock platform utilities
    vi.mocked(platform.getPlatformInfo).mockReturnValue({
      isWindows: false,
      isLinux: true,
      isMacOS: false,
      runnerScript: 'run.sh',
      shell: '/bin/sh',
      shellArgs: [],
      pathSeparator: '/',
    });
    vi.mocked(platform.killProcess).mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should create a runner instance with correct properties', () => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
      expect(runnerInstance.getId()).toBe('test-id');
    });
  });

  describe('setup', () => {
    beforeEach(() => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
    });

    it('should skip setup if runner is already configured', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined); // All files exist

      await runnerInstance.setup();

      expect(fsPromises.access).toHaveBeenCalledTimes(3); // runnerDir, .runner, run.sh
      expect(fsPromises.mkdir).not.toHaveBeenCalled();
    });

    it('should create runner directory if it does not exist', async () => {
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found')); // runnerDir doesn't exist
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found')); // run.sh doesn't exist

      await expect(runnerInstance.setup()).rejects.toThrow('Runner not found');

      expect(fsPromises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('test-owner-test-repo'),
        {
          recursive: true,
        },
      );
    });

    it('should throw error if runner binary does not exist', async () => {
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found')); // runnerDir doesn't exist
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found')); // run.sh doesn't exist

      await expect(runnerInstance.setup()).rejects.toThrow('Runner not found');
    });
  });

  describe('start', () => {
    beforeEach(() => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
    });

    it('should throw error if runner is not configured', () => {
      expect(() => runnerInstance.start()).toThrow('Runner test-id is not configured');
    });

    it('should spawn runner process when configured', async () => {
      // Setup as configured
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();

      expect(spawn).toHaveBeenCalledWith(
        '/bin/sh',
        [expect.stringContaining('run.sh')],
        expect.objectContaining({
          cwd: expect.stringContaining('test-owner-test-repo'),
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('should handle process stdout and stderr', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();

      expect(mockProcess.stdout!.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.stderr!.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
    });

    it('should kill running process', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();
      await runnerInstance.stop();

      expect(platform.killProcess).toHaveBeenCalledWith(mockProcess, 'SIGINT');
    });

    it('should handle stop when no process is running', async () => {
      await expect(runnerInstance.stop()).resolves.not.toThrow();
    });

    it('should force kill process after timeout', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();

      // Mock killProcess to simulate a stubborn process
      let killCount = 0;
      vi.mocked(platform.killProcess).mockImplementation(async (_process, signal) => {
        killCount++;
        // Simulate process exit only on SIGKILL (3rd attempt)
        if (killCount === 3 && signal === 'SIGKILL') {
          // Find and call the exit handler
          const exitHandler = vi
            .mocked(mockProcess.on)
            .mock.calls.find((call) => call[0] === 'exit')?.[1];
          if (exitHandler) {
            // Simulate exit after a small delay
            setTimeout(() => exitHandler(0, null), 10);
          }
        }
      });

      await runnerInstance.stop();

      expect(runnerInstance.isRunning()).toBe(false);
    });
  });

  describe('concurrent runners', () => {
    it('should handle multiple runner instances independently', async () => {
      const runner1 = new RunnerInstance('runner-1', mockConfig, 'token');
      const runner2 = new RunnerInstance('runner-2', mockConfig, 'token');

      vi.mocked(fsPromises.access).mockResolvedValue(undefined);

      await runner1.setup();
      await runner2.setup();

      runner1.start();
      runner2.start();

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(spawn).toHaveBeenCalledWith(
        '/bin/sh',
        [expect.stringContaining('run.sh')],
        expect.objectContaining({
          cwd: expect.stringContaining('runner-1'),
        }),
      );
      expect(spawn).toHaveBeenCalledWith(
        '/bin/sh',
        [expect.stringContaining('run.sh')],
        expect.objectContaining({
          cwd: expect.stringContaining('runner-2'),
        }),
      );
    });
  });

  describe('resource cleanup', () => {
    beforeEach(() => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
    });

    it('should dispose all resources', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();
      await runnerInstance.dispose();

      expect(platform.killProcess).toHaveBeenCalledWith(mockProcess, 'SIGKILL');
      expect(runnerInstance.isRunning()).toBe(false);
    });

    it('should handle dispose without process', async () => {
      await expect(runnerInstance.dispose()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      runnerInstance = new RunnerInstance('test-id', mockConfig, 'test-token');
    });

    it('should handle process spawn errors', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      vi.mocked(spawn).mockImplementation(() => {
        const proc = mockProcess as ChildProcess;
        // Use setImmediate instead of setTimeout to avoid timing issues
        setImmediate(() => {
          const onError = vi.mocked(proc.on).mock.calls.find((call) => call[0] === 'error')?.[1];
          if (onError) onError(new Error('Spawn failed'));
        });
        return proc;
      });

      runnerInstance.start();

      // Wait for next tick
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockProcess.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle process exit codes', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      await runnerInstance.setup();

      runnerInstance.start();

      const exitHandler = vi
        .mocked(mockProcess.on)
        .mock.calls.find((call) => call[0] === 'exit')?.[1];
      exitHandler(1);

      expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });
  });
});
