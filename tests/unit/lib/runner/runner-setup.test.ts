import { execSync } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as streamPromises from 'stream/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerSetup } from '../../../../src/lib/runner/runner-setup';
import type { Repository } from '../../../../src/types';
import * as utils from '../../../../src/utils';

// Mock dependencies
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    spawnSync: vi.fn(() => ({
      status: 0,
      error: null,
      stdout: '',
      stderr: '',
    })),
  };
});
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('stream/promises');
vi.mock('../../../../src/utils/logger');
vi.mock('../../../../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getPlatformInfo: vi.fn().mockReturnValue({
    isWindows: false,
    isLinux: true,
    isMacOS: false,
    runnerScript: 'run.sh',
    shell: '/bin/sh',
    shellArgs: [],
    pathSeparator: '/',
  }),
  PATHS: {
    BASE_DIR: '/.github/self-hosted-runners',
  },
}));

// Mock fetch globally
global.fetch = vi.fn() as any;

describe('RunnerSetup', () => {
  let runnerSetup: RunnerSetup;
  const mockRepo: Repository = { owner: 'test-owner', repo: 'test-repo' };
  let originalPlatform: PropertyDescriptor | undefined;
  let originalArch: PropertyDescriptor | undefined;

  const mockDownloads = [
    {
      os: 'linux',
      architecture: 'x64',
      download_url:
        'https://github.com/actions/runner/releases/download/v2.300.0/actions-runner-linux-x64-2.300.0.tar.gz',
      filename: 'actions-runner-linux-x64-2.300.0.tar.gz',
      sha256_checksum: 'abc123',
    },
    {
      os: 'osx',
      architecture: 'x64',
      download_url:
        'https://github.com/actions/runner/releases/download/v2.300.0/actions-runner-osx-x64-2.300.0.tar.gz',
      filename: 'actions-runner-osx-x64-2.300.0.tar.gz',
      sha256_checksum: 'def456',
    },
    {
      os: 'win',
      architecture: 'x64',
      download_url:
        'https://github.com/actions/runner/releases/download/v2.300.0/actions-runner-win-x64-2.300.0.zip',
      filename: 'actions-runner-win-x64-2.300.0.zip',
      sha256_checksum: 'ghi789',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Store original platform/arch
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalArch = Object.getOwnPropertyDescriptor(process, 'arch');

    // Mock platform to Linux x64 by default
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    Object.defineProperty(process, 'arch', {
      value: 'x64',
      configurable: true,
    });

    // Set up getPlatformInfo mock
    vi.spyOn(utils, 'getPlatformInfo').mockReturnValue({
      isWindows: false,
      isLinux: true,
      isMacOS: false,
      runnerScript: 'run.sh',
      shell: '/bin/sh',
      shellArgs: [],
      pathSeparator: '/',
    });

    // Set up common mocks
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);
    vi.mocked(fsPromises.readdir).mockResolvedValue([]);
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const mockWriteStream = {
      on: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);
    vi.mocked(streamPromises.pipeline).mockResolvedValue(undefined);

    runnerSetup = new RunnerSetup('/test/base/dir');
  });

  afterEach(() => {
    // Restore original platform/arch
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    if (originalArch) {
      Object.defineProperty(process, 'arch', originalArch);
    }
    vi.restoreAllMocks();
  });

  describe('downloadRunner', () => {
    beforeEach(() => {
      // Mock platform as Linux by default
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      Object.defineProperty(process, 'arch', {
        value: 'x64',
        configurable: true,
      });
    });

    it('should download and extract runner for Linux', async () => {
      // Create a proper ReadableStream mock
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockResponse = {
        ok: true,
        body: mockStream,
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found'));

      const result = await runnerSetup.downloadRunner(mockDownloads);

      // Platform-agnostic path check
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toMatch(
        /\/test\/base\/dir\/downloads\/actions-runner-.*\.(tar\.gz|zip)$/,
      );
      expect(global.fetch).toHaveBeenCalledWith(mockDownloads[0].download_url);
      // execSync should not be called for download
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should download and extract runner for macOS', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      // Update getPlatformInfo mock for macOS
      vi.spyOn(utils, 'getPlatformInfo').mockReturnValue({
        isWindows: false,
        isLinux: false,
        isMacOS: true,
        runnerScript: 'run.sh',
        shell: '/bin/sh',
        shellArgs: [],
        pathSeparator: '/',
      });

      // Create new instance after changing platform
      runnerSetup = new RunnerSetup('/test/base/dir');

      // Create a proper ReadableStream mock
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockResponse = {
        ok: true,
        body: mockStream,
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found'));

      const result = await runnerSetup.downloadRunner(mockDownloads);

      // Platform-agnostic path check
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toMatch(
        /\/test\/base\/dir\/downloads\/actions-runner-.*\.(tar\.gz|zip)$/,
      );
      expect(global.fetch).toHaveBeenCalledWith(mockDownloads[1].download_url);
      // execSync should not be called for download
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should download and extract runner for Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      // Update getPlatformInfo mock for Windows
      vi.spyOn(utils, 'getPlatformInfo').mockReturnValue({
        isWindows: true,
        isLinux: false,
        isMacOS: false,
        runnerScript: 'run.cmd',
        shell: 'cmd.exe',
        shellArgs: ['/c'],
        pathSeparator: '\\',
      });

      // Create new instance after changing platform
      runnerSetup = new RunnerSetup('/test/base/dir');

      // Create a proper ReadableStream mock
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockResponse = {
        ok: true,
        body: mockStream,
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found'));

      const result = await runnerSetup.downloadRunner(mockDownloads);

      // Platform-agnostic path check
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toMatch(
        /\/test\/base\/dir\/downloads\/actions-runner-.*\.(tar\.gz|zip)$/,
      );
      expect(global.fetch).toHaveBeenCalledWith(mockDownloads[2].download_url);
      // execSync should not be called for download
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should skip download if runner already exists', async () => {
      // Mock that the file already exists
      vi.mocked(fsPromises.access).mockResolvedValueOnce(undefined);

      const result = await runnerSetup.downloadRunner(mockDownloads);

      // Platform-agnostic path check
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toMatch(
        /\/test\/base\/dir\/downloads\/actions-runner-.*\.(tar\.gz|zip)$/,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle download errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found'));

      await expect(runnerSetup.downloadRunner(mockDownloads)).rejects.toThrow('Network error');
    });
  });

  describe('configureRunner', () => {
    it('should configure runner successfully', async () => {
      await runnerSetup.configureRunner('/path/to/runner', mockRepo, 'test-token', 'test-runner', [
        'self-hosted',
        'linux',
      ]);

      const { spawnSync } = await import('child_process');
      expect(spawnSync).toHaveBeenCalled();
    });

    it('should configure runner without custom name', async () => {
      await runnerSetup.configureRunner(
        '/path/to/runner',
        mockRepo,
        'test-token',
        'default-runner',
        ['self-hosted'],
      );

      const { spawnSync } = await import('child_process');
      expect(spawnSync).toHaveBeenCalled();
    });

    it('should handle configuration errors', async () => {
      const { spawnSync } = await import('child_process');
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        error: null,
        stdout: '',
        stderr: 'Config failed',
        pid: 1234,
        output: ['', '', ''],
        signal: null,
      } as any);

      await expect(
        runnerSetup.configureRunner('/path/to/runner', mockRepo, 'test-token', 'test-runner'),
      ).rejects.toThrow('Failed to configure runner:');
    });
  });

  describe('setupRunner', () => {
    it('should setup runner with all steps', async () => {
      // Mock successful download
      vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('Not found')); // File not downloaded yet
      // Create a proper ReadableStream mock
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockResponse = {
        ok: true,
        body: mockStream,
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Mock extractRunner calls
      const runnerDir = await runnerSetup.setupRunner(
        mockRepo,
        'test-token',
        'runner-123',
        mockDownloads,
        ['self-hosted', 'linux'],
      );

      // Platform-agnostic path check
      const normalizedRunnerDir = runnerDir.replace(/\\/g, '/');
      expect(normalizedRunnerDir).toBe('/test/base/dir/test-owner-test-repo/runner-123');
      expect(fsPromises.mkdir).toHaveBeenCalledWith(runnerDir, { recursive: true });
      const { spawnSync } = await import('child_process');
      expect(spawnSync).toHaveBeenCalled(); // For extraction and configuration
    });
  });
});
