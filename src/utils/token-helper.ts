/**
 * Extract token prefix to identify token type
 * GitHub tokens have specific prefixes:
 * - ghp_: Personal Access Token (classic)
 * - github_pat_: Personal Access Token (fine-grained)
 * - ghs_: OAuth App token
 * - ghu_: GitHub App user token
 * @param token The token to analyze
 * @returns Token type description
 */
export function getTokenType(token: string): string {
  if (token.startsWith('ghp_')) {
    return 'Personal Access Token (classic)';
  } else if (token.startsWith('github_pat_')) {
    return 'Personal Access Token (fine-grained)';
  } else if (token.startsWith('ghs_')) {
    return 'OAuth App token';
  } else if (token.startsWith('ghu_')) {
    return 'GitHub App user token';
  } else {
    return 'GitHub token';
  }
}
