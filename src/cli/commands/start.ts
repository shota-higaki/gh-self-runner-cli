import * as p from '@clack/prompts';
import { Command } from 'commander';
import color from 'picocolors';
import { GitHubClient } from '../../lib/github/index.js';
import { RunnerManager } from '../../lib/runner/index.js';
import { cleanStalePidFiles, parseRepository } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import {
  createSpinner,
  displayRunnerStatus,
  getGitHubTokenFromConfig,
  loadConfigWithFallback,
  promptForRepository,
  promptForRunnerCount,
  withErrorHandling,
} from '../utils/index.js';

interface StartOptions {
  config?: string;
}

export const startCommand = new Command('start')
  .description('Start GitHub runners (interactive)')
  .option('-c, --config <file>', 'Configuration file path')
  .action(
    withErrorHandling(async (options: StartOptions) => {
      console.clear();
      p.intro(color.cyan('GitHub Self-Hosted Runner CLI - Start Runners'));

      const { config, isInteractive } = await loadConfigWithFallback(options);

      let runnerCount: number;
      if (isInteractive) {
        const repository = await promptForRepository();
        runnerCount = await promptForRunnerCount();

        const minimalConfig = {
          github: {},
          repositories: [`${repository.owner}/${repository.repo}`],
          runners: { parallel: runnerCount },
        };
        Object.assign(config || {}, minimalConfig);
      } else {
        const configuredCount = config?.runners?.parallel || 1;
        runnerCount = await promptForRunnerCount(
          `How many runners would you like to start? (default: ${configuredCount})`,
          String(configuredCount),
        );
      }

      const spinner = createSpinner();

      // First, clean up stale PID files
      spinner.start('Checking for existing runners...');
      const repositories = config?.repositories || [];
      if (repositories.length > 0) {
        const stalePidCount = await cleanStalePidFiles(repositories);
        if (stalePidCount > 0) {
          spinner.stop();
          logger.info(
            `Cleaned up ${stalePidCount} stale PID file${stalePidCount !== 1 ? 's' : ''}`,
          );
          spinner.start(runnerCount > 0 ? `Starting ${runnerCount} runners...` : 'Initializing...');
        }

        // Check if any runners are still running
        const { checkRunningProcesses } = await import('../../utils/process-helpers.js');
        const runningProcesses = await checkRunningProcesses(repositories);

        if (runningProcesses.totalCount > 0) {
          spinner.stop();
          logger.emptyLine();
          p.log.error('⚠️  Runners are already running!');

          // Show which repositories have running processes
          for (const [repo, count] of runningProcesses.byRepository.entries()) {
            logger.plain(
              `  ${color.yellow('●')} ${repo}: ${count} runner${count !== 1 ? 's' : ''} running`,
            );
          }

          logger.emptyLine();
          p.log.info('Please run one of the following commands first:');
          logger.plain(
            `  ${color.white('gh-self-runner-cli stop')}    ${color.dim('# Stop all runners')}`,
          );
          logger.plain(
            `  ${color.white('gh-self-runner-cli clean')}   ${color.dim('# Remove all runners')}`,
          );
          logger.emptyLine();
          p.outro(color.yellow('Cannot start new runners while others are running'));
          process.exit(1);
        }
      }

      spinner.message(runnerCount > 0 ? `Starting ${runnerCount} runners...` : 'Initializing...');
      const token = await getGitHubTokenFromConfig(config);

      const githubClient = new GitHubClient({ token });

      const runnerManager = new RunnerManager(githubClient);

      for (const repoString of config?.repositories || []) {
        const repository = parseRepository(repoString);

        await runnerManager.initializeRepository(repository, {
          labels: config?.runners?.labels,
        });

        if (runnerCount > 0) {
          await runnerManager.scale(repository, runnerCount);
        }
      }

      spinner.message('Checking runner status...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = runnerManager.getStatus();
      const allRunners = Object.values(status).flatMap((group) =>
        group.runners.map((r) => ({
          id: 0,
          name: `Runner ${r.id}`,
          status: r.status,
        })),
      );

      spinner.stop(
        runnerCount > 0
          ? `${runnerCount} runner(s) started successfully`
          : 'Ready (no runners started)',
      );

      if (allRunners.length > 0) {
        logger.emptyLine();
        displayRunnerStatus(allRunners, 'Runner Status:');
      }

      logger.emptyLine();
      p.note(
        `${color.dim('To stop all runners')}\n  ${color.white('gh-self-runner-cli stop')}`,
        'Next Steps',
      );

      p.outro(color.green('Runners started successfully!'));
      process.exit(0);
    }),
  );
