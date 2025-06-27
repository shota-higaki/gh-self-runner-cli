/**
 * Custom error class for CLI errors with exit codes
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * Error types with specific exit codes
 */
export const ErrorCodes = {
  GENERAL_ERROR: 1,
  INVALID_INPUT: 2,
  AUTHENTICATION_ERROR: 3,
  NETWORK_ERROR: 4,
  FILE_SYSTEM_ERROR: 5,
  CONFIGURATION_ERROR: 6,
  PERMISSION_ERROR: 7,
  NOT_FOUND: 8,
  ALREADY_EXISTS: 9,
  TIMEOUT: 10,
} as const;

/**
 * Create authentication error
 */
export function authenticationError(details?: string): CLIError {
  return new CLIError(
    'Authentication failed',
    ErrorCodes.AUTHENTICATION_ERROR,
    details || 'Please check your GitHub token or use GitHub CLI authentication',
  );
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  if (errorWithCode.code === 'ETIMEDOUT') {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}

/**
 * Format error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unknown error occurred';
}
