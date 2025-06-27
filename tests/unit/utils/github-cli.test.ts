import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    dim: vi.fn(),
    emptyLine: vi.fn(),
  },
}));

import { execSync } from 'child_process';
import {
  authenticateGitHub,
  checkGitHubAuth,
  ensureGitHubToken,
  isGitHubCLIInstalled,
} from '../../../src/utils/github-cli.js';

describe('github-cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('isGitHubCLIInstalled', () => {
    it('should return true if GitHub CLI is installed', () => {
      vi.mocked(execSync).mockReturnValue('/usr/local/bin/gh' as any);

      const result = isGitHubCLIInstalled();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('which gh', { encoding: 'utf8' });
    });

    it('should return true on Windows if GitHub CLI is installed', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          throw new Error('Command not found');
        }
        return 'C:\\Program Files\\GitHub CLI\\gh.exe' as any;
      });

      const result = isGitHubCLIInstalled();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('where gh', { encoding: 'utf8' });
    });

    it('should return false if GitHub CLI is not installed', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = isGitHubCLIInstalled();

      expect(result).toBe(false);
    });
  });

  describe('checkGitHubAuth', () => {
    it('should return authenticated status with user', () => {
      vi.mocked(execSync).mockReturnValue(
        `
        github.com
          ✓ Logged in to github.com as testuser (oauth_token)
          ✓ Git operations for github.com configured to use https protocol.
          ✓ Token: gho_************************************
          ✓ Token scopes: gist, read:org, repo, workflow
      ` as any,
      );

      const result = checkGitHubAuth();

      expect(result).toEqual({
        isAuthenticated: true,
        user: 'testuser',
      });
      expect(execSync).toHaveBeenCalledWith('gh auth status', {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    });

    it('should return not authenticated when not logged in', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('You are not logged into any GitHub hosts');
      });

      const result = checkGitHubAuth();

      expect(result).toEqual({
        isAuthenticated: false,
      });
    });

    it('should handle different auth status format', () => {
      vi.mocked(execSync).mockReturnValue(
        `
        Logged in to github.com as another-user
      ` as any,
      );

      const result = checkGitHubAuth();

      expect(result).toEqual({
        isAuthenticated: true,
        user: 'another-user',
      });
    });
  });

  describe('authenticateGitHub', () => {
    it('should return true when authentication succeeds', () => {
      vi.mocked(execSync).mockReturnValue('');

      const result = authenticateGitHub();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('gh auth login --web --scopes repo,workflow', {
        stdio: 'inherit',
      });
    });

    it('should return false when authentication fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Authentication failed');
      });

      const result = authenticateGitHub();

      expect(result).toBe(false);
    });
  });

  describe('ensureGitHubToken', () => {
    it('should return token when CLI is installed and authenticated', () => {
      // Mock isGitHubCLIInstalled
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status') {
          return 'Logged in to github.com as user' as any;
        }
        if (cmd === 'gh auth token') {
          return 'ghp_testtoken123\n' as any;
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe('ghp_testtoken123');
    });

    it('should return null when CLI is not installed', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = ensureGitHubToken();

      expect(result).toBe(null);
    });

    it('should authenticate and return token when not authenticated', () => {
      let authCalled = false;
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status' && !authCalled) {
          throw new Error('Not authenticated');
        }
        if (cmd === 'gh auth login --web --scopes repo,workflow') {
          authCalled = true;
          return '' as any;
        }
        if (cmd === 'gh auth status' && authCalled) {
          return 'Logged in to github.com' as any;
        }
        if (cmd === 'gh auth token') {
          return 'ghp_newtoken456\n' as any;
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe('ghp_newtoken456');
    });

    it('should return null when authentication fails', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status') {
          throw new Error('Not authenticated');
        }
        if (cmd === 'gh auth login --web --scopes repo,workflow') {
          throw new Error('Authentication failed');
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe(null);
    });

    it('should return null when token retrieval fails', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status') {
          return 'Logged in to github.com' as any;
        }
        if (cmd === 'gh auth token') {
          throw new Error('Failed to get token');
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe(null);
    });

    it('should trim the token output', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status') {
          return 'Logged in to github.com' as any;
        }
        if (cmd === 'gh auth token') {
          return '  ghp_tokenwitspaces  \n\n' as any;
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe('ghp_tokenwitspaces');
    });

    it('should return null for empty token', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') {
          return '/usr/local/bin/gh' as any;
        }
        if (cmd === 'gh auth status') {
          return 'Logged in to github.com' as any;
        }
        if (cmd === 'gh auth token') {
          return '\n' as any;
        }
        return '' as any;
      });

      const result = ensureGitHubToken();

      expect(result).toBe(null);
    });
  });
});
