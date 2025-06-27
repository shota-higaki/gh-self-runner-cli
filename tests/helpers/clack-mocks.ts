import { type Mock, vi } from 'vitest';

export interface ClackMocks {
  intro: Mock;
  outro: Mock;
  spinner: Mock & {
    start: Mock;
    stop: Mock;
    message: Mock;
  };
  text: Mock;
  password: Mock;
  confirm: Mock;
  select: Mock;
  multiselect: Mock;
  note: Mock;
  cancel: Mock;
  isCancel: Mock;
  log: {
    success: Mock;
    error: Mock;
    warn: Mock;
    info: Mock;
    message: Mock;
  };
}

export function createClackMocks(): ClackMocks {
  const spinner = {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  };

  const spinnerMock = vi.fn().mockReturnValue(spinner);
  Object.assign(spinnerMock, spinner);

  return {
    intro: vi.fn(),
    outro: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: Mock type casting
    spinner: spinnerMock as any,
    text: vi.fn(),
    password: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    note: vi.fn(),
    cancel: vi.fn(),
    isCancel: vi.fn().mockReturnValue(false),
    log: {
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      message: vi.fn(),
    },
  };
}

export function setupClackMocks() {
  const mocks = createClackMocks();

  vi.mock('@clack/prompts', () => mocks);

  return mocks;
}
