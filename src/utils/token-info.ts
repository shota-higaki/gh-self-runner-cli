import { execSync } from 'child_process';

export interface TokenInfo {
  source: 'github-cli' | 'personal-access-token';
  username: string;
  displayName: string;
  tokenType: string;
}

/**
 * Get information about a GitHub token
 */
export async function getTokenInfo(token: string): Promise<TokenInfo> {
  let username = 'Unknown';
  let displayName = 'Unknown';
  let source: 'github-cli' | 'personal-access-token' = 'personal-access-token';
  let tokenType = 'Unknown Token Type';

  // Determine token type based on prefix
  if (token.startsWith('gho_')) {
    source = 'github-cli';
    tokenType = 'OAuth Token';
  } else if (token.startsWith('ghp_')) {
    tokenType = 'Personal Access Token';
  } else if (token.startsWith('ghs_')) {
    tokenType = 'Server-to-Server Token';
  } else if (token.startsWith('github_pat_')) {
    tokenType = 'Personal Access Token';
  }

  // Try to get user info from GitHub API
  try {
    const userInfo = execSync(`gh api user -H "Authorization: token ${token}"`, {
      encoding: 'utf8',
    });

    const user = JSON.parse(userInfo);
    username = user.login || username;
    displayName = user.name || username;
  } catch {
    // If API call fails, use defaults
  }

  return {
    source,
    username,
    displayName,
    tokenType,
  };
}
