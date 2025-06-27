import { platform } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsHelpers from '../../../src/utils/fs-helpers';
import * as utilsIndex from '../../../src/utils/index.js';
import {
  checkRunningProcesses,
  cleanStalePidFiles,
  isProcessRunning,
  stopAllProcesses,
} from '../../../src/utils/process-helpers';

// Mock all modules first
vi.mock('../../../src/utils/fs-helpers');
vi.mock('../../../src/utils/logger');
vi.mock('../../../src/utils/index.js');
vi.mock('os');
vi.mock('child_process');

// Mock process.kill
const originalKill = process.kill;

describe('process-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.kill = vi.fn() as any;
  });

  afterEach(() => {
    process.kill = originalKill;
  });

  describe('isProcessRunning', () => {
    it('should return true for running process', () => {
      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockReturnValue(true);

      const result = isProcessRunning(12345);

      expect(result).toBe(true);
      expect(mockKill).toHaveBeenCalledWith(12345, 0);
    });

    it('should return false for non-existent process', () => {
      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const result = isProcessRunning(12345);

      expect(result).toBe(false);
    });

    it('should return false for permission denied', () => {
      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockImplementation(() => {
        throw new Error('EPERM');
      });

      const result = isProcessRunning(12345);

      expect(result).toBe(false);
    });
  });

  describe('stopAllProcesses', () => {
    beforeEach(() => {
      vi.mocked(platform).mockReturnValue('linux');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop all processes in directories', async () => {
      // Setup mocks
      vi.mocked(utilsIndex.parseRepository)
        .mockReturnValueOnce({ owner: 'owner1', repo: 'repo1' })
        .mockReturnValueOnce({ owner: 'owner2', repo: 'repo2' });

      vi.mocked(utilsIndex.getPidDir)
        .mockReturnValueOnce('/runners/owner1-repo1/pids')
        .mockReturnValueOnce('/runners/owner2-repo2/pids');

      vi.mocked(fsHelpers.listPidFiles)
        .mockResolvedValueOnce(['runner1.pid', 'runner2.pid'])
        .mockResolvedValueOnce(['runner3.pid']);

      vi.mocked(fsHelpers.readPidFile)
        .mockResolvedValueOnce(12345)
        .mockResolvedValueOnce(67890)
        .mockResolvedValueOnce(11111);

      const mockKill = vi.mocked(process.kill) as any;
      let killCalls = 0;

      mockKill.mockImplementation((_pid, signal) => {
        if (signal === 0) {
          // First check shows process exists, subsequent checks show it's gone
          killCalls++;
          if (killCalls <= 3) {
            return true; // Process exists on first check
          }
          throw new Error('ESRCH'); // Process gone on subsequent checks
        }
        return true;
      });

      // Use fake timers but run the operation
      const resultPromise = stopAllProcesses(['owner1/repo1', 'owner2/repo2']);

      // Fast-forward through all timeouts at once
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.stoppedCount).toBe(3);
      expect(fsHelpers.removePidFile).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should handle empty directories', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'empty' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-empty/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue([]);

      const result = await stopAllProcesses(['owner/empty']);

      expect(result.stoppedCount).toBe(0);
    });

    it('should handle non-existent directories', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({
        owner: 'owner',
        repo: 'nonexistent',
      });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-nonexistent/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue([]);

      const result = await stopAllProcesses(['owner/nonexistent']);

      expect(result.stoppedCount).toBe(0);
    });

    it('should handle Windows platform', async () => {
      vi.mocked(platform).mockReturnValue('win32');

      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'test' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-test/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue(['runner.pid']);
      vi.mocked(fsHelpers.readPidFile).mockResolvedValue(12345);

      const mockKill = vi.mocked(process.kill) as any;
      // On Windows, the implementation just uses regular process.kill (no special handling)
      mockKill.mockImplementation((_pid, signal) => {
        if (signal === 0) {
          return true; // Process exists initially
        }
        if (signal === 'SIGINT') {
          // After SIGINT, process stops
          return true;
        }
        return true;
      });

      const resultPromise = stopAllProcesses(['owner/test']);

      // Advance through all the timeouts
      await vi.advanceTimersByTimeAsync(4000);

      const result = await resultPromise;

      // Process should be stopped using regular signals
      expect(result.stoppedCount).toBe(1);
      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGINT');
      expect(fsHelpers.removePidFile).toHaveBeenCalled();
    }, 10000);

    it('should escalate signals for stubborn processes', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'test' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-test/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue(['stubborn.pid']);
      vi.mocked(fsHelpers.readPidFile).mockResolvedValue(99999);

      const mockKill = vi.mocked(process.kill) as any;
      const signalsSent: (string | number)[] = [];
      let processRunning = true;

      mockKill.mockImplementation((_pid, signal) => {
        signalsSent.push(signal);
        if (signal === 'SIGKILL') {
          processRunning = false;
        }
        if (signal === 0) {
          // Check if process exists
          if (!processRunning) {
            throw new Error('ESRCH');
          }
        }
        return true;
      });

      const resultPromise = stopAllProcesses(['owner/test']);

      // Advance through all timeouts
      await vi.advanceTimersByTimeAsync(4000);

      await resultPromise;

      expect(signalsSent).toContain('SIGINT');
      expect(signalsSent).toContain('SIGTERM');
      expect(signalsSent).toContain('SIGKILL');
    }, 10000);
  });

  describe('cleanStalePidFiles', () => {
    it('should remove PID files for dead processes', async () => {
      vi.mocked(utilsIndex.parseRepository)
        .mockReturnValueOnce({ owner: 'owner1', repo: 'repo1' })
        .mockReturnValueOnce({ owner: 'owner2', repo: 'repo2' });

      vi.mocked(utilsIndex.getPidDir)
        .mockReturnValueOnce('/runners/owner1-repo1/pids')
        .mockReturnValueOnce('/runners/owner2-repo2/pids');

      vi.mocked(fsHelpers.listPidFiles)
        .mockResolvedValueOnce(['stale.pid', 'active.pid'])
        .mockResolvedValueOnce(['dead.pid']);

      vi.mocked(fsHelpers.readPidFile)
        .mockResolvedValueOnce(12345) // stale
        .mockResolvedValueOnce(67890) // active
        .mockResolvedValueOnce(11111); // dead

      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockImplementation((pid) => {
        if (pid === 67890) {
          return true; // Active process
        }
        throw new Error('ESRCH'); // Dead process
      });

      const cleaned = await cleanStalePidFiles(['owner1/repo1', 'owner2/repo2']);

      expect(cleaned).toBe(2); // stale.pid and dead.pid
      expect(fsHelpers.removePidFile).toHaveBeenCalledTimes(2);
    });

    it('should handle empty repositories', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'repo' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-repo/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue([]);

      const cleaned = await cleanStalePidFiles(['owner/repo']);

      expect(cleaned).toBe(0);
    });

    it('should skip PID files that cannot be read', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'repo' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-repo/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue(['invalid.pid']);
      vi.mocked(fsHelpers.readPidFile).mockResolvedValue(null);

      const cleaned = await cleanStalePidFiles(['owner/repo']);

      expect(cleaned).toBe(0);
    });
  });

  describe('checkRunningProcesses', () => {
    it('should return running processes count', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'repo' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-repo/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue(['running.pid', 'ghost.pid']);
      vi.mocked(fsHelpers.readPidFile)
        .mockResolvedValueOnce(12345) // running
        .mockResolvedValueOnce(67890); // ghost

      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockImplementation((pid) => {
        if (pid === 12345) {
          return true; // Running
        }
        throw new Error('ESRCH'); // Ghost
      });

      const result = await checkRunningProcesses(['owner/repo']);

      expect(result.totalCount).toBe(1);
      expect(result.byRepository.get('owner/repo')).toBe(1);
    });

    it('should handle multiple repositories', async () => {
      vi.mocked(utilsIndex.parseRepository)
        .mockReturnValueOnce({ owner: 'owner1', repo: 'repo1' })
        .mockReturnValueOnce({ owner: 'owner2', repo: 'repo2' });

      vi.mocked(utilsIndex.getPidDir)
        .mockReturnValueOnce('/runners/owner1-repo1/pids')
        .mockReturnValueOnce('/runners/owner2-repo2/pids');

      vi.mocked(fsHelpers.listPidFiles)
        .mockResolvedValueOnce(['p1.pid'])
        .mockResolvedValueOnce(['p2.pid']);

      vi.mocked(fsHelpers.readPidFile).mockResolvedValueOnce(11111).mockResolvedValueOnce(22222);

      const mockKill = vi.mocked(process.kill) as any;
      mockKill.mockReturnValue(true); // All running

      const result = await checkRunningProcesses(['owner1/repo1', 'owner2/repo2']);

      expect(result.totalCount).toBe(2);
      expect(result.byRepository.get('owner1/repo1')).toBe(1);
      expect(result.byRepository.get('owner2/repo2')).toBe(1);
    });

    it('should skip invalid PID files', async () => {
      vi.mocked(utilsIndex.parseRepository).mockReturnValue({ owner: 'owner', repo: 'repo' });
      vi.mocked(utilsIndex.getPidDir).mockReturnValue('/runners/owner-repo/pids');
      vi.mocked(fsHelpers.listPidFiles).mockResolvedValue(['invalid.pid']);
      vi.mocked(fsHelpers.readPidFile).mockResolvedValue(null);

      const result = await checkRunningProcesses(['owner/repo']);

      expect(result.totalCount).toBe(0);
      expect(result.byRepository.size).toBe(0);
    });
  });
});
