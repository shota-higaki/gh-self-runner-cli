import { type ChildProcess, spawn, spawnSync } from 'child_process';
import { createWriteStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { RunnerConfig } from '../../types';
import { removePidFile, writePidFile } from '../../utils/fs-helpers.js';
import {
  getPlatformInfo,
  getRunnerDir,
  getRunnerLogPath,
  getRunnerPidPath,
  killProcess,
  logger,
} from '../../utils/index.js';

export class RunnerInstance {
  private process: ChildProcess | null = null;
  private runnerDir: string;
  private isConfigured = false;
  private logStream: WriteStream | null = null;
  private logPath: string;
  private pidPath: string;

  constructor(
    private id: string,
    config: RunnerConfig,
    private registrationToken: string,
  ) {
    this.runnerDir = getRunnerDir(config.repository.owner, config.repository.repo, this.id);
    this.logPath = getRunnerLogPath(config.repository.owner, config.repository.repo, this.id);
    this.pidPath = getRunnerPidPath(config.repository.owner, config.repository.repo, this.id);
  }

  async setup(): Promise<void> {
    logger.debug(`Setting up runner ${this.id}`);

    try {
      await fs.access(this.runnerDir);
      const runnerSettingsPath = path.join(this.runnerDir, '.runner');
      const { runnerScript } = getPlatformInfo();
      const runScriptPath = path.join(this.runnerDir, runnerScript);

      await fs.access(runnerSettingsPath);
      await fs.access(runScriptPath);

      this.isConfigured = true;
      logger.debug(`Runner ${this.id} is already configured`);
      return;
    } catch (error) {
      // Runner not configured or directory doesn't exist
      logger.debug(`Runner ${this.id} needs configuration: ${error}`);
    }

    await fs.mkdir(this.runnerDir, { recursive: true });

    const logDir = path.dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });

    const { runnerScript } = getPlatformInfo();
    const runScriptPath = path.join(this.runnerDir, runnerScript);
    const runnerExists = await this.checkRunnerExists(runScriptPath);

    if (!runnerExists) {
      throw new Error(
        `Runner not found at ${this.runnerDir}. The runner binary should have been downloaded automatically.`,
      );
    }

    // Runner binary exists but not configured - this shouldn't happen with our setup
    // Just mark as configured since we trust the init process
    this.isConfigured = true;
  }

  private async checkRunnerExists(runnerPath: string): Promise<boolean> {
    try {
      await fs.access(runnerPath);
      return true;
    } catch {
      return false;
    }
  }

  start(): void {
    if (!this.isConfigured) {
      throw new Error(`Runner ${this.id} is not configured`);
    }

    logger.debug(`Starting runner ${this.id}`);

    try {
      this.logStream = createWriteStream(this.logPath, { flags: 'a' });
      this.logStream.write(`\n=== Runner ${this.id} started at ${new Date().toISOString()} ===\n`);
    } catch (error) {
      logger.warn(`Failed to create log file for runner ${this.id}: ${(error as Error).message}`);
    }

    // Use absolute path to avoid path traversal attacks
    const { runnerScript, shell, shellArgs } = getPlatformInfo();

    // Since we're setting cwd to this.runnerDir, we can use just the script name
    // This avoids issues with relative paths when the command is run from different directories
    this.process = spawn(shell, [...shellArgs, runnerScript], {
      cwd: this.runnerDir,
      detached: true, // Run as independent process
      stdio: ['ignore', 'pipe', 'pipe'],
      // shell: false is the default, removing shell: true for security
    });

    // Unref the process to allow parent to exit independently
    this.process.unref();

    // Write PID file
    if (this.process.pid) {
      writePidFile(this.pidPath, this.process.pid)
        .then(() => logger.debug(`PID file written for runner ${this.id}: ${this.process?.pid}`))
        .catch((error) => logger.error(`Failed to write PID file for runner ${this.id}`, error));
    }

    this.process.stdout?.on('data', (data) => {
      const message = String(data).trim();
      if (this.logStream) {
        this.logStream.write(`[STDOUT] ${message}\n`);
      }
    });

    this.process.stderr?.on('data', (data) => {
      const message = String(data);
      const lowerMessage = message.toLowerCase();
      if (
        lowerMessage.includes('error') ||
        lowerMessage.includes('fail') ||
        lowerMessage.includes('fatal')
      ) {
        logger.error(`Runner ${this.id}: ${message.trim()}`);
      }
      if (this.logStream) {
        this.logStream.write(`[STDERR] ${message}`);
      }
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0) {
        logger.error(`Runner ${this.id} exited with code ${code} (signal: ${signal})`);
      } else {
        logger.info(`Runner ${this.id} exited cleanly (signal: ${signal})`);
      }
      if (this.logStream) {
        this.logStream.write(
          `\n=== Runner ${this.id} exited with code ${code} (signal: ${signal}) at ${new Date().toISOString()} ===\n`,
        );
        this.closeLogStream();
      }
      this.process = null;

      // Remove PID file
      removePidFile(this.pidPath)
        .then(() => logger.debug(`PID file removed for runner ${this.id}`))
        .catch((error) => logger.error(`Failed to remove PID file for runner ${this.id}`, error));
    });

    this.process.on('error', (error) => {
      logger.error(`Runner ${this.id} failed to start: ${error.message}`);
      if (this.logStream) {
        this.logStream.write(`[ERROR] Failed to start: ${error.message}\n`);
        this.closeLogStream();
      }
      this.process = null;
    });
  }

  async stop(): Promise<void> {
    logger.info(`Stopping runner ${this.id}`);

    if (!this.process) {
      this.closeLogStream();
      return;
    }

    const timeoutMs = 30000; // 30 seconds timeout
    const killTimeoutMs = 5000; // 5 seconds for SIGKILL

    // First try SIGINT for graceful shutdown (GitHub Actions runner responds to this)
    await killProcess(this.process, 'SIGINT');

    try {
      await this.waitForProcessExit(timeoutMs);
      logger.info(`Runner ${this.id} stopped gracefully`);
    } catch (_error) {
      // Process didn't exit gracefully, try SIGTERM
      logger.warn(`Runner ${this.id} did not respond to SIGINT, trying SIGTERM`);

      if (this.process && !this.process.killed) {
        await killProcess(this.process, 'SIGTERM');

        try {
          await this.waitForProcessExit(5000);
          logger.info(`Runner ${this.id} stopped with SIGTERM`);
        } catch {
          // Last resort: force kill
          logger.warn(`Runner ${this.id} did not respond to SIGTERM, forcing termination`);
          await killProcess(this.process, 'SIGKILL');

          try {
            await this.waitForProcessExit(killTimeoutMs);
            logger.info(`Runner ${this.id} force stopped`);
          } catch {
            logger.error(`Failed to stop runner ${this.id} even with SIGKILL`);
          }
        }
      }
    }

    this.process = null;
    this.closeLogStream();

    // Ensure PID file is removed
    await removePidFile(this.pidPath);
  }

  private waitForProcessExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }

      let timeoutHandle: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        this.process?.removeListener('exit', exitHandler);
      };

      const exitHandler = () => {
        cleanup();
        resolve();
      };

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Process did not exit within ${timeoutMs}ms`));
      }, timeoutMs);

      this.process.once('exit', exitHandler);
    });
  }

  private removeConfiguration(): void {
    try {
      const configScript = path.join(this.runnerDir, 'config.sh');
      // Use spawnSync to avoid command injection
      const result = spawnSync(configScript, ['remove', '--token', this.registrationToken], {
        cwd: this.runnerDir,
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
      });

      if (result.error) {
        throw result.error;
      }

      this.isConfigured = false;
      logger.debug(`Runner ${this.id} configuration removed`);
    } catch (error) {
      logger.debug(`Failed to remove runner configuration for ${this.id}: ${error}`);
      this.isConfigured = false;
    }
  }

  getId(): string {
    return this.id;
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Stop runner and remove configuration (for complete removal)
   */
  async stopAndRemove(): Promise<void> {
    await this.stop();

    if (this.isConfigured) {
      this.removeConfiguration();
    }
  }

  async dispose(): Promise<void> {
    if (this.process) {
      try {
        await killProcess(this.process, 'SIGKILL');
      } catch {
        // Ignore errors during disposal
      }
      this.process = null;
    }

    this.closeLogStream();
  }

  private closeLogStream(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
