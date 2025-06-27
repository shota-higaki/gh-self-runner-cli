import { execSync } from 'child_process';
import { type CosmiconfigResult, cosmiconfig } from 'cosmiconfig';
import yaml from 'yaml';
import type { ManagerConfig } from '../../types';
import { isGitHubCLIInstalled, PATHS } from '../../utils/index.js';

export class ConfigLoader {
  private explorer;

  constructor() {
    this.explorer = cosmiconfig('github-runners', {
      searchPlaces: [
        PATHS.CONFIG_FILE, // .github/self-hosted-runners/config.yml
        '.github-runners.yml', // Legacy path for backward compatibility
      ],
      loaders: {
        '.yml': (_filepath: string, content: string): unknown => yaml.parse(content),
        '.yaml': (_filepath: string, content: string): unknown => yaml.parse(content),
      },
    });
  }

  async load(filepath?: string): Promise<ManagerConfig> {
    let result: CosmiconfigResult;

    if (filepath) {
      result = await this.explorer.load(filepath);
    } else {
      result = await this.explorer.search();
    }

    if (!result || !result.config) {
      throw new Error('Configuration file not found');
    }

    // Validate and parse configuration
    const config = this.validateConfig(result.config);

    // Process environment variables
    return this.processEnvVars(config);
  }

  private validateConfig(config: unknown): ManagerConfig {
    const errors: string[] = [];

    // Type guard function
    const isObject = (value: unknown): value is Record<string, unknown> => {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    };

    if (!isObject(config)) {
      throw new Error('Configuration must be an object');
    }

    // Validate github section (optional, can use GitHub CLI instead)
    if (config.github !== undefined && config.github !== null) {
      if (!isObject(config.github)) {
        errors.push('github: must be an object');
      } else {
        // Token is optional - can use GitHub CLI
        if (config.github.token !== undefined && typeof config.github.token !== 'string') {
          errors.push('github.token: must be a string');
        }
        if (config.github.baseUrl !== undefined && typeof config.github.baseUrl !== 'string') {
          errors.push('github.baseUrl: must be a string');
        }
      }
    }

    // Validate repositories
    if (!Array.isArray(config.repositories)) {
      errors.push('repositories: must be an array');
    } else if (config.repositories.length === 0) {
      errors.push('repositories: must contain at least one repository');
    } else {
      config.repositories.forEach((repo, index) => {
        if (typeof repo !== 'string' || !repo) {
          errors.push(`repositories[${index}]: must be a non-empty string`);
        }
      });
    }

    // Validate runners section
    if (!isObject(config.runners)) {
      errors.push('runners: must be an object');
    } else {
      if (config.runners.id !== undefined && typeof config.runners.id !== 'string') {
        errors.push('runners.id: must be a string');
      }
      if (config.runners.parallel !== undefined) {
        if (typeof config.runners.parallel !== 'number' || config.runners.parallel < 0) {
          errors.push('runners.parallel: must be a non-negative number');
        }
      }
      if (config.runners.min !== undefined) {
        if (typeof config.runners.min !== 'number' || config.runners.min < 0) {
          errors.push('runners.min: must be a non-negative number');
        }
      }
      if (config.runners.max !== undefined) {
        if (typeof config.runners.max !== 'number' || config.runners.max < 1) {
          errors.push('runners.max: must be a positive number');
        }
      }
      if (config.runners.labels !== undefined) {
        if (!Array.isArray(config.runners.labels)) {
          errors.push('runners.labels: must be an array');
        } else {
          config.runners.labels.forEach((label, index) => {
            if (typeof label !== 'string' || !label) {
              errors.push(`runners.labels[${index}]: must be a non-empty string`);
            }
          });
        }
      }
    }

    // Validate logging section (optional)
    if (config.logging !== undefined) {
      if (!isObject(config.logging)) {
        errors.push('logging: must be an object');
      } else {
        if (config.logging.level !== undefined) {
          const validLevels = ['error', 'warn', 'info', 'debug'];
          if (!validLevels.includes(config.logging.level as string)) {
            errors.push(`logging.level: must be one of ${validLevels.join(', ')}`);
          }
        }
        if (config.logging.file !== undefined && typeof config.logging.file !== 'string') {
          errors.push('logging.file: must be a string');
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    }

    // At this point, we know config has the right shape
    // Set defaults
    if (!config.runners || typeof config.runners !== 'object') {
      throw new Error('Invalid configuration structure');
    }

    const runners = config.runners as Record<string, unknown>;
    if (!runners.parallel) {
      runners.parallel = 1;
    }

    return config as unknown as ManagerConfig;
  }

  private processEnvVars(config: ManagerConfig): ManagerConfig {
    // Replace environment variable placeholders
    const processed = JSON.stringify(config);
    const replaced = processed.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
      let value = process.env[envVar as string];

      // Special handling for GITHUB_TOKEN
      if (!value && envVar === 'GITHUB_TOKEN') {
        // Try to get token from GitHub CLI
        if (isGitHubCLIInstalled()) {
          try {
            const token = execSync('gh auth token', { encoding: 'utf-8', stdio: 'pipe' }).trim();
            if (token) {
              value = token;
            }
          } catch {
            // GitHub CLI not authenticated
          }
        }
      }

      if (!value) {
        throw new Error(
          `Environment variable ${envVar} is not set. Try running 'gh auth login' to authenticate with GitHub CLI, or see https://cli.github.com/ for installation instructions.`,
        );
      }
      return value;
    });

    return JSON.parse(replaced) as ManagerConfig;
  }
}
