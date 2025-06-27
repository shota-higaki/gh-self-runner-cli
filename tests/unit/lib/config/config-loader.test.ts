import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('cosmiconfig', () => ({
  cosmiconfig: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../../../src/utils/github-cli.js', () => ({
  isGitHubCLIInstalled: vi.fn(),
}));

import { execSync } from 'child_process';
import { cosmiconfig } from 'cosmiconfig';
import { ConfigLoader } from '../../../../src/lib/config/config-loader.js';
import { isGitHubCLIInstalled } from '../../../../src/utils/github-cli.js';

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  let mockExplorer: {
    search: any;
    load: any;
  };

  beforeEach(() => {
    mockExplorer = {
      search: vi.fn(),
      load: vi.fn(),
    };
    vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);
    configLoader = new ConfigLoader();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('should load configuration from file', async () => {
      const mockConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
        logging: { level: 'info' },
      };

      mockExplorer.load.mockResolvedValue({
        config: mockConfig,
        filepath: '/path/to/config.yml',
      });

      const result = await configLoader.load('/path/to/config.yml');

      expect(mockExplorer.load).toHaveBeenCalledWith('/path/to/config.yml');
      expect(result).toEqual(mockConfig);
    });

    it('should search for configuration when no path provided', async () => {
      const mockConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
        logging: { level: 'info' },
      };

      mockExplorer.search.mockResolvedValue({
        config: mockConfig,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(mockExplorer.search).toHaveBeenCalled();
      expect(result).toEqual(mockConfig);
    });

    it('should throw error when no configuration found', async () => {
      mockExplorer.search.mockResolvedValue(null);

      await expect(configLoader.load()).rejects.toThrowError('Configuration file not found');
    });

    it('should process environment variables', async () => {
      const mockConfig = {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing env var substitution
        github: { token: '${GITHUB_TOKEN}' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
      };

      process.env.GITHUB_TOKEN = 'env-token';

      mockExplorer.search.mockResolvedValue({
        config: mockConfig,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(result.github.token).toBe('env-token');

      delete process.env.GITHUB_TOKEN;
    });

    it('should use GitHub CLI token as fallback', async () => {
      const mockConfig = {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing env var substitution
        github: { token: '${GITHUB_TOKEN}' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
      };

      delete process.env.GITHUB_TOKEN;
      vi.mocked(isGitHubCLIInstalled).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('cli-token\n');

      mockExplorer.search.mockResolvedValue({
        config: mockConfig,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(result.github.token).toBe('cli-token');
      expect(execSync).toHaveBeenCalledWith('gh auth token', { encoding: 'utf-8', stdio: 'pipe' });
    });

    it('should throw error for missing environment variable', async () => {
      const mockConfig = {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing env var substitution
        github: { token: '${MISSING_VAR}' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
      };

      delete process.env.MISSING_VAR;
      vi.mocked(isGitHubCLIInstalled).mockReturnValue(false);

      mockExplorer.search.mockResolvedValue({
        config: mockConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError(
        'Environment variable MISSING_VAR is not set',
      );
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', async () => {
      const validConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
        logging: { level: 'info' },
      };

      mockExplorer.search.mockResolvedValue({
        config: validConfig,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(result).toEqual(validConfig);
    });

    it('should throw error for invalid github config', async () => {
      const invalidConfig = {
        github: 'not-an-object',
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should throw error for missing repositories', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        runners: { parallel: 2 },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should throw error for empty repositories', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        repositories: [],
        runners: { parallel: 2 },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should throw error for invalid runner config', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: 'not-an-object',
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should throw error for negative parallel runners', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: -1 },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should set default parallel value if not provided', async () => {
      const configWithoutParallel = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: {},
      };

      mockExplorer.search.mockResolvedValue({
        config: configWithoutParallel,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(result.runners.parallel).toBe(1);
    });

    it('should validate runner labels', async () => {
      const configWithLabels = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: {
          parallel: 2,
          labels: ['self-hosted', 'linux'],
        },
      };

      mockExplorer.search.mockResolvedValue({
        config: configWithLabels,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();

      expect(result.runners.labels).toEqual(['self-hosted', 'linux']);
    });

    it('should throw error for invalid labels', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: {
          parallel: 2,
          labels: 'not-an-array',
        },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should throw error for invalid logging level', async () => {
      const invalidConfig = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: 2 },
        logging: { level: 'invalid-level' },
      };

      mockExplorer.search.mockResolvedValue({
        config: invalidConfig,
        filepath: '.github-runners.yml',
      });

      await expect(configLoader.load()).rejects.toThrowError('Invalid configuration');
    });

    it('should accept valid logging levels', async () => {
      const validLevels = ['error', 'warn', 'info', 'debug'];

      for (const level of validLevels) {
        const config = {
          github: { token: 'test-token' },
          repositories: ['owner/repo'],
          runners: { parallel: 1 },
          logging: { level },
        };

        mockExplorer.search.mockResolvedValue({
          config,
          filepath: '.github-runners.yml',
        });

        const result = await configLoader.load();
        expect(result.logging.level).toBe(level);
      }
    });

    it('should handle null github config', async () => {
      const configWithNullGithub = {
        github: null,
        repositories: ['owner/repo'],
        runners: { parallel: 1 },
      };

      mockExplorer.search.mockResolvedValue({
        config: configWithNullGithub,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();
      expect(result.github).toBe(null);
    });

    it('should handle configuration without logging', async () => {
      const configWithoutLogging = {
        github: { token: 'test-token' },
        repositories: ['owner/repo'],
        runners: { parallel: 1 },
      };

      mockExplorer.search.mockResolvedValue({
        config: configWithoutLogging,
        filepath: '.github-runners.yml',
      });

      const result = await configLoader.load();
      expect(result.logging).toBeUndefined();
    });
  });

  describe('cosmiconfig integration', () => {
    it('should configure cosmiconfig with correct search places', () => {
      expect(cosmiconfig).toHaveBeenCalledWith('github-runners', {
        searchPlaces: expect.arrayContaining([
          '.github/self-hosted-runners/config.yml',
          '.github-runners.yml',
        ]),
        loaders: expect.objectContaining({
          '.yml': expect.any(Function),
          '.yaml': expect.any(Function),
        }),
      });
    });
  });
});
