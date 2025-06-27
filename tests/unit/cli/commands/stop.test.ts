import { describe, expect, it } from 'vitest';
import { stopCommand } from '../../../../src/cli/commands/stop.js';

describe('stop command', () => {
  it('should have correct command properties', () => {
    expect(stopCommand.name()).toBe('stop');
    expect(stopCommand.description()).toBe('Stop runners (interactive)');
    expect(stopCommand.options).toHaveLength(1);

    const configOption = stopCommand.options[0];
    expect(configOption.flags).toBe('-c, --config <file>');
    expect(configOption.description).toBe('Configuration file path');
  });
});
