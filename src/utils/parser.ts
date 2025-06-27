import type { Repository } from '../types';

/**
 * Sanitize a repository path component to prevent path traversal attacks
 * @param component The owner or repo name to sanitize
 * @param componentType The type of component for error messages
 * @returns The sanitized component
 * @throws Error if the component contains dangerous characters
 */
function sanitizePathComponent(component: string, componentType: 'owner' | 'repo'): string {
  if (!component) {
    throw new Error(`Invalid repository ${componentType}: cannot be empty`);
  }

  // Check for dangerous characters that could lead to path traversal
  const dangerousPatterns = [
    { pattern: /\.\./g, name: 'parent directory references (..)' },
    { pattern: /\//g, name: 'forward slashes' },
    { pattern: /\\/g, name: 'backslashes' },
    { pattern: /:/g, name: 'colons' },
    { pattern: /\0/g, name: 'null bytes' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(component)) {
      throw new Error(
        `Invalid repository ${componentType} "${component}": contains ${name}, which could lead to path traversal attacks`,
      );
    }
  }

  // Additional validation: ensure it's a valid GitHub username/repo name
  // GitHub has specific rules: alphanumeric, hyphens, underscores, and dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(component)) {
    throw new Error(
      `Invalid repository ${componentType} "${component}": must contain only alphanumeric characters, hyphens, underscores, and dots`,
    );
  }

  // GitHub doesn't allow names that start or end with dots
  if (component.startsWith('.') || component.endsWith('.')) {
    throw new Error(
      `Invalid repository ${componentType} "${component}": cannot start or end with a dot`,
    );
  }

  return component;
}

export function parseRepository(repoString: string): Repository {
  const trimmed = repoString.trim();

  const urlPatterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/,
    /^git@github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/,
    /^github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1] && match[2]) {
      // URL decode components to catch encoded path traversal attempts
      let ownerDecoded: string;
      let repoDecoded: string;

      try {
        ownerDecoded = decodeURIComponent(match[1]);
        repoDecoded = decodeURIComponent(match[2]);
      } catch {
        // If decoding fails, the URL is malformed
        throw new Error(`Invalid repository URL: malformed URL encoding`);
      }

      // Sanitize decoded components
      const owner = sanitizePathComponent(ownerDecoded, 'owner');
      const repo = sanitizePathComponent(repoDecoded, 'repo');
      return { owner, repo };
    }
  }

  const parts = trimmed.split('/');
  if (parts.length === 2) {
    const [ownerPart, repoPart] = parts;
    if (ownerPart && repoPart) {
      // Sanitize components
      const owner = sanitizePathComponent(ownerPart, 'owner');
      const repo = sanitizePathComponent(repoPart, 'repo');
      return { owner, repo };
    }
  }

  throw new Error(
    `Invalid repository format: ${repoString}\n` +
      `Expected formats:\n` +
      `  - owner/repo\n` +
      `  - https://github.com/owner/repo\n` +
      `  - git@github.com:owner/repo.git`,
  );
}

export function stringifyRepository(repo: Repository): string {
  return `${repo.owner}/${repo.repo}`;
}
