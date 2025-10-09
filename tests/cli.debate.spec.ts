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

// Mock env-loader
jest.mock('../src/utils/env-loader', () => ({
  loadEnvironmentFile: jest.fn()
}));

import { runCli } from '../src/cli/index';
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS } from '../src/utils/exit-codes';
import { loadEnvironmentFile } from '../src/utils/env-loader';

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;

describe('CLI debate command', () => {
  const originalEnv = process.env;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockedLoadEnvironmentFile.mockClear();
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
    const capturedStdout: string[] = [];
    const capturedStderr: string[] = [];
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      capturedStdout.push(String(chunk));
      return true as any;
    });
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      capturedStderr.push(String(chunk));
      return true as any;
    });

    await runCli(['debate', 'Design X', '--rounds', '2', '--verbose']);

    const stdout = capturedStdout.join('');
    const stderr = capturedStderr.join('');
    
    // Main solution should be on stdout
    expect(stdout).toContain('Solution text');
    
    // Verbose diagnostics should be on stderr
    expect(stderr).toContain('Running debate (verbose)');
    expect(stderr).toContain('Summary (verbose)');
    expect(stderr).toMatch(/Round\s+1/);
    // Progress UI provides real-time updates, verbose summary shows final details
    expect(stderr).toMatch(/latency=.+, tokens=/);

    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  it('should error when neither problem string nor --problemDescription are provided', async () => {
    process.env.OPENAI_API_KEY = 'test';
    
    await expect(runCli(['debate']))
      .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid arguments: problem is required (provide <problem> or --problemDescription)')
    );
  });

  describe('environment file loading', () => {
    it('should call loadEnvironmentFile with default parameters', async () => {
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should call loadEnvironmentFile with custom env file path', async () => {
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--env-file', 'custom.env']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith('custom.env', undefined);
    });

    it('should call loadEnvironmentFile with verbose flag', async () => {
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--verbose']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, true);
    });

    it('should call loadEnvironmentFile with both custom env file and verbose flag', async () => {
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--env-file', 'production.env', '--verbose']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith('production.env', true);
    });

    it('should handle env loading errors gracefully', async () => {
      process.env.OPENAI_API_KEY = 'test';
      mockedLoadEnvironmentFile.mockImplementation(() => {
        throw new Error('Environment file not found: /path/to/missing.env');
      });
      
      await expect(runCli(['debate', 'Design a system', '--env-file', 'missing.env']))
        .rejects.toThrow('Environment file not found: /path/to/missing.env');
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith('missing.env', undefined);
    });
  });
});
