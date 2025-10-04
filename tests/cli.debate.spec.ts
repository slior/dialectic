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
    await runCli(['debate', 'Design a rate limiting system']);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('prints verbose header and summary with metadata when --verbose', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const captured: string[] = [];
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      captured.push(String(chunk));
      return true as any;
    });

    await runCli(['debate', 'Design X', '--rounds', '2', '--verbose']);

    const out = captured.join('');
    expect(out).toContain('Running debate (verbose)');
    expect(out).toContain('Summary (verbose)');
    expect(out).toMatch(/Round\s+1/);
    expect(out).toMatch(/\[Round\s+1\]\s+proposal\s+complete/);
    expect(out).toMatch(/latency=.+, tokens=/);

    writeSpy.mockRestore();
  });
});
