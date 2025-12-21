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
jest.mock('@dialectic/core', () => {
  const actual = jest.requireActual('@dialectic/core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn()
  };
});

// Mock readline module
jest.mock('readline', () => {
  let mockAnswers: string[] = [];
  let currentIndex = 0;
  
  return {
    __esModule: true,
    default: {
      createInterface: () => ({
        question: (_: any, cb: (ans: string) => void) => {
          const ans = currentIndex < mockAnswers.length ? mockAnswers[currentIndex++] : '';
          // Use setImmediate to make it async like real readline
          setImmediate(() => cb(String(ans)));
        },
        close: () => {},
      })
    },
    // Helper function to set mock answers
    __setMockAnswers: (answers: string[]) => {
      mockAnswers = answers;
      currentIndex = 0;
    }
  };
});

import os from 'os';
import path from 'path';
import fs from 'fs';
import { runCli } from '../index';
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, loadEnvironmentFile, RoleBasedAgent, DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH, DEFAULT_SUMMARIZATION_METHOD } from '@dialectic/core';
import { loadConfig } from './debate';

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
    mockedLoadEnvironmentFile.mockReturnValue(undefined);
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

describe('Configuration loading', () => {
  it('uses built-in defaults when ./debate-config.json is missing and emits a stderr notice', async () => {
    const defaultConfigPath = path.resolve(process.cwd(), 'debate-config.json');
    const configExists = fs.existsSync(defaultConfigPath);
    let configBackup: string | undefined;
    
    // Temporarily remove config file if it exists
    if (configExists) {
      configBackup = fs.readFileSync(defaultConfigPath, 'utf-8');
      fs.unlinkSync(defaultConfigPath);
    }
    
    try {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const cfg = await loadConfig(undefined);
      expect(cfg).toBeDefined();
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    } finally {
      // Restore config file if it existed
      if (configExists && configBackup) {
        fs.writeFileSync(defaultConfigPath, configBackup, 'utf-8');
      }
    }
  });
});

describe('Summarization configuration loading', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should load default summarization config when not specified', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cfg = await loadConfig(undefined);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(DEFAULT_SUMMARIZATION_ENABLED);
    expect(cfg.debate?.summarization?.threshold).toBe(DEFAULT_SUMMARIZATION_THRESHOLD);
    expect(cfg.debate?.summarization?.maxLength).toBe(DEFAULT_SUMMARIZATION_MAX_LENGTH);
    expect(cfg.debate?.summarization?.method).toBe(DEFAULT_SUMMARIZATION_METHOD);
    
    stderrSpy.mockRestore();
  });

  it('should load custom summarization config from file', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        summarization: {
          enabled: false,
          threshold: 3000,
          maxLength: 1500,
          method: 'length-based'
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(false);
    expect(cfg.debate?.summarization?.threshold).toBe(3000);
    expect(cfg.debate?.summarization?.maxLength).toBe(1500);
    expect(cfg.debate?.summarization?.method).toBe('length-based');
  });

  it('should support per-agent summarization override', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          summarization: {
            enabled: true,
            threshold: 2000,
            maxLength: 1000,
            method: 'length-based'
          }
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summarization).toBeDefined();
    expect(agent!.summarization?.enabled).toBe(true);
    expect(agent!.summarization?.threshold).toBe(2000);
    expect(agent!.summarization?.maxLength).toBe(1000);
  });

  it('should support summaryPromptPath in agent config', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          summaryPromptPath: './prompts/custom-summary.md'
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summaryPromptPath).toBe('./prompts/custom-summary.md');
  });

  it('should support partial summarization config', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        summarization: {
          threshold: 10000
          // Other fields should use defaults
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.threshold).toBe(10000);
    // Partial config should work with merging at runtime
  });
});

describe('CLI clarifications phase', () => {
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    mockedLoadEnvironmentFile.mockClear();
    mockedLoadEnvironmentFile.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function mockReadlineWithAnswers(answers: string[]) {
    // Set mock answers for the readline mock
    const readlineMock = require('readline');
    if (readlineMock.__setMockAnswers) {
      readlineMock.__setMockAnswers(answers);
    }
  }

  it('runs clarifications when --clarify and collects answers (including NA)', async () => {
    // Two questions total across agents; provide one answer and one empty -> NA
    mockReadlineWithAnswers(['My answer', '']);

    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValueOnce({ questions: [{ id: 'q1', text: 'What is the SLA?' }] })
      .mockResolvedValueOnce({ questions: [{ id: 'q1', text: 'Any data retention rules?' }] });

    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);

    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport]);

    expect(spy).toHaveBeenCalled();
    const content = fs.readFileSync(tmpReport, 'utf-8');
    expect(content).toContain('## Clarifications');
    expect(content).toContain('Question (q1):');
    // Should include the explicit answer
    expect(content).toContain('My answer');
    // And NA for the unanswered one
    expect(content).toContain('\n```text\nNA\n```');
  });

  it('does not run clarifications without --clarify (default off)', async () => {
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: [] });

    await runCli(['debate', 'Design Z']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('truncates questions per agent and warns', async () => {
    // Return 7 questions to trigger truncation to default 5
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `q${i + 1}`, text: `Q${i + 1}` }));
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: many });

    mockReadlineWithAnswers(new Array(10).fill('A'));

    await runCli(['debate', 'Design W', '--clarify']);
    expect(spy).toHaveBeenCalled();
    const stderr = (stderrSpy.mock.calls.map(args => String(args[0])).join(''));
    expect(stderr).toMatch(/limited to 5/);
  });
});

