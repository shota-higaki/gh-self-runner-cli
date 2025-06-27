import { vi } from 'vitest';

// Create a properly typed mock factory for cli utils
export function createMockCliUtils() {
  const mockSpinner = {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  };

  return {
    withErrorHandling: vi.fn((fn) => fn), // Pass through the function without error handling
    loadConfigWithFallback: vi.fn(),
    getGitHubTokenFromConfig: vi.fn(),
    promptForRepository: vi.fn(),
    promptForRunnerCount: vi.fn(),
    createSpinner: vi.fn(() => mockSpinner),
    displayRunnerStatus: vi.fn(),
    getRunnerStatusDisplay: vi.fn(),
    logSuccess: vi.fn(),
    logWarning: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    checkCancel: vi.fn(),
    handleCancel: vi.fn(),
    detectConfigFile: vi.fn(),
    getGitHubToken: vi.fn(),
    getValidatedGitHubToken: vi.fn(),
    loadConfigurationInteractive: vi.fn(),
  };
}
