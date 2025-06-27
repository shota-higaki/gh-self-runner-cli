import { parseRepository, stringifyRepository } from '../../../src/utils/parser';

describe('parseRepository', () => {
  describe('valid formats', () => {
    it('should parse owner/repo format', () => {
      const result = parseRepository('octocat/hello-world');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should parse HTTPS URL format', () => {
      const result = parseRepository('https://github.com/octocat/hello-world');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should parse HTTPS URL with .git extension', () => {
      const result = parseRepository('https://github.com/octocat/hello-world.git');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should parse SSH URL format', () => {
      const result = parseRepository('git@github.com:octocat/hello-world.git');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should parse URL without protocol', () => {
      const result = parseRepository('github.com/octocat/hello-world');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should handle private repositories', () => {
      const result = parseRepository('https://github.com/shota-higaki/simcity-like-game');
      expect(result).toEqual({ owner: 'shota-higaki', repo: 'simcity-like-game' });
    });

    it('should trim whitespace', () => {
      const result = parseRepository('  octocat/hello-world  ');
      expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('should handle repository names with dashes and underscores', () => {
      const result = parseRepository('my-org/my_repo-name');
      expect(result).toEqual({ owner: 'my-org', repo: 'my_repo-name' });
    });
  });

  describe('invalid formats', () => {
    it('should throw error for empty string', () => {
      expect(() => parseRepository('')).toThrow('Invalid repository format');
    });

    it('should throw error for single word', () => {
      expect(() => parseRepository('hello')).toThrow('Invalid repository format');
    });

    it('should throw error for too many slashes', () => {
      expect(() => parseRepository('owner/repo/extra')).toThrow('Invalid repository format');
    });

    it('should throw error for invalid URL', () => {
      expect(() => parseRepository('https://example.com/repo')).toThrow(
        'Invalid repository format',
      );
    });

    it('should throw error with helpful message', () => {
      expect(() => parseRepository('invalid')).toThrow(
        /Expected formats:.*owner\/repo.*https:\/\/github\.com\/owner\/repo/s,
      );
    });
  });

  describe('security - path traversal prevention', () => {
    it('should reject parent directory references in owner', () => {
      expect(() => parseRepository('../evil')).toThrow('contains parent directory references (..)');
      expect(() => parseRepository('..%2Fevil')).toThrow(
        'Invalid repository format', // This is a single component, not owner/repo format
      );
    });

    it('should reject parent directory references in repo', () => {
      expect(() => parseRepository('owner/..')).toThrow(
        'contains parent directory references (..)',
      );
      expect(() => parseRepository('owner/evil..')).toThrow(
        'contains parent directory references (..)', // .. is detected before dot ending check
      );
    });

    it('should reject forward slashes in components', () => {
      expect(() => parseRepository('own/er/repo')).toThrow('Invalid repository format');
      expect(() => parseRepository('https://github.com/own%2Fer/repo')).toThrow(
        'contains forward slashes',
      );
    });

    it('should reject backslashes', () => {
      expect(() => parseRepository('owner\\repo')).toThrow('Invalid repository format');
      expect(() => parseRepository('owner/repo\\name')).toThrow('contains backslashes');
    });

    it('should reject colons in repository components', () => {
      expect(() => parseRepository('owner:name/repo')).toThrow('contains colons');
      expect(() => parseRepository('owner/repo:name')).toThrow('contains colons');
    });

    it('should reject null bytes', () => {
      expect(() => parseRepository('owner\0/repo')).toThrow('contains null bytes');
      expect(() => parseRepository('owner/repo\0')).toThrow('contains null bytes');
    });

    it('should reject complex path traversal attempts', () => {
      expect(() => parseRepository('../../../tmp/pwned-repo')).toThrow('Invalid repository format');
      expect(() => parseRepository('./../evil')).toThrow(
        'Invalid repository format', // Three parts split by /
      );
      expect(() => parseRepository('valid/evil%2F%2Fetc')).toThrow(
        'must contain only alphanumeric characters',
      );
    });

    it('should reject special characters not allowed by GitHub', () => {
      expect(() => parseRepository('owner!/repo')).toThrow(
        'must contain only alphanumeric characters',
      );
      expect(() => parseRepository('owner/repo@')).toThrow(
        'must contain only alphanumeric characters',
      );
      expect(() => parseRepository('owner#/repo')).toThrow(
        'must contain only alphanumeric characters',
      );
    });

    it('should reject names starting or ending with dots', () => {
      expect(() => parseRepository('.owner/repo')).toThrow('cannot start or end with a dot');
      expect(() => parseRepository('owner./repo')).toThrow('cannot start or end with a dot');
      expect(() => parseRepository('owner/.repo')).toThrow('cannot start or end with a dot');
      expect(() => parseRepository('owner/repo.')).toThrow('cannot start or end with a dot');
    });

    it('should reject empty components', () => {
      expect(() => parseRepository('/repo')).toThrow('Invalid repository format');
      expect(() => parseRepository('owner/')).toThrow('Invalid repository format');
    });

    it('should handle URL-encoded path traversal attempts', () => {
      expect(() => parseRepository('https://github.com/%2e%2e/repo')).toThrow(
        'contains parent directory references (..)',
      );
      expect(() => parseRepository('https://github.com/owner/%2e%2e%2fevil')).toThrow(
        'contains parent directory references (..)',
      );
    });

    it('should reject mixed path traversal attempts', () => {
      expect(() => parseRepository('valid/../evil')).toThrow(
        'Invalid repository format', // Three parts split by /
      );
      expect(() => parseRepository('https://github.com/valid/..%2Fevil')).toThrow(
        'contains parent directory references (..)',
      );
      expect(() => parseRepository('valid/repo..')).toThrow(
        'contains parent directory references (..)', // Direct .. check
      );
    });
  });
});

describe('stringifyRepository', () => {
  it('should format repository as owner/repo', () => {
    const result = stringifyRepository({ owner: 'octocat', repo: 'hello-world' });
    expect(result).toBe('octocat/hello-world');
  });
});
