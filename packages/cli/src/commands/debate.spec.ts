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
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
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
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, loadEnvironmentFile, RoleBasedAgent, DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH, DEFAULT_SUMMARIZATION_METHOD } from 'dialectic-core';
import { loadConfig } from './debate';

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;

const TEST_CONFIG_FILENAME = 'test-config.json';

// Test agent configuration constants
const TEST_AGENT_ID = 'test-agent';
const TEST_AGENT_NAME = 'Test Agent';
const TEST_AGENT_ROLE = 'architect';
const TEST_AGENT_MODEL = 'gpt-4';
const TEST_AGENT_PROVIDER = 'openai';
const TEST_AGENT_TEMPERATURE = 0.5;

// Test debate configuration constants
const TEST_DEBATE_ROUNDS = 3;
const TEST_DEBATE_TIMEOUT_MS = 300000;
const TEST_TERMINATION_TYPE = 'fixed';
const TEST_SYNTHESIS_METHOD = 'judge';

/**
 * Helper function to create a test config file path in a temporary directory.
 */
function getTestConfigPath(tmpDir: string): string {
  return path.join(tmpDir, TEST_CONFIG_FILENAME);
}

/**
 * Creates a base test agent configuration.
 * 
 * @param overrides - Optional properties to override in the base agent config.
 * @returns A test agent configuration object.
 */
function createTestAgentConfig(overrides?: Record<string, unknown>) {
  return {
    id: TEST_AGENT_ID,
    name: TEST_AGENT_NAME,
    role: TEST_AGENT_ROLE,
    model: TEST_AGENT_MODEL,
    provider: TEST_AGENT_PROVIDER,
    temperature: TEST_AGENT_TEMPERATURE,
    ...overrides,
  };
}

/**
 * Creates a base test debate configuration.
 * 
 * @param overrides - Optional properties to override in the base debate config.
 * @returns A test debate configuration object.
 */
function createTestDebateConfig(overrides?: Record<string, unknown>) {
  return {
    rounds: TEST_DEBATE_ROUNDS,
    terminationCondition: { type: TEST_TERMINATION_TYPE },
    synthesisMethod: TEST_SYNTHESIS_METHOD,
    includeFullHistory: true,
    timeoutPerRound: TEST_DEBATE_TIMEOUT_MS,
    ...overrides,
  };
}

/**
 * Creates a complete test configuration object with agents and debate settings.
 * 
 * @param agentOverrides - Optional properties to override in the agent config.
 * @param debateOverrides - Optional properties to override in the debate config.
 * @returns A complete test configuration object.
 */
function createTestConfigContent(
  agentOverrides?: Record<string, unknown>,
  debateOverrides?: Record<string, unknown>
) {
  return {
    agents: [createTestAgentConfig(agentOverrides)],
    debate: createTestDebateConfig(debateOverrides),
  };
}

describe('CLI debate command', () => {
  const originalEnv = process.env;
  let consoleErrorSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockedLoadEnvironmentFile.mockClear();
    mockedLoadEnvironmentFile.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits with config error when missing an API key', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(runCli(['debate', 'Design a system'])).rejects.toHaveProperty('code', EXIT_CONFIG_ERROR);
    expect(consoleErrorSpy).toHaveBeenCalled();
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
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStdout.push(String(chunk));
      return true;
    });
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
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
    expect(stderrWriteSpy).toHaveBeenCalledWith(
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
      const customEnvFile = 'custom.env';
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--env-file', customEnvFile]);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(customEnvFile, undefined);
    });

    it('should call loadEnvironmentFile with verbose flag', async () => {
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--verbose']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, true);
    });

    it('should call loadEnvironmentFile with both custom env file and verbose flag', async () => {
      const productionEnvFile = 'production.env';
      process.env.OPENAI_API_KEY = 'test';
      
      await runCli(['debate', 'Design a system', '--env-file', productionEnvFile, '--verbose']);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(productionEnvFile, true);
    });

    it('should handle env loading errors gracefully', async () => {
      const missingEnvFile = 'missing.env';
      process.env.OPENAI_API_KEY = 'test';
      mockedLoadEnvironmentFile.mockImplementation(() => {
        throw new Error(`Environment file not found: ${missingEnvFile}`);
      });
      
      await expect(runCli(['debate', 'Design a system', '--env-file', missingEnvFile]))
        .rejects.toThrow(`Environment file not found: ${missingEnvFile}`);
      
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(missingEnvFile, undefined);
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
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const cfg = await loadConfig(undefined);
      expect(cfg).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = await loadConfig(undefined);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(DEFAULT_SUMMARIZATION_ENABLED);
    expect(cfg.debate?.summarization?.threshold).toBe(DEFAULT_SUMMARIZATION_THRESHOLD);
    expect(cfg.debate?.summarization?.maxLength).toBe(DEFAULT_SUMMARIZATION_MAX_LENGTH);
    expect(cfg.debate?.summarization?.method).toBe(DEFAULT_SUMMARIZATION_METHOD);
    
    consoleErrorSpy.mockRestore();
  });

  it('should load custom summarization config from file', async () => {
    const testThreshold = 3000;
    const testMaxLength = 1500;
    const testMethod = 'length-based';
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      summarization: {
        enabled: false,
        threshold: testThreshold,
        maxLength: testMaxLength,
        method: testMethod,
      },
    });

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(false);
    expect(cfg.debate?.summarization?.threshold).toBe(testThreshold);
    expect(cfg.debate?.summarization?.maxLength).toBe(testMaxLength);
    expect(cfg.debate?.summarization?.method).toBe(testMethod);
  });

  it('should support per-agent summarization override', async () => {
    // System-wide summarization settings
    const systemThreshold = 5000;
    const systemMaxLength = 2500;
    
    // Agent-specific overrides (different from system-wide)
    const agentThreshold = 2000;
    const agentMaxLength = 1000;
    const agentMethod = 'length-based';
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(
      {
        summarization: {
          enabled: true,
          threshold: agentThreshold,
          maxLength: agentMaxLength,
          method: agentMethod,
        },
      },
      {
        summarization: {
          enabled: true,
          threshold: systemThreshold,
          maxLength: systemMaxLength,
          method: 'length-based',
        },
      }
    );

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    // Verify system-wide settings are set
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.threshold).toBe(systemThreshold);
    expect(cfg.debate?.summarization?.maxLength).toBe(systemMaxLength);
    
    // Verify agent overrides system-wide settings
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summarization).toBeDefined();
    expect(agent!.summarization?.enabled).toBe(true);
    expect(agent!.summarization?.threshold).toBe(agentThreshold); // Override, not system value
    expect(agent!.summarization?.maxLength).toBe(agentMaxLength); // Override, not system value
    expect(agent!.summarization?.method).toBe(agentMethod);
  });

  it('should support summaryPromptPath in agent config', async () => {
    const summaryPromptPath = './prompts/custom-summary.md';
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent({
      summaryPromptPath,
    });

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summaryPromptPath).toBe(summaryPromptPath);
  });

  it('should support partial summarization config', async () => {
    const testThreshold = 10000;
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      summarization: {
        threshold: testThreshold,
        // Other fields should use defaults (merged at runtime, not at load time)
      },
    });

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    // Verify the provided field is set correctly
    expect(cfg.debate?.summarization?.threshold).toBe(testThreshold);
    // At load time, only provided fields are set; defaults are merged at runtime
    // This test verifies that partial configs are accepted and loaded correctly
  });
});

describe('CLI clarifications phase', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockedLoadEnvironmentFile.mockClear();
    mockedLoadEnvironmentFile.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
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

    // Using 'as any' is necessary here to access protected methods for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Using 'as any' is necessary here to access protected methods for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: [] });

    await runCli(['debate', 'Design Z']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('truncates questions per agent and warns', async () => {
    // Return 7 questions to trigger truncation to default 5
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `q${i + 1}`, text: `Q${i + 1}` }));
    // Using 'as any' is necessary here to access protected methods for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: many });

    mockReadlineWithAnswers(new Array(10).fill('A'));

    await runCli(['debate', 'Design W', '--clarify']);
    expect(spy).toHaveBeenCalled();
    const stderr = (consoleErrorSpy.mock.calls.map(args => String(args[0])).join(''));
    expect(stderr).toMatch(/limited to 5/);
  });
});

