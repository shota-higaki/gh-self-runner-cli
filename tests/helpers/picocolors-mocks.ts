import { type Mock, vi } from 'vitest';

export interface PicocolorsMocks {
  green: Mock;
  red: Mock;
  yellow: Mock;
  blue: Mock;
  cyan: Mock;
  magenta: Mock;
  white: Mock;
  gray: Mock;
  dim: Mock;
  bold: Mock;
  underline: Mock;
  italic: Mock;
}

export function createPicocolorsMocks(): PicocolorsMocks {
  const colorFn = (text: string) => text;

  return {
    green: vi.fn(colorFn),
    red: vi.fn(colorFn),
    yellow: vi.fn(colorFn),
    blue: vi.fn(colorFn),
    cyan: vi.fn(colorFn),
    magenta: vi.fn(colorFn),
    white: vi.fn(colorFn),
    gray: vi.fn(colorFn),
    dim: vi.fn(colorFn),
    bold: vi.fn(colorFn),
    underline: vi.fn(colorFn),
    italic: vi.fn(colorFn),
  };
}

export function setupPicocolorsMocks() {
  const mocks = createPicocolorsMocks();

  vi.mock('picocolors', () => ({ default: mocks }));

  return mocks;
}
