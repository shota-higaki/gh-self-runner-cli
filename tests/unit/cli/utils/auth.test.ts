import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @clack/prompts with proper namespace export
vi.mock('@clack/prompts', () => {
  const password = vi.fn();
  const confirm = vi.fn();
  const cancel = vi.fn();
  const isCancel = vi.fn();

  return {
    password,
    confirm,
    cancel,
    isCancel,
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    },
  };
});

// Mock dependencies
vi.mock('../../../../src/utils/index.js', () => ({
  isGitHubCLIInstalled: vi.fn(),
  checkGitHubAuth: vi.fn(),
  authenticateGitHub: vi.fn(),
  ensureGitHubToken: vi.fn(),
  getTokenType: vi.fn(),
  logger: {
    success: vi.fn(),
    dim: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    plain: vi.fn(),
    emptyLine: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/errors.js', () => ({
  authenticationError: vi.fn((msg) => new Error(msg)),
}));

vi.mock('picocolors', () => ({
  default: {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    dim: (str: string) => str,
    bold: (str: string) => str,
  },
}));

describe('auth utilities', () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    console.log = vi.fn();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    console.log = originalConsoleLog;
  });

  describe('getGitHubToken', () => {
    it('should return environment token if available', async () => {
      process.env.GITHUB_TOKEN = 'env-token-123';
      const utils = await import('../../../../src/utils/index.js');
      vi.mocked(utils.getTokenType).mockReturnValue('Personal Access Token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ silent: false });

      expect(result).toEqual({
        token: 'env-token-123',
        source: 'env',
      });
    });

    it('should use GitHub CLI when available and not skipped', async () => {
      const utils = await import('../../../../src/utils/index.js');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: true, user: 'testuser' });
      vi.mocked(utils.ensureGitHubToken).mockReturnValue('cli-token-123');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({});

      expect(result).toEqual({
        token: 'cli-token-123',
        source: 'cli',
        type: 'github-cli',
      });
    });

    it('should skip GitHub CLI when skipGitHubCLI is true', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.getTokenType).mockReturnValue('Personal Access Token');
      vi.mocked(prompts.password).mockResolvedValue('manual-token');
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ skipGitHubCLI: true, interactive: true });

      expect(result).toEqual({
        token: 'manual-token',
        source: 'prompt',
        type: 'personal-access-token',
      });
      expect(prompts.password).toHaveBeenCalled();
    });

    it('should handle GitHub CLI authentication failure', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      vi.mocked(utils.authenticateGitHub).mockReturnValue(false);
      vi.mocked(utils.getTokenType).mockReturnValue('Personal Access Token');
      vi.mocked(prompts.password).mockResolvedValue('manual-token');
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true });

      expect(result).toEqual({
        token: 'manual-token',
        source: 'prompt',
        type: 'personal-access-token',
      });
    });

    it('should offer GitHub CLI installation when offerCLI is true', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      // Mock the CLI auth flow
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: true, user: 'testuser' });
      vi.mocked(utils.ensureGitHubToken).mockReturnValue('cli-token-after-offer');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true, offerCLI: true });

      expect(result.token).toBe('cli-token-after-offer');
      expect(prompts.confirm).toHaveBeenCalled();
    });

    it('should handle cancellation', async () => {
      const prompts = await import('@clack/prompts');

      const cancelSymbol = Symbol('cancel');
      vi.mocked(prompts.password).mockResolvedValue(cancelSymbol);
      vi.mocked(prompts.isCancel).mockImplementation((value) => value === cancelSymbol);

      // The function actually calls process.exit(0) instead of throwing
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await expect(getGitHubToken({ interactive: true, skipGitHubCLI: true })).rejects.toThrow(
        'process.exit called',
      );

      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });

    it('should prompt for token when no other source available', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(false);
      vi.mocked(utils.getTokenType).mockReturnValue('Personal Access Token');
      vi.mocked(prompts.password).mockResolvedValue('prompted-token');
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: false });

      expect(result).toEqual({
        token: 'prompted-token',
        source: 'prompt',
        type: 'personal-access-token',
      });
    });
  });

  describe('getValidatedGitHubToken', () => {
    it('should return validated token', async () => {
      const utils = await import('../../../../src/utils/index.js');
      process.env.GITHUB_TOKEN = 'ghp_validtoken123456789012345678901234567890';
      vi.mocked(utils.getTokenType).mockReturnValue('Personal Access Token');

      const { getValidatedGitHubToken } = await import('../../../../src/cli/utils/auth');
      const token = await getValidatedGitHubToken();

      expect(token).toBe('ghp_validtoken123456789012345678901234567890');
    });

    it('should throw error for invalid token format', async () => {
      process.env.GITHUB_TOKEN = 'short';

      const { getValidatedGitHubToken } = await import('../../../../src/cli/utils/auth');
      await expect(getValidatedGitHubToken()).rejects.toThrow('Invalid token format');
    });
  });

  describe('promptForGitHubAuth validation', () => {
    it('should validate empty input', async () => {
      const prompts = await import('@clack/prompts');
      const _utils = await import('../../../../src/utils/index.js');

      let validateFn: (value: string) => string | undefined;
      vi.mocked(prompts.password).mockImplementation((options: any) => {
        validateFn = options.validate;
        return Promise.resolve('valid-token-after-retry');
      });
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await getGitHubToken({ skipGitHubCLI: true });

      // Test validation function
      expect(validateFn!('')).toBe('GitHub token is required');
      expect(validateFn!('short')).toBe('Token seems too short');
      expect(validateFn!('valid-token-123')).toBeUndefined();
    });
  });

  describe('validateTokenFormat edge cases', () => {
    it('should validate various token formats', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const _prompts = await import('@clack/prompts');

      const tokens = [
        { token: `ghp_${'a'.repeat(36)}`, valid: true }, // GitHub PAT
        { token: `ghs_${'a'.repeat(36)}`, valid: true }, // GitHub App
        { token: `gho_${'a'.repeat(36)}`, valid: true }, // GitHub OAuth
        { token: 'a'.repeat(40), valid: true }, // Legacy 40-char hex
        { token: `A1B2C3D4E5${'F'.repeat(30)}`, valid: true }, // Legacy hex uppercase
        { token: 'someValidToken_With-Dots.123', valid: true }, // Alphanumeric with special chars
        { token: 'short', valid: false }, // Too short
        { token: 'ghp_short', valid: false }, // GitHub token too short
        { token: 'invalid token with spaces', valid: false }, // Invalid characters
      ];

      for (const { token, valid } of tokens) {
        process.env.GITHUB_TOKEN = token;
        vi.mocked(utils.getTokenType).mockReturnValue('Test Token');

        const { getValidatedGitHubToken } = await import('../../../../src/cli/utils/auth');

        if (valid) {
          await expect(getValidatedGitHubToken()).resolves.toBe(token);
        } else {
          await expect(getValidatedGitHubToken()).rejects.toThrow('Invalid token format');
        }

        delete process.env.GITHUB_TOKEN;
      }
    });
  });

  describe('GitHub CLI authentication flow', () => {
    it('should authenticate GitHub CLI when not authenticated', async () => {
      const utils = await import('../../../../src/utils/index.js');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      vi.mocked(utils.authenticateGitHub).mockReturnValue(true);
      vi.mocked(utils.ensureGitHubToken).mockReturnValue('new-cli-token');
      vi.mocked(utils.getTokenType).mockReturnValue('GitHub CLI Token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({});

      expect(utils.authenticateGitHub).toHaveBeenCalled();
      expect(result.token).toBe('new-cli-token');
    });

    it('should handle GitHub CLI token retrieval failure', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: true });
      vi.mocked(utils.ensureGitHubToken).mockReturnValue(null);
      vi.mocked(prompts.password).mockResolvedValue('fallback-token');
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({});

      expect(result.source).toBe('prompt');
      expect(result.token).toBe('fallback-token');
    });
  });

  describe('offerGitHubCLIAuth edge cases', () => {
    it('should handle user declining GitHub CLI offer', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: true, user: 'testuser' });
      vi.mocked(prompts.confirm).mockResolvedValue(false);
      vi.mocked(prompts.isCancel).mockReturnValue(false);
      vi.mocked(prompts.password).mockResolvedValue('manual-token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true, offerCLI: true });

      expect(result.source).toBe('prompt');
    });

    it('should handle GitHub CLI auth launch failure', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      vi.mocked(prompts.isCancel).mockReturnValue(false);
      vi.mocked(utils.authenticateGitHub).mockReturnValue(false);
      vi.mocked(prompts.password).mockResolvedValue('fallback-token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true, offerCLI: true });

      expect(prompts.log.error).toHaveBeenCalledWith('GitHub CLI authentication failed');
      expect(result.source).toBe('prompt');
    });

    it('should handle GitHub CLI token retrieval failure after auth', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      vi.mocked(prompts.isCancel).mockReturnValue(false);
      vi.mocked(utils.authenticateGitHub).mockReturnValue(true);
      vi.mocked(utils.ensureGitHubToken).mockReturnValue(null);
      vi.mocked(prompts.password).mockResolvedValue('fallback-token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true, offerCLI: true });

      expect(prompts.log.warn).toHaveBeenCalledWith('Failed to retrieve token from GitHub CLI');
      expect(result.source).toBe('prompt');
    });

    it('should handle cancellation during GitHub CLI offer', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      const cancelSymbol = Symbol('cancel');
      vi.mocked(prompts.confirm).mockResolvedValue(cancelSymbol);
      vi.mocked(prompts.isCancel).mockImplementation((value) => value === cancelSymbol);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await expect(getGitHubToken({ interactive: true, offerCLI: true })).rejects.toThrow(
        'process.exit called',
      );

      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });
  });

  describe('silent mode', () => {
    it('should not log when silent is true', async () => {
      const utils = await import('../../../../src/utils/index.js');
      process.env.GITHUB_TOKEN = 'ghp_silenttoken123456789012345678901234567890';

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await getGitHubToken({ silent: true });

      expect(utils.logger.success).not.toHaveBeenCalled();
      expect(utils.logger.dim).not.toHaveBeenCalled();
    });

    it('should not log GitHub CLI warnings when silent', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth).mockReturnValue({ isAuthenticated: false });
      vi.mocked(utils.authenticateGitHub).mockReturnValue(false);
      vi.mocked(prompts.password).mockResolvedValue('fallback-token');
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await getGitHubToken({ silent: true });

      expect(utils.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('offerGitHubCLIAuth with authenticated user', () => {
    it('should show username when authenticated', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth)
        .mockReturnValueOnce({ isAuthenticated: true, user: 'existinguser' })
        .mockReturnValueOnce({ isAuthenticated: true, user: 'existinguser' });
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      vi.mocked(prompts.isCancel).mockReturnValue(false);
      vi.mocked(utils.ensureGitHubToken).mockReturnValue('existing-user-token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      const result = await getGitHubToken({ interactive: true, offerCLI: true });

      expect(prompts.confirm).toHaveBeenCalledWith({
        message: 'GitHub CLI authenticated as @existinguser. Use this authentication?',
        initialValue: true,
      });
      expect(result.token).toBe('existing-user-token');
    });

    it('should handle token retrieval without username', async () => {
      const utils = await import('../../../../src/utils/index.js');
      const prompts = await import('@clack/prompts');

      vi.mocked(utils.isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(utils.checkGitHubAuth)
        .mockReturnValueOnce({ isAuthenticated: true })
        .mockReturnValueOnce({ isAuthenticated: true }); // No user property
      vi.mocked(prompts.confirm).mockResolvedValue(true);
      vi.mocked(prompts.isCancel).mockReturnValue(false);
      vi.mocked(utils.ensureGitHubToken).mockReturnValue('no-username-token');
      vi.mocked(utils.getTokenType).mockReturnValue('GitHub Token');

      const { getGitHubToken } = await import('../../../../src/cli/utils/auth');
      await getGitHubToken({ interactive: true, offerCLI: true });

      expect(prompts.log.success).toHaveBeenCalledWith('GitHub token retrieved successfully');
      expect(console.log).toHaveBeenCalledWith('  Using: GitHub Token');
    });
  });
});
