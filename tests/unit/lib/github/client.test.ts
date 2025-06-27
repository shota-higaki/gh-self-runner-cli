import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../../../../src/lib/github/client.js';

describe('GitHubClient', () => {
  let client: GitHubClient;
  // biome-ignore lint/suspicious/noExplicitAny: Mock type
  let mockOctokit: any;
  // biome-ignore lint/suspicious/noExplicitAny: Mock type
  let MockOctokit: any;

  beforeEach(async () => {
    // Create mock Octokit
    mockOctokit = {
      actions: {
        createRegistrationTokenForRepo: vi.fn(),
        createRemoveTokenForRepo: vi.fn(),
        listSelfHostedRunnersForRepo: vi.fn(),
        deleteSelfHostedRunnerFromRepo: vi.fn(),
        listRunnerApplicationsForRepo: vi.fn(),
      },
      repos: {
        get: vi.fn(),
      },
      request: vi.fn(),
    };

    MockOctokit = vi.fn(() => mockOctokit);

    // Mock the modules
    vi.doMock('@octokit/rest', () => ({
      Octokit: MockOctokit,
    }));

    vi.doMock('../../../../src/utils/logger.js', () => ({
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    // Import after mocking
    const { GitHubClient: Client } = await import('../../../../src/lib/github/client.js');
    client = new Client({ token: 'test-token' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateRepository', () => {
    it('should return true for valid repository', async () => {
      mockOctokit.repos.get.mockResolvedValue({
        data: { name: 'repo', owner: { login: 'test' } },
      });

      const isValid = await client.validateRepository({ owner: 'test', repo: 'repo' });

      expect(isValid).toBe(true);
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
      });
    });

    it('should return false for non-existent repository', async () => {
      mockOctokit.repos.get.mockRejectedValue({ status: 404 });

      const isValid = await client.validateRepository({ owner: 'test', repo: 'nonexistent' });

      expect(isValid).toBe(false);
    });

    it('should throw error for authentication failure', async () => {
      mockOctokit.repos.get.mockRejectedValue({ status: 401 });

      await expect(client.validateRepository({ owner: 'test', repo: 'repo' })).rejects.toThrowError(
        'Authentication failed',
      );
    });

    it('should throw error for permission denied', async () => {
      mockOctokit.repos.get.mockRejectedValue({ status: 403 });

      await expect(client.validateRepository({ owner: 'test', repo: 'repo' })).rejects.toThrowError(
        'Permission denied',
      );
    });
  });

  describe('getRunnerRegistrationToken', () => {
    const repo = { owner: 'test', repo: 'repo' };

    it('should return registration token', async () => {
      mockOctokit.actions.createRegistrationTokenForRepo.mockResolvedValue({
        data: { token: 'registration-token' },
      });

      const token = await client.getRunnerRegistrationToken(repo);

      expect(token).toBe('registration-token');
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
      });
    });

    it('should retry on retryable errors', async () => {
      const error = new Error('Network error');
      error.message = 'ECONNREFUSED';

      mockOctokit.actions.createRegistrationTokenForRepo
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { token: 'token-after-retry' } });

      const token = await client.getRunnerRegistrationToken(repo);

      expect(token).toBe('token-after-retry');
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const error = new Error('Network error');
      error.message = 'ECONNREFUSED';

      mockOctokit.actions.createRegistrationTokenForRepo.mockRejectedValue(error);

      await expect(client.getRunnerRegistrationToken(repo)).rejects.toThrowError('ECONNREFUSED');

      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(3); // Default retry count
    });
  });

  describe('getRunnerRemovalToken', () => {
    const repo = { owner: 'test', repo: 'repo' };

    it('should return removal token', async () => {
      mockOctokit.actions.createRemoveTokenForRepo.mockResolvedValue({
        data: { token: 'removal-token' },
      });

      const token = await client.getRunnerRemovalToken(repo);

      expect(token).toBe('removal-token');
      expect(mockOctokit.actions.createRemoveTokenForRepo).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
      });
    });
  });

  describe('listRunners', () => {
    const repo = { owner: 'test', repo: 'repo' };

    it('should return mapped runner list', async () => {
      mockOctokit.actions.listSelfHostedRunnersForRepo.mockResolvedValue({
        data: {
          runners: [
            {
              id: 1,
              name: 'runner-1',
              os: 'linux',
              status: 'online',
              labels: [{ name: 'self-hosted' }, { name: 'linux' }],
            },
            {
              id: 2,
              name: 'runner-2',
              os: 'windows',
              status: 'offline',
              labels: [{ name: 'self-hosted' }, { name: 'windows' }],
            },
          ],
        },
      });

      const runners = await client.listRunners(repo);

      expect(runners).toEqual([
        {
          id: 1,
          name: 'runner-1',
          os: 'linux',
          status: 'online',
          labels: ['self-hosted', 'linux'],
        },
        {
          id: 2,
          name: 'runner-2',
          os: 'windows',
          status: 'offline',
          labels: ['self-hosted', 'windows'],
        },
      ]);
    });

    it('should handle empty runner list', async () => {
      mockOctokit.actions.listSelfHostedRunnersForRepo.mockResolvedValue({
        data: { runners: [] },
      });

      const runners = await client.listRunners(repo);

      expect(runners).toEqual([]);
    });
  });

  describe('deleteRunner', () => {
    const repo = { owner: 'test', repo: 'repo' };
    const runnerId = 123;

    it('should delete runner successfully', async () => {
      mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockResolvedValue({});

      await client.deleteRunner(repo, runnerId);

      expect(mockOctokit.actions.deleteSelfHostedRunnerFromRepo).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        runner_id: 123,
      });
    });

    it('should handle deletion errors', async () => {
      mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockRejectedValue(
        new Error('Runner not found'),
      );

      await expect(client.deleteRunner(repo, runnerId)).rejects.toThrowError('Runner not found');
    });
  });

  describe('getRunnerDownloads', () => {
    const repo = { owner: 'test', repo: 'repo' };

    it('should return runner downloads', async () => {
      const mockDownloads = [
        {
          os: 'linux',
          architecture: 'x64',
          download_url: 'https://example.com/linux-x64',
          filename: 'actions-runner-linux-x64.tar.gz',
        },
        {
          os: 'win',
          architecture: 'x64',
          download_url: 'https://example.com/win-x64',
          filename: 'actions-runner-win-x64.zip',
        },
      ];

      mockOctokit.actions.listRunnerApplicationsForRepo.mockResolvedValue({
        data: mockDownloads,
      });

      const downloads = await client.getRunnerDownloads(repo);

      expect(downloads).toEqual(mockDownloads);
      expect(mockOctokit.actions.listRunnerApplicationsForRepo).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
      });
    });
  });

  describe('getRunnerDownloadUrl', () => {
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      Object.defineProperty(process, 'arch', { value: originalArch });
    });

    it('should return download URL for Linux x64', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      mockOctokit.actions.listRunnerApplicationsForRepo.mockResolvedValue({
        data: [
          {
            os: 'linux',
            architecture: 'x64',
            download_url: 'https://example.com/linux-x64',
            filename: 'actions-runner-linux-x64.tar.gz',
          },
          {
            os: 'linux',
            architecture: 'arm64',
            download_url: 'https://example.com/linux-arm64',
            filename: 'actions-runner-linux-arm64.tar.gz',
          },
        ],
      });

      const result = await client.getRunnerDownloadUrl();

      expect(result).toEqual({
        url: 'https://example.com/linux-x64',
        filename: 'actions-runner-linux-x64.tar.gz',
      });
    });

    it('should return download URL for macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });

      mockOctokit.actions.listRunnerApplicationsForRepo.mockResolvedValue({
        data: [
          {
            os: 'osx',
            architecture: 'arm64',
            download_url: 'https://example.com/osx-arm64',
            filename: 'actions-runner-osx-arm64.tar.gz',
          },
        ],
      });

      const result = await client.getRunnerDownloadUrl();

      expect(result).toEqual({
        url: 'https://example.com/osx-arm64',
        filename: 'actions-runner-osx-arm64.tar.gz',
      });
    });

    it('should return download URL for Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      mockOctokit.actions.listRunnerApplicationsForRepo.mockResolvedValue({
        data: [
          {
            os: 'win',
            architecture: 'x64',
            download_url: 'https://example.com/win-x64',
            filename: 'actions-runner-win-x64.zip',
          },
        ],
      });

      const result = await client.getRunnerDownloadUrl();

      expect(result).toEqual({
        url: 'https://example.com/win-x64',
        filename: 'actions-runner-win-x64.zip',
      });
    });

    it('should throw error if no matching runner found', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      mockOctokit.actions.listRunnerApplicationsForRepo.mockResolvedValue({
        data: [
          {
            os: 'win',
            architecture: 'x64',
            download_url: 'https://example.com/win-x64',
            filename: 'actions-runner-win-x64.zip',
          },
        ],
      });

      await expect(client.getRunnerDownloadUrl()).rejects.toThrowError(
        'No runner found for linux-x64',
      );
    });
  });

  describe('retry logic', () => {
    const repo = { owner: 'test', repo: 'repo' };

    it('should retry on 500 errors', async () => {
      const error = new Error('Server error');
      // @ts-expect-error Adding status to error
      error.status = 500;

      mockOctokit.actions.createRegistrationTokenForRepo
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { token: 'token-after-retry' } });

      const token = await client.getRunnerRegistrationToken(repo);

      expect(token).toBe('token-after-retry');
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 (rate limit) errors', async () => {
      const error = new Error('Rate limited');
      // @ts-expect-error Adding status to error
      error.status = 429;

      mockOctokit.actions.createRegistrationTokenForRepo
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { token: 'token-after-retry' } });

      const token = await client.getRunnerRegistrationToken(repo);

      expect(token).toBe('token-after-retry');
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 404 errors', async () => {
      mockOctokit.actions.createRegistrationTokenForRepo.mockRejectedValue({ status: 404 });

      await expect(client.getRunnerRegistrationToken(repo)).rejects.toEqual({ status: 404 });

      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(1);
    });

    it('should retry on timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.message = 'ETIMEDOUT';

      mockOctokit.actions.createRegistrationTokenForRepo
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ data: { token: 'token-after-retry' } });

      const token = await client.getRunnerRegistrationToken(repo);

      expect(token).toBe('token-after-retry');
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toHaveBeenCalledTimes(2);
    });
  });
});
