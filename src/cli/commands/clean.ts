import * as p from '@clack/prompts';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import color from 'picocolors';
import { ConfigLoader } from '../../lib/config/index.js';
import { GitHubClient } from '../../lib/github/index.js';
import type { ManagerConfig } from '../../types/index.js';
import { fileExists } from '../../utils/fs-helpers.js';
import { PATHS, parseRepository, stopAllProcesses } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import {
  checkCancel,
  createSpinner,
  getGitHubTokenFromConfig,
  logSuccess,
  logWarning,
  withErrorHandling,
} from '../utils/index.js';

interface CleanOptions {
  config?: string;
}

export const cleanCommand = new Command('clean')
  .description('Clean up all configured runners')
  .option('-c, --config <file>', 'Configuration file path')
  .action(
    withErrorHandling(async (options: CleanOptions) => {
      console.clear();
      p.intro(color.cyan('GitHub Self-Hosted Runner CLI - Clean Runners'));

      // Try to load configuration but don't fail if not found
      let config: ManagerConfig | null = null;
      // let _configPath: string | null = null;

      const configLoader = new ConfigLoader();
      try {
        const result = await configLoader.load(options.config || PATHS.CONFIG_FILE);
        if (result) {
          config = result;
          // _configPath = options.config || PATHS.CONFIG_FILE;
          logSuccess('Found configuration file');
        }
      } catch {
        logWarning('No configuration file found');

        // Check if runners directory exists
        const runnersExists = await fileExists(path.join(PATHS.BASE_DIR, 'runners'));
        if (!runnersExists) {
          logWarning('No runners directory found. Nothing to clean.');
          return;
        }
      }

      // Get token for GitHub API access (optional for clean)
      let token: string | undefined;
      try {
        token = await getGitHubTokenFromConfig(config, {
          skipGitHubCLI: false,
          silent: false,
        });
      } catch {
        // Token is optional for clean command
      }

      // Find all runner directories
      const runnersDir = path.join(PATHS.BASE_DIR, 'runners');
      const runnerDirs: string[] = [];

      try {
        const entries = await fs.readdir(runnersDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const repoRunnerDir = path.join(runnersDir, entry.name);
            const subEntries = await fs.readdir(repoRunnerDir, { withFileTypes: true });

            for (const subEntry of subEntries) {
              if (subEntry.isDirectory()) {
                // Check if it's a valid runner directory
                if (subEntry.name.startsWith('runner-')) {
                  runnerDirs.push(path.join(repoRunnerDir, subEntry.name));
                }
              }
            }
          }
        }
      } catch (error) {
        throw new Error(`Error reading runners directory: ${runnersDir}: ${String(error)}`);
      }

      if (runnerDirs.length === 0) {
        logWarning('No runners found to clean.');
        return;
      }

      logger.emptyLine();
      logWarning(`Found ${runnerDirs.length} runner(s) to clean:`);
      runnerDirs.forEach((dir) => {
        logger.dim(`  - ${dir}`);
      });

      logger.emptyLine();
      const confirmClean = await p.confirm({
        message: color.red('Are you sure you want to delete all runners? This cannot be undone!'),
        initialValue: false,
      });

      checkCancel(confirmClean);
      if (!confirmClean) {
        p.cancel('Clean cancelled');
        process.exit(0);
      }

      // First, stop all running processes
      const spinner = createSpinner();
      spinner.start('Stopping all running processes...');

      const repositories = config?.repositories || [];
      if (repositories.length === 0) {
        // If no config, try to infer repositories from directory structure
        const runnersDir = path.join(PATHS.BASE_DIR, 'runners');
        try {
          const entries = await fs.readdir(runnersDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name.includes('-')) {
              // Format: owner-repo
              // Note: This is a best-effort approach for when config is missing
              // It may not work correctly if owner or repo names contain hyphens
              // TODO: Consider storing repository info in a metadata file per runner directory
              const lastHyphenIndex = entry.name.lastIndexOf('-');
              if (lastHyphenIndex > 0) {
                const owner = entry.name.substring(0, lastHyphenIndex);
                const repo = entry.name.substring(lastHyphenIndex + 1);
                repositories.push(`${owner}/${repo}`);
              }
            }
          }
        } catch {
          // Ignore errors
        }
      }

      if (repositories.length > 0) {
        const { stoppedCount, failedCount } = await stopAllProcesses(repositories);

        spinner.stop();
        if (failedCount > 0) {
          logWarning(`Failed to stop ${failedCount} runner${failedCount !== 1 ? 's' : ''}`);
        }

        // Wait for processes to fully terminate
        if (stoppedCount > 0) {
          logger.emptyLine();
          const waitSpinner = createSpinner();
          waitSpinner.start('Waiting for processes to terminate...');
          await new Promise((resolve) => setTimeout(resolve, 3000));
          waitSpinner.stop();
        }
      } else {
        spinner.stop();
      }

      let deleteFromGitHub = false;
      if (token) {
        const result = await p.confirm({
          message: 'Also remove runners from GitHub?',
          initialValue: true,
        });

        checkCancel(result);
        deleteFromGitHub = result;
      }

      const cleanSpinner = createSpinner();
      cleanSpinner.start('Cleaning runners...');
      const removalResults: string[] = [];

      // If deleting from GitHub, do that first
      if (deleteFromGitHub && token && config) {
        const githubClient = new GitHubClient({ token });

        for (const repoString of config.repositories) {
          try {
            const repository = parseRepository(repoString);
            cleanSpinner.message(
              `Removing runners from GitHub for ${repository.owner}/${repository.repo}...`,
            );

            const runners = await githubClient.listRunners(repository);
            for (const runner of runners) {
              try {
                await githubClient.deleteRunner(repository, runner.id);
                removalResults.push(color.dim(`  ✓ Removed ${runner.name} from GitHub`));
              } catch (_error) {
                removalResults.push(color.red(`  ✖ Failed to remove ${runner.name} from GitHub`));
              }
            }
          } catch (_error) {
            removalResults.push(color.red(`  ✖ Failed to access repository ${repoString}`));
          }
        }

        // Log results after spinner updates
        if (removalResults.length > 0) {
          cleanSpinner.stop();
          removalResults.forEach((result) => console.log(result));
          cleanSpinner.start('Cleaning runners...');
        }
      }

      // Delete local runner directories
      cleanSpinner.message('Deleting local runner directories...');
      const deletionResults: string[] = [];

      for (const runnerDir of runnerDirs) {
        try {
          await fs.rm(runnerDir, { recursive: true, force: true });
          deletionResults.push(color.dim(`  ✓ Deleted ${runnerDir}`));
        } catch (_error) {
          deletionResults.push(color.red(`  ✖ Failed to delete ${runnerDir}`));
        }
      }

      // Log deletion results
      if (deletionResults.length > 0) {
        cleanSpinner.stop();
        deletionResults.forEach((result) => console.log(result));
        cleanSpinner.start('Cleaning runners...');
      }

      // Clean up empty repository directories
      try {
        const entries = await fs.readdir(runnersDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const repoDir = path.join(runnersDir, entry.name);
            const subEntries = await fs.readdir(repoDir);
            if (subEntries.length === 0) {
              await fs.rmdir(repoDir);
            }
          }
        }

        // Remove runners directory if empty
        const remainingEntries = await fs.readdir(runnersDir);
        if (remainingEntries.length === 0) {
          await fs.rmdir(runnersDir);
        }
      } catch {
        // Ignore errors when cleaning up empty directories
      }

      // Stop spinner before final file operations
      cleanSpinner.stop();

      // Delete runners directory if it exists
      let runnersDeleted = false;
      try {
        await fs.rm(runnersDir, { recursive: true, force: true });
        console.log(color.dim(`  ✓ Deleted ${runnersDir} directory`));
        runnersDeleted = true;
      } catch {
        // Directory might not exist or already be deleted
      }

      // Delete configuration file
      let configDeleted = false;
      try {
        await fs.unlink(PATHS.CONFIG_FILE);
        console.log(color.dim(`  ✓ Deleted ${PATHS.CONFIG_FILE} configuration file`));
        configDeleted = true;
      } catch {
        // File might not exist
      }

      // Show success message
      if (
        runnersDeleted ||
        configDeleted ||
        deletionResults.length > 0 ||
        removalResults.length > 0
      ) {
        console.log();
        const deletedCount = deletionResults.filter((result) => result.includes('✓')).length;
        if (deletedCount > 0) {
          logSuccess(`Deleted ${deletedCount} runner${deletedCount !== 1 ? 's' : ''} successfully`);
        } else {
          logSuccess('Runners cleaned successfully');
        }
      }

      console.log();
      p.note(
        `${color.dim("Run 'gh-self-runner-cli init' to set up new runners")}`,
        'Clean completed!',
      );

      p.outro(color.green('Done!'));
    }),
  );
