import * as p from '@clack/prompts';
import color from 'picocolors';
import { authenticationError } from '../../utils/errors.js';
import {
  authenticateGitHub,
  checkGitHubAuth,
  ensureGitHubToken,
  getTokenType,
  isGitHubCLIInstalled,
  logger,
} from '../../utils/index.js';

export interface AuthOptions {
  skipGitHubCLI?: boolean;
  silent?: boolean;
  interactive?: boolean;
  offerCLI?: boolean;
}

export interface AuthResult {
  token: string;
  source: 'cli' | 'prompt' | 'env';
  type?: 'github-cli' | 'personal-access-token';
}

/**
 * Get GitHub token from various sources
 */
export async function getGitHubToken(options: AuthOptions = {}): Promise<AuthResult> {
  // Check environment variable first
  if (process.env.GITHUB_TOKEN) {
    if (!options.silent) {
      logger.success('Using GitHub token from environment variable');
      logger.dim(`  Token: ${getTokenType(process.env.GITHUB_TOKEN)}`);
    }
    return {
      token: process.env.GITHUB_TOKEN,
      source: 'env',
    };
  }

  // If interactive mode with offerCLI, ask user about GitHub CLI
  if (options.interactive && options.offerCLI && isGitHubCLIInstalled()) {
    const token = await offerGitHubCLIAuth();
    if (token) {
      return {
        token,
        source: 'cli',
        type: 'github-cli',
      };
    }
  }

  // Try GitHub CLI automatically if not skipped
  if (!options.skipGitHubCLI && !options.interactive) {
    if (isGitHubCLIInstalled()) {
      const authStatus = checkGitHubAuth();

      // If GitHub CLI is installed but not authenticated, offer to authenticate
      if (!authStatus.isAuthenticated) {
        if (!options.silent) {
          logger.warn('GitHub CLI is not authenticated');
        }

        // In non-interactive mode, try to authenticate with GitHub CLI
        const authenticated = authenticateGitHub();
        if (authenticated) {
          const token = ensureGitHubToken();
          if (token) {
            if (!options.silent) {
              logger.success('GitHub token retrieved from GitHub CLI');
              logger.dim(`  Token: ${getTokenType(token)}`);
            }
            return {
              token,
              source: 'cli',
              type: 'github-cli',
            };
          }
        }
      } else {
        // GitHub CLI is authenticated, try to get token
        const token = ensureGitHubToken();
        if (token) {
          if (!options.silent) {
            logger.success('GitHub token retrieved from GitHub CLI');
            logger.dim(`  Token: ${getTokenType(token)}`);
          }
          return {
            token,
            source: 'cli',
            type: 'github-cli',
          };
        }
      }
    }
  }

  // Prompt for token
  const result = await promptForGitHubAuth();
  return {
    token: result.token,
    source: 'prompt',
    type: 'personal-access-token',
  };
}

/**
 * Interactive prompt for GitHub authentication
 */
async function promptForGitHubAuth(): Promise<{ token: string }> {
  p.log.warn('No GitHub token found');
  logger.dim('  You can:');
  logger.dim('  - Set GITHUB_TOKEN environment variable');
  logger.dim('  - Use GitHub CLI: gh auth login');
  logger.dim('  - Enter a personal access token below');
  logger.emptyLine();

  const token = await p.password({
    message: 'Enter your GitHub Personal Access Token:',
    validate: (input) => {
      if (!input) return 'GitHub token is required';
      if (input.length < 10) return 'Token seems too short';
      return undefined;
    },
  });

  if (p.isCancel(token)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  console.log();
  console.log(color.dim(`  Using token: ${getTokenType(token)}`));

  return { token };
}

/**
 * Offer GitHub CLI authentication
 */
async function offerGitHubCLIAuth(): Promise<string | null> {
  if (!isGitHubCLIInstalled()) {
    return null;
  }

  // Check current auth status
  const authStatus = checkGitHubAuth();

  let message = 'GitHub CLI detected. Use it to authenticate automatically?';
  if (!authStatus.isAuthenticated) {
    message = 'GitHub CLI is not authenticated. Would you like to authenticate now?';
  } else if (authStatus.user) {
    message = `GitHub CLI authenticated as @${authStatus.user}. Use this authentication?`;
  }

  const useGitHubCLI = await p.confirm({
    message,
    initialValue: true,
  });

  if (p.isCancel(useGitHubCLI)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  if (useGitHubCLI) {
    // If not authenticated, try to authenticate first
    if (!authStatus.isAuthenticated) {
      p.log.info('Launching GitHub CLI authentication...');
      const authenticated = authenticateGitHub();
      if (!authenticated) {
        p.log.error('GitHub CLI authentication failed');
        return null;
      }
    }

    // Try to get token
    const token = ensureGitHubToken();
    if (token) {
      // Get auth status again to show username
      const newAuthStatus = checkGitHubAuth();
      if (newAuthStatus.isAuthenticated && newAuthStatus.user) {
        p.log.success('GitHub token retrieved successfully');
        console.log(color.dim(`  Using: GitHub token for @${newAuthStatus.user}`));
      } else {
        p.log.success('GitHub token retrieved successfully');
        console.log(color.dim(`  Using: ${getTokenType(token)}`));
      }
      return token;
    } else {
      p.log.warn('Failed to retrieve token from GitHub CLI');
      console.log(color.dim('  You may need to run: gh auth login'));
    }
  }

  return null;
}

/**
 * Validate GitHub token format
 */
function validateTokenFormat(token: string): boolean {
  // GitHub CLI tokens are in a different format - they are usually longer JWT-like tokens
  // We should accept any non-empty token that looks reasonable

  // Minimum length check
  if (token.length < 20) {
    return false;
  }

  // GitHub tokens with known prefixes
  const knownPrefixes = ['ghp_', 'github_pat_', 'ghs_', 'gho_', 'ghu_'];
  if (knownPrefixes.some((prefix) => token.startsWith(prefix))) {
    return true;
  }

  // GitHub CLI tokens might be in different formats
  // Accept tokens that look like they could be valid (alphanumeric with some special chars)
  if (/^[A-Za-z0-9_\-.]+$/.test(token)) {
    return true;
  }

  // Legacy format (40 char hex) - classic tokens without prefix
  if (token.length === 40 && /^[a-f0-9]+$/i.test(token)) {
    return true;
  }

  return false;
}

/**
 * Get token with validation
 */
export async function getValidatedGitHubToken(options: AuthOptions = {}): Promise<string> {
  const result = await getGitHubToken(options);

  if (!validateTokenFormat(result.token)) {
    throw authenticationError(
      'Invalid token format. Please check your GitHub Personal Access Token.',
    );
  }

  return result.token;
}
