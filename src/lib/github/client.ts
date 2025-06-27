import { Octokit } from '@octokit/rest';
import type { GitHubConfig, Repository, Runner } from '../../types';
import { logger } from '../../utils/index.js';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
}

export class GitHubClient {
  private octokit: Octokit;
  private defaultRetryOptions: Required<RetryOptions> = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
  };

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl,
    });
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: RetryOptions,
  ): Promise<T> {
    const { maxRetries, retryDelay, backoffMultiplier } = {
      ...this.defaultRetryOptions,
      ...options,
    };

    let lastError: Error | undefined;
    let delay = retryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          logger.warn(
            `${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
            { error: (error as Error).message },
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= backoffMultiplier;
        }
      }
    }

    logger.error(`${operationName} failed after ${maxRetries} attempts`);
    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ENETUNREACH')
    ) {
      return true;
    }

    const errorWithStatus = error as Error & { status?: number };
    if (errorWithStatus.status) {
      return (
        errorWithStatus.status >= 500 ||
        errorWithStatus.status === 429 ||
        errorWithStatus.status === 408
      );
    }

    return false;
  }

  async getRunnerRegistrationToken(repo: Repository): Promise<string> {
    return this.retryOperation(async () => {
      const response = await this.octokit.actions.createRegistrationTokenForRepo({
        owner: repo.owner,
        repo: repo.repo,
      });
      return response.data.token;
    }, `getRunnerRegistrationToken for ${repo.owner}/${repo.repo}`);
  }

  async getRunnerRemovalToken(repo: Repository): Promise<string> {
    return this.retryOperation(async () => {
      const response = await this.octokit.actions.createRemoveTokenForRepo({
        owner: repo.owner,
        repo: repo.repo,
      });
      return response.data.token;
    }, `getRunnerRemovalToken for ${repo.owner}/${repo.repo}`);
  }

  async listRunners(repo: Repository): Promise<Runner[]> {
    return this.retryOperation(async () => {
      const response = await this.octokit.actions.listSelfHostedRunnersForRepo({
        owner: repo.owner,
        repo: repo.repo,
        per_page: 100,
      });

      return response.data.runners.map((runner) => ({
        id: runner.id,
        name: runner.name,
        os: runner.os,
        status: runner.status as Runner['status'],
        labels: runner.labels.map((label) => label.name),
      }));
    }, `listRunners for ${repo.owner}/${repo.repo}`);
  }

  async deleteRunner(repo: Repository, runnerId: number): Promise<void> {
    return this.retryOperation(async () => {
      await this.octokit.actions.deleteSelfHostedRunnerFromRepo({
        owner: repo.owner,
        repo: repo.repo,
        runner_id: runnerId,
      });
    }, `deleteRunner ${runnerId} for ${repo.owner}/${repo.repo}`);
  }

  async getRunnerDownloads(repo: Repository): Promise<
    Array<{
      os: string;
      architecture: string;
      download_url: string;
      filename: string;
      sha256_checksum?: string;
    }>
  > {
    return this.retryOperation(async () => {
      const response = await this.octokit.actions.listRunnerApplicationsForRepo({
        owner: repo.owner,
        repo: repo.repo,
      });
      return response.data;
    }, `getRunnerDownloads for ${repo.owner}/${repo.repo}`);
  }

  async getRunnerDownloadUrl(): Promise<{ url: string; filename: string }> {
    return this.retryOperation(async () => {
      const response = await this.octokit.actions.listRunnerApplicationsForRepo({
        owner: 'actions',
        repo: 'runner',
      });

      const platform = process.platform;
      const arch = process.arch;

      let osFilter: string;
      if (platform === 'darwin') {
        osFilter = 'osx';
      } else if (platform === 'win32') {
        osFilter = 'win';
      } else {
        osFilter = 'linux';
      }

      const archFilter = arch === 'arm64' ? 'arm64' : 'x64';

      const runner = response.data.find(
        (app) => app.os === osFilter && app.architecture === archFilter,
      );

      if (!runner) {
        throw new Error(`No runner found for ${platform}-${arch}`);
      }

      return {
        url: runner.download_url,
        filename: runner.filename,
      };
    }, 'getRunnerDownloadUrl');
  }

  async validateRepository(repo: Repository): Promise<boolean> {
    return this.retryOperation(async () => {
      try {
        await this.octokit.repos.get({
          owner: repo.owner,
          repo: repo.repo,
        });
        return true;
      } catch (error) {
        const errorWithStatus = error as Error & { status?: number; message?: string };

        if (errorWithStatus.status === 404) {
          return false;
        }

        if (errorWithStatus.status === 401) {
          logger.error('Authentication failed. The GitHub token may be invalid or expired.');
          throw new Error('Authentication failed. Please check your GitHub token.');
        }

        if (errorWithStatus.status === 403) {
          logger.error('Permission denied. The token may not have the required scopes.');
          throw new Error('Permission denied. Ensure your token has "repo" scope.');
        }

        throw error;
      }
    }, `validateRepository ${repo.owner}/${repo.repo}`);
  }
}
