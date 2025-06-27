import * as p from '@clack/prompts';
import * as fs from 'fs/promises';
import { ConfigLoader } from '../../lib/config/index.js';
import type { ManagerConfig } from '../../types';
import { PATHS } from '../../utils/index.js';

/**
 * Check if a configuration file exists
 */
export async function checkConfigFile(configPath?: string): Promise<boolean> {
  const targetPath = configPath || PATHS.CONFIG_FILE;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-detect configuration file
 */
export async function autoDetectConfig(): Promise<string | null> {
  const configExists = await checkConfigFile();
  if (configExists) {
    p.log.success(`Found configuration file: ${PATHS.CONFIG_FILE}`);
    return PATHS.CONFIG_FILE;
  }
  return null;
}

/**
 * Load configuration
 */
export async function loadConfiguration(configPath?: string): Promise<{
  config: ManagerConfig;
  configPath: string;
}> {
  const targetPath = configPath || PATHS.CONFIG_FILE;
  const configLoader = new ConfigLoader();
  const config = await configLoader.load(targetPath);
  return { config, configPath: targetPath };
}

/**
 * Validate configuration file exists and is readable
 */
export async function validateConfigFile(configPath: string): Promise<void> {
  try {
    await fs.access(configPath, fs.constants.R_OK);
  } catch {
    throw new Error(`Configuration file not found or not readable: ${configPath}`);
  }
}

/**
 * Detect configuration file
 */
export async function detectConfigFile(options: {
  config?: string;
}): Promise<{ hasConfig: boolean; configPath?: string }> {
  if (options.config) {
    // User specified a config file
    await validateConfigFile(options.config);
    return { hasConfig: true, configPath: options.config };
  }

  // Try to auto-detect
  const detectedPath = await autoDetectConfig();
  if (detectedPath) {
    return { hasConfig: true, configPath: detectedPath };
  }

  // Also check legacy location
  const legacyPath = '.github-runners.yml';
  const legacyExists = await checkConfigFile(legacyPath);
  if (legacyExists) {
    p.log.success(`Found configuration file: ${legacyPath}`);
    return { hasConfig: true, configPath: legacyPath };
  }

  return { hasConfig: false };
}

/**
 * Load configuration interactively
 */
export async function loadConfigurationInteractive(): Promise<{
  config: ManagerConfig;
  isNew: boolean;
} | null> {
  const hasConfig = await p.confirm({
    message: 'Do you have a configuration file?',
    initialValue: false,
  });

  if (p.isCancel(hasConfig)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  if (hasConfig) {
    const configPath = await p.text({
      message: 'Enter the path to your configuration file:',
      placeholder: PATHS.CONFIG_FILE,
      validate: (value) => {
        if (!value) return 'Path is required';
        // Note: @clack/prompts doesn't support async validation
        // We'll validate after the prompt
        return undefined;
      },
    });

    if (p.isCancel(configPath)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    // Validate the file after prompt
    try {
      await validateConfigFile(configPath);
    } catch (error) {
      p.log.error(error instanceof Error ? error.message : 'Invalid file');
      process.exit(1);
    }

    const { config } = await loadConfiguration(configPath);
    return { config, isNew: false };
  }

  return null;
}

/**
 * Common options interface
 */
export interface CommonOptions {
  config?: string;
}
