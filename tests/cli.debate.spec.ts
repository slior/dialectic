// Mock OpenAI SDK to avoid network calls during CLI tests
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      public chat = {
        completions: {
          create: async (_: any) => ({ choices: [{ message: { content: 'Solution text' } }] }),
        },
      };
      constructor(_opts: any) {}
    },
  };
});

import { runCli } from '../src/cli/index';
import { EXIT_CONFIG_ERROR } from '../src/utils/exit-codes';

describe('CLI debate command', () => {
  const originalEnv = process.env;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits with config error when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(runCli(['debate', 'Design a system'])).rejects.toHaveProperty('code', EXIT_CONFIG_ERROR);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('prints only minimal solution to stdout (non-verbose)', async () => {
    process.env.OPENAI_API_KEY = 'test';
    // This will fail until CLI and mocks are wired; keeping RED.
    await runCli(['debate', 'Design a rate limiting system']);
    expect(stdoutSpy).toHaveBeenCalled();
  });
});
