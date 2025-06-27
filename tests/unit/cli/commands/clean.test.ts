import { describe, expect, it } from 'vitest';
import { cleanCommand } from '../../../../src/cli/commands/clean.js';

describe('clean command', () => {
  it('should have correct command properties', () => {
    expect(cleanCommand.name()).toBe('clean');
    expect(cleanCommand.description()).toBe('Clean up all configured runners');
    expect(cleanCommand.options).toHaveLength(1);

    const configOption = cleanCommand.options[0];
    expect(configOption.flags).toBe('-c, --config <file>');
    expect(configOption.description).toBe('Configuration file path');
  });
});
