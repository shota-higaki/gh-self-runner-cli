import { describe, expect, it } from 'vitest';
import { startCommand } from '../../../../src/cli/commands/start.js';

describe('start command', () => {
  it('should have correct command properties', () => {
    expect(startCommand.name()).toBe('start');
    expect(startCommand.description()).toBe('Start GitHub runners (interactive)');
    expect(startCommand.options).toHaveLength(1);

    const configOption = startCommand.options[0];
    expect(configOption.flags).toBe('-c, --config <file>');
    expect(configOption.description).toBe('Configuration file path');
  });
});
