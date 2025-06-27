import { beforeAll, vi } from 'vitest';

// Setup global mocks in beforeAll to ensure they're available for ESM
beforeAll(() => {
  // Mock @clack/prompts globally
  vi.doMock('@clack/prompts', () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    note: vi.fn(),
    isCancel: vi.fn().mockReturnValue(false),
    text: vi.fn(),
    password: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    })),
    log: {
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      message: vi.fn(),
    },
  }));

  // Mock picocolors globally
  vi.doMock('picocolors', () => ({
    default: {
      green: (s: string) => s,
      red: (s: string) => s,
      yellow: (s: string) => s,
      cyan: (s: string) => s,
      dim: (s: string) => s,
      bold: (s: string) => s,
      white: (s: string) => s,
      gray: (s: string) => s,
      blue: (s: string) => s,
      magenta: (s: string) => s,
      underline: (s: string) => s,
      italic: (s: string) => s,
    },
  }));
});
