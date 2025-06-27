import * as p from '@clack/prompts';
import { Command } from 'commander';
import * as path from 'path';
import color from 'picocolors';
import { ConfigLoader } from '../../lib/config/index.js';
import { GitHubClient } from '../../lib/github/index.js';
import type { ManagerConfig } from '../../types/index.js';
import { listPidFiles, readPidFile } from '../../utils/fs-helpers.js';
import { getPidDir, isProcessRunning, PATHS, parseRepository } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import {
  createSpinner,
  getGitHubTokenFromConfig,
  logInfo,
  logSuccess,
  logWarning,
  withErrorHandling,
} from '../utils/index.js';

interface StatusOptions {
  config?: string;
}

interface LocalRunnerState {
  repository: string;
  runnerId: string;
  pid: number | null;
  pidFile: string;
  isRunning: boolean;
  isGhost: boolean;
  githubStatus?: 'active' | 'idle' | 'offline';
}

export const statusCommand = new Command('status')
  .description('Show status of all runners')
  .option('-c, --config <file>', 'Configuration file path')
  .action(
    withErrorHandling(async (options: StatusOptions) => {
      console.clear();
      p.intro(color.cyan('GitHub Self-Hosted Runner CLI - Runner Status'));

      const spinner = createSpinner();
      spinner.start('Checking runner status...');

      // Try to load configuration
      let config: ManagerConfig | null = null;
      let repositories: string[] = [];

      try {
        const configLoader = new ConfigLoader();
        config = await configLoader.load(options.config || PATHS.CONFIG_FILE);
        repositories = config.repositories || [];
      } catch {
        // If no config, try to find repositories from directory structure
        try {
          const runnersDir = path.join(PATHS.BASE_DIR, 'runners');
          const fs = await import('fs/promises');
          const entries = await fs.readdir(runnersDir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory() && entry.name.includes('-')) {
              const lastHyphenIndex = entry.name.lastIndexOf('-');
              if (lastHyphenIndex > 0) {
                const owner = entry.name.substring(0, lastHyphenIndex);
                const repo = entry.name.substring(lastHyphenIndex + 1);
                repositories.push(`${owner}/${repo}`);
              }
            }
          }
        } catch {
          // No runners directory
        }
      }

      if (repositories.length === 0) {
        spinner.stop();
        logWarning('No repositories configured or found');
        p.outro(color.yellow('No runners to check'));
        return;
      }

      // Get GitHub client if token is available
      let githubClient: GitHubClient | null = null;
      try {
        const token = await getGitHubTokenFromConfig(config);
        githubClient = new GitHubClient({ token });
      } catch {
        // GitHub client is optional for status
      }

      // Collect runner status from PID files
      const runnerStatuses: LocalRunnerState[] = [];

      for (const repoString of repositories) {
        const repository = parseRepository(repoString);
        const repoKey = `${repository.owner}/${repository.repo}`;
        const pidDir = getPidDir(repository.owner, repository.repo);

        try {
          const pidFiles = await listPidFiles(pidDir);

          for (const pidFile of pidFiles) {
            const pidPath = path.join(pidDir, pidFile);
            const pid = await readPidFile(pidPath);
            const runnerId = pidFile.replace('.pid', '');

            const status: LocalRunnerState = {
              repository: repoKey,
              runnerId,
              pid,
              pidFile: pidPath,
              isRunning: false,
              isGhost: false,
            };

            if (pid !== null) {
              status.isRunning = isProcessRunning(pid);
              status.isGhost = !status.isRunning;
            }

            runnerStatuses.push(status);
          }
        } catch {
          // No PID files for this repository
        }
      }

      // Get GitHub status if available
      if (githubClient) {
        spinner.message('Fetching runner status from GitHub...');

        for (const repoString of repositories) {
          try {
            const repository = parseRepository(repoString);
            const runners = await githubClient.listRunners(repository);

            // Match GitHub runners with local status
            for (const runner of runners) {
              // Runner name format: {repo}-{runnerId}
              // We need to match based on the full runner name
              const localStatus = runnerStatuses.find(
                (s) =>
                  s.repository === `${repository.owner}/${repository.repo}` &&
                  runner.name === `${repository.repo}-${s.runnerId}`,
              );

              if (localStatus) {
                localStatus.githubStatus = runner.status;
              }
            }
          } catch {
            // Ignore GitHub API errors
          }
        }
      }

      spinner.stop();

      if (runnerStatuses.length === 0) {
        logInfo('No runners found');
        p.outro(color.dim('Run "gh-self-runner-cli start" to start runners'));
        return;
      }

      // Group by repository
      const statusByRepo = new Map<string, LocalRunnerState[]>();
      for (const status of runnerStatuses) {
        const existing = statusByRepo.get(status.repository) || [];
        existing.push(status);
        statusByRepo.set(status.repository, existing);
      }

      // Display status
      logger.emptyLine();
      logInfo('Runner Status:');
      logger.emptyLine();

      let totalRunning = 0;
      let totalGhost = 0;

      for (const [repo, statuses] of statusByRepo.entries()) {
        logger.plain(`  ${color.bold(repo)}:`);

        for (const status of statuses) {
          let indicator = '';
          let statusText = '';
          let details = '';

          if (status.isGhost) {
            indicator = color.red('✗');
            statusText = color.red('GHOST');
            details = color.dim('(PID file found but process is dead)');
            totalGhost++;
          } else if (status.isRunning) {
            indicator = color.green('●');
            statusText = color.green('RUNNING');
            details = color.dim(`(PID: ${status.pid})`);
            totalRunning++;

            if (status.githubStatus) {
              if (status.githubStatus === 'active') {
                details += ` ${color.yellow('[ACTIVE]')}`;
              } else if (status.githubStatus === 'idle') {
                details += ` ${color.green('[IDLE]')}`;
              }
            }
          } else {
            indicator = color.gray('○');
            statusText = color.gray('STOPPED');
            details = color.dim('(No process)');
          }

          logger.plain(`    ${indicator} ${statusText} - ${status.runnerId} ${details}`);
        }

        logger.emptyLine();
      }

      // Summary
      const summary: string[] = [];
      if (totalRunning > 0) {
        summary.push(color.green(`${totalRunning} running`));
      }
      if (totalGhost > 0) {
        summary.push(color.red(`${totalGhost} ghost`));
      }
      const totalStopped = runnerStatuses.length - totalRunning - totalGhost;
      if (totalStopped > 0) {
        summary.push(color.gray(`${totalStopped} stopped`));
      }

      logSuccess(`Total: ${runnerStatuses.length} runner(s) (${summary.join(', ')})`);

      if (totalGhost > 0) {
        logger.emptyLine();
        logWarning('Ghost runners detected!');
        logger.dim('  Ghost runners have PID files but no running process.');
        logger.dim('  Run "gh-self-runner-cli clean" to clean them up.');
      }

      logger.emptyLine();
      p.note(
        `${color.dim('Commands:')}
  ${color.white('gh-self-runner-cli start')}  ${color.dim('# Start runners')}
  ${color.white('gh-self-runner-cli stop')}   ${color.dim('# Stop runners')}
  ${color.white('gh-self-runner-cli clean')}  ${color.dim('# Clean all runners')}`,
        'Next Steps',
      );

      p.outro(color.green('Done!'));
    }),
  );
