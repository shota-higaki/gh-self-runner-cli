import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ProcessLike } from '../../../src/utils/platform.js';

// Mock modules before imports
vi.mock('os', () => ({
  platform: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';
// Import after mocking
import { platform } from 'os';
import { getPlatformInfo, killProcess } from '../../../src/utils/platform.js';

describe('Platform Utilities', () => {
  const mockPlatform = platform as Mock;
  const mockExec = exec as Mock;
  let mockProcess: ProcessLike;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = {
      pid: 1234,
      kill: vi.fn().mockReturnValue(true),
      killed: false,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPlatformInfo', () => {
    it('should return correct info for Windows', () => {
      mockPlatform.mockReturnValue('win32');

      const info = getPlatformInfo();

      expect(info).toEqual({
        isWindows: true,
        isLinux: false,
        isMacOS: false,
        runnerScript: 'run.cmd',
        shell: 'cmd.exe',
        shellArgs: ['/c'],
        pathSeparator: '\\',
      });
    });

    it('should return correct info for Linux', () => {
      mockPlatform.mockReturnValue('linux');

      const info = getPlatformInfo();

      expect(info).toEqual({
        isWindows: false,
        isLinux: true,
        isMacOS: false,
        runnerScript: 'run.sh',
        shell: '/bin/sh',
        shellArgs: [],
        pathSeparator: '/',
      });
    });

    it('should return correct info for macOS', () => {
      mockPlatform.mockReturnValue('darwin');

      const info = getPlatformInfo();

      expect(info).toEqual({
        isWindows: false,
        isLinux: false,
        isMacOS: true,
        runnerScript: 'run.sh',
        shell: '/bin/sh',
        shellArgs: [],
        pathSeparator: '/',
      });
    });

    it('should handle unknown platform', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing unknown platform
      mockPlatform.mockReturnValue('unknown' as any);

      const info = getPlatformInfo();

      expect(info).toEqual({
        isWindows: false,
        isLinux: false,
        isMacOS: false,
        runnerScript: 'run.sh',
        shell: '/bin/sh',
        shellArgs: [],
        pathSeparator: '/',
      });
    });
  });

  describe('killProcess', () => {
    it('should use regular kill on Unix-like systems', async () => {
      mockPlatform.mockReturnValue('linux');

      await killProcess(mockProcess, 'SIGTERM');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should use taskkill on Windows for SIGKILL', async () => {
      mockPlatform.mockReturnValue('win32');
      // biome-ignore lint/suspicious/noExplicitAny: Callback type
      mockExec.mockImplementation((_cmd, callback: any) => callback(null));

      await killProcess(mockProcess, 'SIGKILL');

      expect(mockExec).toHaveBeenCalledWith('taskkill /pid 1234 /t /f', expect.any(Function));
    });

    it('should fallback to regular kill on Windows if taskkill fails', async () => {
      mockPlatform.mockReturnValue('win32');
      // biome-ignore lint/suspicious/noExplicitAny: Callback type
      mockExec.mockImplementation((_cmd, callback: any) => callback(new Error('Failed')));

      await killProcess(mockProcess, 'SIGKILL');

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should handle SIGTERM gracefully on Windows', async () => {
      mockPlatform.mockReturnValue('win32');

      await killProcess(mockProcess, 'SIGTERM');

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});
