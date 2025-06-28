import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Get the default configuration directory
 * Defaults to ~/.config/gh-self-runner-cli
 */
export function getDefaultConfigDirectory(): string {
  return join(homedir(), '.config', 'gh-self-runner-cli');
}

/**
 * Get the configuration directory from environment or default
 */
export function getConfigDirectory(): string {
  return process.env.GH_SELF_RUNNER_CONFIG_DIR || getDefaultConfigDirectory();
}

/**
 * Ensure the configuration directory exists
 */
export function ensureConfigDirectory(configDir: string): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Store the selected config directory in a marker file in the current directory
 */
export function storeConfigDirectoryReference(configDir: string): void {
  const markerPath = join(process.cwd(), '.github-self-runner-config');
  const content = `# GitHub Self-Hosted Runner CLI Configuration\n# This file indicates that this repository uses gh-self-runner-cli\n# Configuration directory: ${configDir}\nconfig_directory: ${configDir}\n`;

  // Write the marker file
  writeFileSync(markerPath, content, 'utf-8');
}

/**
 * Read the config directory reference from the marker file
 */
export function readConfigDirectoryReference(): string | null {
  const markerPath = join(process.cwd(), '.github-self-runner-config');

  if (!existsSync(markerPath)) {
    return null;
  }

  try {
    const content = readFileSync(markerPath, 'utf-8');
    const match = content.match(/^config_directory:\s*(.+)$/m);
    return match && match[1] ? match[1].trim() : null;
  } catch {
    return null;
  }
}
