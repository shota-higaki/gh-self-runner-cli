import { describe, expect, it } from 'vitest';
import { statusCommand } from '../../../../src/cli/commands/status.js';

describe('status command', () => {
  it('should have correct command properties', () => {
    expect(statusCommand.name()).toBe('status');
    expect(statusCommand.description()).toBe('Show status of all runners');
    expect(statusCommand.options).toHaveLength(1);

    const configOption = statusCommand.options[0];
    expect(configOption.flags).toBe('-c, --config <file>');
    expect(configOption.description).toBe('Configuration file path');
  });
});
