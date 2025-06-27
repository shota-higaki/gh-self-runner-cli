import { describe, expect, it } from 'vitest';
import { CLIError, formatError, isTimeoutError } from '../../../src/utils/errors';

describe('errors', () => {
  describe('CLIError', () => {
    it('should create error with message and exit code', () => {
      const error = new CLIError('Test error', 5);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CLIError);
      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(5);
    });

    it('should have correct name', () => {
      const error = new CLIError('Test error', 1);

      expect(error.name).toBe('CLIError');
    });

    it('should default exit code to 1', () => {
      const error = new CLIError('Test error');

      expect(error.exitCode).toBe(1);
    });
  });

  describe('isTimeoutError', () => {
    it('should return true for timeout errors', () => {
      const error = new Error();
      (error as any).code = 'ETIMEDOUT';

      expect(isTimeoutError(error)).toBe(true);
    });

    it('should return true for timeout messages', () => {
      const error = new Error('Request timeout');

      expect(isTimeoutError(error)).toBe(true);
    });

    it('should return true for timed out messages', () => {
      const error = new Error('Operation timed out');

      expect(isTimeoutError(error)).toBe(true);
    });

    it('should return false for non-timeout errors', () => {
      const error = new Error('Some other error');

      expect(isTimeoutError(error)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isTimeoutError('string error')).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError(undefined)).toBe(false);
      expect(isTimeoutError(123)).toBe(false);
    });
  });

  describe('formatError', () => {
    it('should format Error objects', () => {
      const error = new Error('Test error message');

      const result = formatError(error);

      expect(result).toBe('Test error message');
    });

    it('should format CLIError objects', () => {
      const error = new CLIError('CLI error message', 3);

      const result = formatError(error);

      expect(result).toBe('CLI error message');
    });

    it('should format string errors', () => {
      const result = formatError('String error');

      expect(result).toBe('String error');
    });

    it('should format unknown error types', () => {
      expect(formatError(123)).toBe('An unknown error occurred');
      expect(formatError(null)).toBe('An unknown error occurred');
      expect(formatError(undefined)).toBe('An unknown error occurred');
      expect(formatError({ message: 'object' })).toBe('An unknown error occurred');
    });
  });
});
