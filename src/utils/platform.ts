import { platform } from 'os';
import { logger } from './logger.js';

export interface PlatformInfo {
  isWindows: boolean;
  isLinux: boolean;
  isMacOS: boolean;
  runnerScript: string;
  shell: string;
  shellArgs: string[];
  pathSeparator: string;
}

export function getPlatformInfo(): PlatformInfo {
  const currentPlatform = platform();
  const isWindows = currentPlatform === 'win32';
  const isLinux = currentPlatform === 'linux';
  const isMacOS = currentPlatform === 'darwin';

  return {
    isWindows,
    isLinux,
    isMacOS,
    runnerScript: isWindows ? 'run.cmd' : 'run.sh',
    shell: isWindows ? 'cmd.exe' : '/bin/sh',
    shellArgs: isWindows ? ['/c'] : [],
    pathSeparator: isWindows ? '\\' : '/',
  };
}

/**
 * Kill a process with platform-specific handling
 */
export interface ProcessLike {
  pid?: number;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  killed?: boolean;
}

export async function killProcess(
  process: ProcessLike,
  signal: NodeJS.Signals = 'SIGTERM',
): Promise<void> {
  const { isWindows } = getPlatformInfo();

  if (isWindows) {
    // On Windows, we need to handle signals differently
    // SIGINT and SIGTERM both use default kill (graceful)
    // SIGKILL forces termination
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      process.kill();
    } else if (signal === 'SIGKILL') {
      if (!process.pid) {
        logger.warn('Cannot kill process: no pid available');
        return;
      }
      try {
        const { exec } = await import('child_process');
        await new Promise<void>((resolve, reject) => {
          exec(`taskkill /pid ${process.pid} /t /f`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } catch (_error) {
        process.kill();
      }
    }
  } else {
    process.kill(signal);
  }
}
