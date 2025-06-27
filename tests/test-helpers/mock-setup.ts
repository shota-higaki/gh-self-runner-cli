import { vi } from 'vitest';
import * as cliUtils from '../../src/cli/utils';

// Create a custom mock for withErrorHandling that properly wraps command handlers
export function setupCliUtilsMocks() {
  // Create mocked functions
  const mocks = {
    withErrorHandling: vi.fn((fn) => fn),
    loadConfigWithFallback: vi.fn(),
    getGitHubTokenFromConfig: vi.fn(),
    promptForRepository: vi.fn(),
    promptForRunnerCount: vi.fn(),
    getValidatedGitHubToken: vi.fn(),
    createSpinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    })),
    displayRunnerStatus: vi.fn(),
    getRunnerStatusDisplay: vi.fn(),
    logSuccess: vi.fn(),
    logWarning: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    checkCancel: vi.fn(),
    detectConfigFile: vi.fn(),
    getGitHubToken: vi.fn(),
    handleCancel: vi.fn(),
    loadConfigurationInteractive: vi.fn(),
  };

  // Apply mocks
  Object.entries(mocks).forEach(([key, mockFn]) => {
    if (key in cliUtils) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment
      (cliUtils as any)[key] = mockFn;
    }
  });

  return mocks;
}
