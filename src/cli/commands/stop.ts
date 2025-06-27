import * as p from '@clack/prompts';
import { Command } from 'commander';
import * as path from 'path';
import color from 'picocolors';
import { ConfigLoader } from '../../lib/config/index.js';
import type { ManagerConfig } from '../../types/index.js';
import { listPidFiles, readPidFile, removePidFile } from '../../utils/fs-helpers.js';
import { getPidDir, PATHS, parseRepository } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import {
  createSpinner,
  logInfo,
  logSuccess,
  logWarning,
  withErrorHandling,
} from '../utils/index.js';

interface StopOptions {
  config?: string;
}

export const stopCommand = new Command('stop')
  .description('Stop runners (interactive)')
  .option('-c, --config <file>', 'Configuration file path')
  .action(
    withErrorHandling(async (options: StopOptions) => {
      console.clear();
      p.intro(color.cyan('GitHub Self-Hosted Runner CLI - Stop Runners'));

      const spinner = createSpinner();
      spinner.start('Loading configuration...');

      // Load configuration from file
      const configPath = options.config || PATHS.CONFIG_FILE;
      const configLoader = new ConfigLoader();

      let config: ManagerConfig;
      try {
        config = await configLoader.load(configPath);
      } catch (error) {
        spinner.stop();
        p.log.error(`Failed to load configuration: ${error}`);
        p.log.info(`Run 'gh-self-runner-cli init' to create a configuration file`);
        process.exit(1);
      }

      spinner.message('Checking runner status...');

      // Find all running processes by reading PID files
      const runningProcesses: Map<
        string,
        Array<{ pidFile: string; pid: number; runnerId: string }>
      > = new Map();
      let totalProcesses = 0;

      if (config.repositories && config.repositories.length > 0) {
        for (const repoString of config.repositories) {
          const repository = parseRepository(repoString);
          const repoKey = `${repository.owner}/${repository.repo}`;
          const pidDir = getPidDir(repository.owner, repository.repo);

          try {
            // List all PID files for this repository
            const pidFiles = await listPidFiles(pidDir);
            const processes = [];

            for (const pidFile of pidFiles) {
              const pidPath = path.join(pidDir, pidFile);
              const pid = await readPidFile(pidPath);

              if (pid !== null) {
                // Extract runner ID from filename (format: runner-xxxxx.pid)
                const runnerId = pidFile.replace('.pid', '');
                processes.push({ pidFile: pidPath, pid, runnerId });
              }
            }

            if (processes.length > 0) {
              runningProcesses.set(repoKey, processes);
              totalProcesses += processes.length;
            }
          } catch (error) {
            logger.error(`Failed to list processes for ${repoKey}:`, error as Error);
          }
        }
      }

      spinner.stop();

      if (totalProcesses === 0) {
        logWarning('No running runner processes found');
        p.outro(color.yellow('No runners to stop'));
        return;
      }

      logger.emptyLine();
      logInfo('Found running processes:');
      for (const [repoKey, processes] of runningProcesses.entries()) {
        logger.plain(`\n  ${color.bold(repoKey)}:`);
        for (const process of processes) {
          logger.plain(`    ${color.green('●')} ${process.runnerId} (PID: ${process.pid})`);
        }
      }

      logger.emptyLine();
      const confirmStop = await p.confirm({
        message: color.yellow(
          `Stop all ${totalProcesses} runner${totalProcesses !== 1 ? 's' : ''}?`,
        ),
        initialValue: true,
      });

      if (p.isCancel(confirmStop) || !confirmStop) {
        p.cancel('Stop cancelled');
        process.exit(0);
      }

      const stopSpinner = createSpinner();
      stopSpinner.start('Stopping runner processes...');

      let stoppedCount = 0;
      let failedCount = 0;

      // Stop all runner processes by sending signals
      for (const [_repoKey, processes] of runningProcesses.entries()) {
        for (const processInfo of processes) {
          try {
            // Try graceful shutdown first
            process.kill(processInfo.pid, 'SIGINT');

            // Wait a bit for graceful shutdown
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Check if process still exists
            try {
              process.kill(processInfo.pid, 0); // Signal 0 just checks if process exists
              // Process still running, try SIGTERM
              process.kill(processInfo.pid, 'SIGTERM');
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Check again
              try {
                process.kill(processInfo.pid, 0);
                // Still running, force kill
                process.kill(processInfo.pid, 'SIGKILL');
              } catch {
                // Process no longer exists, good
              }
            } catch {
              // Process no longer exists after SIGINT, good
            }

            // Remove PID file
            await removePidFile(processInfo.pidFile);
            stoppedCount++;
          } catch (error) {
            logger.error(`Failed to stop runner ${processInfo.runnerId}:`, error as Error);
            failedCount++;
          }
        }
      }

      // Wait a moment for GitHub to register the runners as offline
      stopSpinner.message('Waiting for runners to go offline...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      stopSpinner.stop();

      if (stoppedCount > 0) {
        logSuccess(
          `Stopped ${stoppedCount} runner process${stoppedCount !== 1 ? 'es' : ''} successfully`,
        );
      }
      if (failedCount > 0) {
        logWarning(`Failed to stop ${failedCount} runner process${failedCount !== 1 ? 'es' : ''}`);
      }

      logger.emptyLine();
      logInfo('All specified runner processes have been stopped.');
      logger.dim('  To start runners again:');
      logger.dim(`    ${color.white('gh-self-runner-cli start')}`);
      logger.dim('  To remove runners completely (including from GitHub):');
      logger.dim(`    ${color.white('gh-self-runner-cli clean')}`);

      p.outro(color.green('Done!'));
    }),
  );
