import * as p from '@clack/prompts';
import { Command } from 'commander';
import color from 'picocolors';
import { GitHubClient } from '../../lib/github/index.js';
import { RunnerManager } from '../../lib/runner/index.js';
import { RunnerSetup } from '../../lib/runner/runner-setup.js';
import { writeConfigFile } from '../../utils/fs-helpers.js';
import { ensureGitignore, getPlatformInfo, PATHS } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import {
  checkCancel,
  createSpinner,
  getValidatedGitHubToken,
  logInfo,
  promptForRepository,
  promptForRunnerCount,
  withErrorHandling,
} from '../utils/index.js';

function generateRunnerId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `runner-${timestamp}-${randomSuffix}`;
}

function getDefaultLabels(): string {
  const { isWindows, isLinux } = getPlatformInfo();
  const os = isWindows ? 'windows' : isLinux ? 'linux' : 'macos';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `self-hosted,${os},${arch}`;
}

export const initCommand = new Command('init')
  .description('Initialize runner configuration for a repository (interactive)')
  .action(
    withErrorHandling(async () => {
      console.clear();
      p.intro(color.cyan('GitHub Self-Hosted Runner CLI - Initialize Repository'));

      const repo = await promptForRepository('Which repository do you want to configure?');

      const token = await getValidatedGitHubToken();
      const type = token.startsWith('gho_') ? 'github-cli' : 'pat';

      const count = await promptForRunnerCount(
        'How many parallel runners do you want to create?',
        '1',
      );

      const defaultLabels = getDefaultLabels();
      const labels = await p.text({
        message: `Runner labels (comma-separated) (default: ${defaultLabels}):`,
        placeholder: defaultLabels,
        initialValue: defaultLabels,
      });

      checkCancel(labels);

      const spinner = createSpinner();
      spinner.start('Checking repository and permissions');

      const githubClient = new GitHubClient({ token });

      try {
        const isValid = await githubClient.validateRepository(repo);
        if (!isValid) {
          throw new Error('Repository validation failed');
        }
      } catch (_error) {
        spinner.stop('Failed to access repository');
        throw new Error(
          `Cannot access repository ${repo.owner}/${repo.repo}. Please check:\n` +
            `  - Repository exists and is accessible\n` +
            `  - Token has appropriate permissions\n` +
            `  - Repository name is correct`,
        );
      }

      spinner.message('Downloading GitHub Actions runner');

      const downloads = await githubClient.getRunnerDownloads(repo);

      const runnerManager = new RunnerManager(githubClient);
      await runnerManager.initializeRepository(repo, {
        labels: labels.split(',').map((l) => l.trim()),
      });

      const runnerIds: string[] = [];
      const runnerDirs: string[] = [];
      const runnerSetup = new RunnerSetup();

      for (let i = 0; i < count; i++) {
        const runnerId = generateRunnerId();
        runnerIds.push(runnerId);

        spinner.message(`Setting up runner ${i + 1}/${count}: ${runnerId}`);

        const registrationToken = await githubClient.getRunnerRegistrationToken(repo);

        const runnerDir = await runnerSetup.setupRunner(
          repo,
          registrationToken,
          runnerId,
          downloads,
          labels.split(',').map((l) => l.trim()),
        );
        runnerDirs.push(runnerDir);
      }

      spinner.message('Creating configuration file');

      const configContent = `# GitHub Self-Hosted Runner Configuration
# Generated by gh-self-runner-cli

${type === 'github-cli' ? '# GitHub authentication via GitHub CLI (gh)' : `github:\n  token: \${GITHUB_TOKEN} # Set GITHUB_TOKEN environment variable`}

repositories:
  - ${repo.owner}/${repo.repo}

runners:
  parallel: ${count}
  labels:
${labels
  .split(',')
  .map((l) => `    - ${l.trim()}`)
  .join('\n')}

logging:
  level: info
`;
      await writeConfigFile(PATHS.CONFIG_FILE, configContent);
      await ensureGitignore();

      spinner.stop('Setup completed successfully');

      logger.emptyLine();
      p.note(
        `${color.green('✓')} Repository: ${color.bold(`${repo.owner}/${repo.repo}`)}\n` +
          `${color.green('✓')} Runners: ${color.bold(String(count))}\n` +
          `${color.green('✓')} Labels: ${color.bold(labels)}\n` +
          `${color.green('✓')} Config: ${color.bold(PATHS.CONFIG_FILE)}`,
        'Summary',
      );

      if (runnerIds.length > 0) {
        logger.emptyLine();
        logInfo('Created runners:');
        runnerIds.forEach((id, index) => {
          logger.dim(`  ${index + 1}. ${id} → ${runnerDirs[index]}`);
        });
      }

      logger.emptyLine();
      p.note(
        `${color.dim('To start the runners:')}\n  ${color.white('gh-self-runner-cli start')}\n\n` +
          `${color.dim('To stop the runners:')}\n  ${color.white('gh-self-runner-cli stop')}`,
        'Next Steps',
      );

      p.outro(color.green('Initialization complete!'));
    }),
  );
