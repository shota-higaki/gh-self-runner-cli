import { describe, expect, it } from 'vitest';
import { initCommand } from '../../../../src/cli/commands/init.js';

describe('init command', () => {
  it('should have correct command properties', () => {
    expect(initCommand.name()).toBe('init');
    expect(initCommand.description()).toBe(
      'Initialize runner configuration for a repository (interactive)',
    );
    expect(initCommand.options).toHaveLength(0);
  });
});
