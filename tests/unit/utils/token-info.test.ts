import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { getTokenInfo } from '../../../src/utils/token-info.js';

describe('token-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getTokenInfo', () => {
    it('should return full info for GitHub CLI token', async () => {
      const mockApiResponse = JSON.stringify({
        login: 'testuser',
        name: 'Test User',
      });

      vi.mocked(execSync).mockReturnValue(mockApiResponse as any);

      const result = await getTokenInfo('gho_testtoken123');

      expect(result).toEqual({
        source: 'github-cli',
        username: 'testuser',
        displayName: 'Test User',
        tokenType: 'OAuth Token',
      });

      expect(execSync).toHaveBeenCalledWith(
        'gh api user -H "Authorization: token gho_testtoken123"',
        { encoding: 'utf8' },
      );
    });

    it('should handle user without display name', async () => {
      const mockApiResponse = JSON.stringify({
        login: 'testuser',
      });

      vi.mocked(execSync).mockReturnValue(mockApiResponse as any);

      const result = await getTokenInfo('ghp_testtoken123');

      expect(result).toEqual({
        source: 'personal-access-token',
        username: 'testuser',
        displayName: 'testuser',
        tokenType: 'Personal Access Token',
      });
    });

    it('should handle invalid API response', async () => {
      vi.mocked(execSync).mockReturnValue('invalid json' as any);

      const result = await getTokenInfo('ghp_testtoken123');

      expect(result).toEqual({
        source: 'personal-access-token',
        username: 'Unknown',
        displayName: 'Unknown',
        tokenType: 'Personal Access Token',
      });
    });

    it('should handle API call failure', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('API failed');
      });

      const result = await getTokenInfo('ghp_testtoken123');

      expect(result).toEqual({
        source: 'personal-access-token',
        username: 'Unknown',
        displayName: 'Unknown',
        tokenType: 'Personal Access Token',
      });
    });

    it('should identify OAuth tokens', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('API failed');
      });

      const result = await getTokenInfo('gho_testtoken123');

      expect(result.source).toBe('github-cli');
      expect(result.tokenType).toBe('OAuth Token');
    });

    it('should identify server-to-server tokens', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('API failed');
      });

      const result = await getTokenInfo('ghs_testtoken123');

      expect(result.source).toBe('personal-access-token');
      expect(result.tokenType).toBe('Server-to-Server Token');
    });

    it('should identify new format PAT tokens', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('API failed');
      });

      const result = await getTokenInfo('github_pat_testtoken123');

      expect(result.source).toBe('personal-access-token');
      expect(result.tokenType).toBe('Personal Access Token');
    });

    it('should handle unknown token formats', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('API failed');
      });

      const result = await getTokenInfo('unknown_format_token');

      expect(result).toEqual({
        source: 'personal-access-token',
        username: 'Unknown',
        displayName: 'Unknown',
        tokenType: 'Unknown Token Type',
      });
    });
  });
});
