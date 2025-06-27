import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { Repository } from '../../types';
import { getPlatformInfo, logger, PATHS } from '../../utils/index.js';

interface RunnerDownload {
  os: string;
  architecture: string;
  download_url: string;
  filename: string;
  sha256_checksum?: string;
}

export class RunnerSetup {
  private baseDir: string;
  private platform: string;
  private arch: string;

  constructor(baseDir: string = path.join(PATHS.BASE_DIR, 'runners')) {
    this.baseDir = baseDir;
    this.platform = this.getPlatform();
    this.arch = this.getArchitecture();
  }

  private getPlatform(): string {
    const platform = process.platform;
    switch (platform) {
      case 'darwin':
        return 'osx';
      case 'linux':
        return 'linux';
      case 'win32':
        return 'win';
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private getArchitecture(): string {
    const arch = process.arch;
    switch (arch) {
      case 'x64':
        return 'x64';
      case 'arm64':
        return 'arm64';
      case 'arm':
        return 'arm';
      default:
        throw new Error(`Unsupported architecture: ${arch}`);
    }
  }

  async downloadRunner(downloads: RunnerDownload[]): Promise<string> {
    const download = downloads.find((d) => d.os === this.platform && d.architecture === this.arch);

    if (!download) {
      throw new Error(`No runner available for ${this.platform}-${this.arch}`);
    }

    const downloadDir = path.join(this.baseDir, 'downloads');
    await fs.mkdir(downloadDir, { recursive: true });

    const downloadPath = path.join(downloadDir, download.filename);

    try {
      await fs.access(downloadPath);
      logger.debug(`Runner package already downloaded: ${download.filename}`);
      return downloadPath;
    } catch {}

    logger.debug(`Downloading GitHub Actions runner...`);

    const response = await fetch(download.download_url);
    if (!response.ok) {
      throw new Error(`Failed to download runner: ${response.statusText}`);
    }

    const fileStream = createWriteStream(downloadPath);
    if (!response.body) {
      throw new Error('No response body');
    }
    const nodeStream = Readable.fromWeb(response.body);
    await pipeline(nodeStream, fileStream);

    return downloadPath;
  }

  async extractRunner(archivePath: string, targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
    const { isWindows } = getPlatformInfo();

    logger.debug(`Extracting runner to: ${targetDir}`);

    const { spawnSync } = await import('node:child_process');

    if (isWindows) {
      const result = spawnSync(
        'powershell',
        [
          '-Command',
          `Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force`,
        ],
        {
          stdio: 'inherit',
        },
      );

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`Failed to extract archive with exit code ${result.status}`);
      }
    } else {
      const result = spawnSync('tar', ['xzf', archivePath, '-C', targetDir], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`Failed to extract archive with exit code ${result.status}`);
      }

      const configScript = path.join(targetDir, 'config.sh');
      try {
        await fs.chmod(configScript, 0o755);
      } catch (error) {
        logger.warn(`Could not set executable permission on config.sh: ${String(error)}`);
      }
    }
  }

  async configureRunner(
    runnerDir: string,
    repo: Repository,
    token: string,
    name: string,
    labels: string[] = [],
  ): Promise<void> {
    const { isWindows } = getPlatformInfo();
    const configScript = path.join(runnerDir, isWindows ? 'config.cmd' : 'config.sh');
    const url = `https://github.com/${repo.owner}/${repo.repo}`;

    try {
      if (isWindows) {
        await fs.access(configScript, fs.constants.F_OK);
      } else {
        await fs.access(configScript, fs.constants.F_OK | fs.constants.X_OK);
      }
    } catch (_error) {
      try {
        const files = await fs.readdir(runnerDir);
        logger.error(`Files in ${runnerDir}: ${files.join(', ')}`);
      } catch {
        logger.error(`Cannot read directory: ${runnerDir}`);
      }
      throw new Error(
        `Config script not found or not executable: ${configScript}. Ensure the runner package was extracted correctly and the script has execute permissions.`,
      );
    }

    const platformInfo = getPlatformInfo();
    const configCmd = platformInfo.isWindows ? '.\\config.cmd' : './config.sh';
    const args = [
      configCmd,
      '--url',
      url,
      '--token',
      token,
      '--name',
      name,
      '--work',
      '_work',
      '--unattended',
      '--replace',
    ];

    if (labels.length > 0) {
      args.push('--labels', labels.join(','));
    }

    logger.debug(`Configuring runner: ${name}`);

    try {
      const { spawnSync } = await import('node:child_process');

      if (platformInfo.isWindows) {
        const result = spawnSync('cmd.exe', ['/c', configCmd || configScript, ...args.slice(1)], {
          cwd: runnerDir,
          stdio: 'inherit',
        });

        if (result.error) {
          throw result.error;
        }

        if (result.status !== 0) {
          throw new Error(`Configuration script failed with exit code ${result.status}`);
        }
      } else {
        const result = spawnSync('/bin/sh', [configCmd, ...args.slice(1)], {
          cwd: runnerDir,
          stdio: 'inherit',
        });

        if (result.error) {
          throw result.error;
        }

        if (result.status !== 0) {
          throw new Error(`Configuration script failed with exit code ${result.status}`);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to configure runner: ${String(error)}. Check the runner logs for more details.`,
      );
    }
  }

  async setupRunner(
    repo: Repository,
    token: string,
    runnerId: string,
    downloads: RunnerDownload[],
    labels: string[] = [],
  ): Promise<string> {
    const tarPath = await this.downloadRunner(downloads);

    const runnerDir = path.join(this.baseDir, `${repo.owner}-${repo.repo}`, runnerId);
    await fs.mkdir(runnerDir, { recursive: true });

    await this.extractRunner(tarPath, runnerDir);

    const runnerName = `${repo.repo}-${runnerId}`;
    await this.configureRunner(runnerDir, repo, token, runnerName, labels);

    return runnerDir;
  }
}
