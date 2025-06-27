import { execSync } from 'child_process';
import { CLIError } from './errors.js';
import { logger } from './logger.js';

export interface GitHubAuthStatus {
  isAuthenticated: boolean;
  user?: string;
}

export function isGitHubCLIInstalled(): boolean {
  try {
    execSync('which gh', { encoding: 'utf8' });
    return true;
  } catch {
    try {
      execSync('where gh', { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }
}

export function checkGitHubCLI(): void {
  if (!isGitHubCLIInstalled()) {
    throw new CLIError(
      'GitHub CLI is not installed. Please install it from https://cli.github.com/',
      3,
    );
  }
}

export function checkGitHubAuth(): GitHubAuthStatus {
  try {
    const result = execSync('gh auth status', { encoding: 'utf-8', stdio: 'pipe' });
    const isAuthenticated = result.includes('Logged in to github.com');
    const userMatch = result.match(/Logged in to github\.com as ([^\s]+)/);

    return {
      isAuthenticated,
      user: userMatch ? userMatch[1] : undefined,
    };
  } catch {
    return { isAuthenticated: false };
  }
}

export async function getGitHubToken(
  options?: Record<string, unknown>,
): Promise<{ token: string; source: string }> {
  try {
    const execOptions = { encoding: 'utf8' as const, ...options };
    const token = execSync('gh auth token', execOptions).toString().trim();

    if (!token) {
      throw new Error('Failed to get GitHub token from CLI');
    }

    return {
      token,
      source: 'github-cli',
    };
  } catch {
    throw new Error('Failed to get GitHub token from CLI');
  }
}

export function authenticateGitHub(): boolean {
  logger.info('🔐 Authenticating with GitHub CLI...');
  logger.emptyLine();

  try {
    execSync('gh auth login --web --scopes repo,workflow', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

export function ensureGitHubToken(): string | null {
  // Check if GitHub CLI is installed
  if (!isGitHubCLIInstalled()) {
    logger.warning('GitHub CLI (gh) is not installed.');
    logger.dim('Install it from: https://cli.github.com/');
    return null;
  }

  // Check if already authenticated
  const authStatus = checkGitHubAuth();

  if (!authStatus.isAuthenticated) {
    logger.warning('Not authenticated with GitHub CLI.');

    // Try to authenticate
    if (!authenticateGitHub()) {
      logger.error('Authentication failed');
      return null;
    }
  }

  // Get the token synchronously
  try {
    const token = execSync('gh auth token', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    return token || null;
  } catch {
    logger.error('Failed to retrieve GitHub token');
    return null;
  }
}
