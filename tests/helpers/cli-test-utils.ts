import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { type MockedFunction, vi } from 'vitest';

export interface MockSpinner {
  start: MockedFunction<() => MockSpinner>;
  succeed: MockedFunction<(text?: string) => MockSpinner>;
  fail: MockedFunction<(text?: string) => MockSpinner>;
  stop: MockedFunction<() => MockSpinner>;
  text: string;
}

/**
 * Create a mock spinner for testing
 */
export function createMockSpinner(): MockSpinner {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  };

  // biome-ignore lint/suspicious/noExplicitAny: Mock type casting
  return spinner as any;
}

/**
 * Setup common CLI mocks
 */
export function setupCLIMocks() {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  return {
    mockExit,
    mockConsoleLog,
    mockConsoleError,
    restore: () => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
      mockConsoleError.mockRestore();
    },
  };
}

/**
 * Mock file system operations
 */
export function mockFileSystem() {
  return {
    mockAccess: fs.access as MockedFunction<typeof fs.access>,
    mockMkdir: fs.mkdir as MockedFunction<typeof fs.mkdir>,
    mockWriteFile: fs.writeFile as MockedFunction<typeof fs.writeFile>,
    mockReadFile: fs.readFile as MockedFunction<typeof fs.readFile>,
    mockReaddir: fs.readdir as MockedFunction<typeof fs.readdir>,
    mockUnlink: fs.unlink as MockedFunction<typeof fs.unlink>,
    mockRm: fs.rm as MockedFunction<typeof fs.rm>,
    mockStat: fs.stat as MockedFunction<typeof fs.stat>,
  };
}

/**
 * Mock child process operations
 */
export function mockChildProcess() {
  const mockSpawn = spawn as MockedFunction<typeof spawn>;
  const mockExecSync = execSync as MockedFunction<typeof execSync>;

  return {
    mockSpawn,
    mockExecSync,
  };
}

/**
 * Create a mock GitHub client
 */
export function createMockGitHubClient() {
  return {
    validateRepository: vi.fn(() => Promise.resolve(true)),
    getRunnerRegistrationToken: vi.fn(() => Promise.resolve('reg-token')),
    getRunnerRemovalToken: vi.fn(() => Promise.resolve('rem-token')),
    listRunners: vi.fn(() => Promise.resolve([])),
    deleteRunner: vi.fn(() => Promise.resolve(undefined)),
    getRunnerDownloads: vi.fn(() =>
      Promise.resolve([
        {
          os: 'linux',
          architecture: 'x64',
          download_url: 'https://example.com/runner.tar.gz',
          filename: 'runner.tar.gz',
        },
      ]),
    ),
    getRunnerDownloadUrl: vi.fn(() =>
      Promise.resolve({
        url: 'https://example.com/runner.tar.gz',
        filename: 'runner.tar.gz',
      }),
    ),
  };
}

/**
 * Create a mock runner manager
 */
export function createMockRunnerManager() {
  const mockRunnerManager = {
    initializeRepository: vi.fn(() => Promise.resolve(undefined)),
    scale: vi.fn(() => Promise.resolve(undefined)),
    getStatus: vi.fn(() => ({})),
    stopAll: vi.fn(() => Promise.resolve(undefined)),
    startAll: vi.fn(() => Promise.resolve(undefined)),
    stopRepository: vi.fn(() => Promise.resolve(undefined)),
    removeRepository: vi.fn(() => Promise.resolve(undefined)),
    dispose: vi.fn(() => Promise.resolve(undefined)),
    getRunnerIds: vi.fn(() => []),
    startRunners: vi.fn(),
    stopRunners: vi.fn(() => Promise.resolve(undefined)),
    getRunningCount: vi.fn(() => 0),
    getRunnerCount: vi.fn(() => 0),
    isRepositoryInitialized: vi.fn(() => false),
  };

  // Add all methods to match the interface exactly
  // biome-ignore lint/suspicious/noExplicitAny: Mock type casting
  return mockRunnerManager as any;
}

/**
 * Assert command success
 */
export function expectCommandSuccess(mocks: ReturnType<typeof setupCLIMocks>, exitCode = 0) {
  expect(mocks.mockExit).toHaveBeenCalledWith(exitCode);
  expect(mocks.mockConsoleError).not.toHaveBeenCalled();
}

/**
 * Assert command failure
 */
export function expectCommandFailure(
  mocks: ReturnType<typeof setupCLIMocks>,
  errorMessage?: string,
  exitCode = 1,
) {
  expect(mocks.mockExit).toHaveBeenCalledWith(exitCode);
  if (errorMessage) {
    expect(mocks.mockConsoleError).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  }
}

/**
 * Wait for async operations to complete
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
