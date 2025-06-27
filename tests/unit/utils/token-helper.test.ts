import { getTokenType } from '../../../src/utils/token-helper';

describe('token-helper', () => {
  describe('getTokenType', () => {
    it('should identify Personal Access Token (classic)', () => {
      expect(getTokenType('ghp_1234567890')).toBe('Personal Access Token (classic)');
    });

    it('should identify Personal Access Token (fine-grained)', () => {
      expect(getTokenType('github_pat_1234567890')).toBe('Personal Access Token (fine-grained)');
    });

    it('should identify OAuth App token', () => {
      expect(getTokenType('ghs_1234567890')).toBe('OAuth App token');
    });

    it('should identify GitHub App user token', () => {
      expect(getTokenType('ghu_1234567890')).toBe('GitHub App user token');
    });

    it('should return generic GitHub token for unknown prefixes', () => {
      expect(getTokenType('unknown_token')).toBe('GitHub token');
    });
  });
});
