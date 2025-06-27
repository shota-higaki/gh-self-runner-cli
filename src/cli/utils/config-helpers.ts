import * as p from '@clack/prompts';
import path from 'path';
import { ConfigLoader } from '../../lib/config/index.js';
import type { ManagerConfig } from '../../types';
import { fileExists, PATHS } from '../../utils/index.js';
import { detectConfigFile } from './common.js';
import { checkCancel } from './error-handler.js';

export interface ConfigLoadResult {
  config: ManagerConfig | null;
  configPath: string | null;
  isInteractive: boolean;
}

/**
 * Load configuration with fallback to interactive mode
 */
export async function loadConfigWithFallback(
  options: { config?: string },
  interactiveMessage = 'No configuration file found. Would you like to configure interactively?',
): Promise<ConfigLoadResult> {
  const detection = await detectConfigFile(options);

  if (detection.hasConfig && detection.configPath) {
    // Load the configuration
    const configLoader = new ConfigLoader();
    const configResult = await configLoader.load(detection.configPath);

    if (!configResult) {
      throw new Error(`Failed to load configuration from ${detection.configPath}`);
    }

    const config = configResult;
    return {
      config,
      configPath: detection.configPath,
      isInteractive: false,
    };
  }

  // No config found, ask for interactive mode
  const useInteractive = await p.confirm({
    message: interactiveMessage,
    initialValue: true,
  });

  checkCancel(useInteractive);

  if (!useInteractive) {
    p.log.info('Create a configuration file first using: gh-self-runner-cli init');
    process.exit(0);
  }

  return {
    config: null,
    configPath: null,
    isInteractive: true,
  };
}

/**
 * Ensure configuration directory exists
 */
export async function ensureConfigDirectory(): Promise<string> {
  const configDir = path.dirname(PATHS.CONFIG_FILE);
  const exists = await fileExists(configDir);

  if (!exists) {
    const { createDirectory } = await import('../../utils/fs-helpers.js');
    await createDirectory(configDir);
  }

  return configDir;
}

/**
 * Get GitHub token from config or auth
 */
export async function getGitHubTokenFromConfig(
  config: ManagerConfig | null,
  options: {
    skipGitHubCLI?: boolean;
    silent?: boolean;
  } = {},
): Promise<string> {
  if (config?.github?.token) {
    return config.github.token;
  }

  const { getValidatedGitHubToken } = await import('./auth.js');
  return getValidatedGitHubToken({
    skipGitHubCLI: options.skipGitHubCLI,
    silent: options.silent,
    interactive: false,
  });
}
