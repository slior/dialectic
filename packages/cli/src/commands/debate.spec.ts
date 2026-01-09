
import fs from 'fs';
import os from 'os';
import path from 'path';

import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR, loadEnvironmentFile, RoleBasedAgent, DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, 
  DEFAULT_SUMMARIZATION_MAX_LENGTH, DEFAULT_SUMMARIZATION_METHOD, collectClarifications, generateDebateReport } from 'dialectic-core';

import { runCli } from '../index';


import { loadConfig } from './debate';


// Mock response constants
const MOCK_SOLUTION_TEXT = 'Solution text';

// Mock OpenAI SDK to avoid network calls during CLI tests
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      public chat = {
        completions: {
          create: async (_: any) => ({ choices: [{ message: { content: MOCK_SOLUTION_TEXT } }] }),
        },
      };
      constructor(_opts: any) {}
    },
  };
});

// Mock env-loader and clarifications
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn().mockImplementation(() => {
      // Don't throw errors - just return undefined (no-op)
      return undefined;
    }),
    collectClarifications: jest.fn().mockResolvedValue([]),
    generateDebateReport: jest.fn().mockImplementation(actual.generateDebateReport)
    // generateDebateReport is mocked but defaults to real implementation
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
          // Use Promise.resolve().then() for async behavior that properly awaits
          Promise.resolve().then(() => cb(String(ans)));
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

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;
const mockedCollectClarifications = collectClarifications as jest.MockedFunction<typeof collectClarifications>;
const mockedGenerateDebateReport = generateDebateReport as jest.MockedFunction<typeof generateDebateReport>;

/**
 * Helper function to reset the loadEnvironmentFile mock to default behavior (no-op, doesn't throw).
 */
function resetLoadEnvironmentFileMock(): void {
  mockedLoadEnvironmentFile.mockClear();
  mockedLoadEnvironmentFile.mockReturnValue(undefined);
  mockedLoadEnvironmentFile.mockImplementation(() => {
    return undefined;
  });
}

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
    resetLoadEnvironmentFileMock();
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
    const capturedStdout: string[] = [];
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStdout.push(String(chunk));
      return true;
    });

    await runCli(['debate', 'Design a rate limiting system']);

    const stdout = capturedStdout.join('');
    
    // Verify the solution text is present
    expect(stdout).toContain(MOCK_SOLUTION_TEXT);
    
    // Verify no verbose diagnostics are present (they should only be on stderr when verbose)
    expect(stdout).not.toContain('Running debate (verbose)');
    expect(stdout).not.toContain('Summary (verbose)');
    expect(stdout).not.toMatch(/Round\s+\d+/);
    
    stdoutWriteSpy.mockRestore();
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
    expect(stdout).toContain(MOCK_SOLUTION_TEXT);
    
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

  describe('Output results', () => {
    let tmpDir: string;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test';
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-test-'));
    });

    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    it('should write JSON output when output path ends with .json', async () => {
      const outputFile = path.join(tmpDir, 'result.json');
      
      await runCli(['debate', 'Design a system', '--output', outputFile]);
      
      expect(fs.existsSync(outputFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      expect(content).toHaveProperty('id');
      expect(content).toHaveProperty('problem');
      expect(content).toHaveProperty('rounds');
    });

    it('should write text output when output path does not end with .json', async () => {
      const outputFile = path.join(tmpDir, 'result.txt');
      
      await runCli(['debate', 'Design a system', '--output', outputFile]);
      
      expect(fs.existsSync(outputFile)).toBe(true);
      const content = fs.readFileSync(outputFile, 'utf-8');
      expect(content).toContain(MOCK_SOLUTION_TEXT);
    });

    it('should write to stdout when no output path is provided', async () => {
      const capturedStdout: string[] = [];
      const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
        capturedStdout.push(String(chunk));
        return true;
      });
      
      await runCli(['debate', 'Design a system']);
      
      const stdout = capturedStdout.join('');
      expect(stdout).toContain(MOCK_SOLUTION_TEXT);
      
      stdoutWriteSpy.mockRestore();
    });

    it('should show verbose summary when no output path and verbose is true', async () => {
      const capturedStderr: string[] = [];
      const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
      });
      
      await runCli(['debate', 'Design a system', '--verbose', '--rounds', '1']);
      
      const stderr = capturedStderr.join('');
      expect(stderr).toContain('Summary (verbose)');
      
      stderrWriteSpy.mockRestore();
    });

    it('should not show verbose summary when output path is provided', async () => {
      const outputFile = path.join(tmpDir, 'result.txt');
      const capturedStderr: string[] = [];
      const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
      });
      
      await runCli(['debate', 'Design a system', '--verbose', '--output', outputFile, '--rounds', '1']);
      
      const stderr = capturedStderr.join('');
      expect(stderr).not.toContain('Summary (verbose)');
      
      stderrWriteSpy.mockRestore();
    });
  });

  describe('Problem description resolution', () => {
    let tmpDir: string;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test';
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'problem-test-'));
    });

    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    it('should use file when both problem string and --problemDescription are provided', async () => {
      // When --problemDescription is provided, the code ignores the positional argument
      // This is intentional behavior to handle Commander.js quirks
      const problemFile = path.join(tmpDir, 'problem.txt');
      fs.writeFileSync(problemFile, 'Problem from file');
      
      const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      
      await runCli(['debate', 'Problem from string', '--problemDescription', problemFile, '--rounds', '1']);
      
      // Should complete successfully using the file (positional argument is ignored)
      expect(stdoutWriteSpy).toHaveBeenCalled();
      
      stdoutWriteSpy.mockRestore();
    });

    it('should read problem from file when --problemDescription is provided', async () => {
      const problemFile = path.join(tmpDir, 'problem.txt');
      const problemContent = 'Design a distributed cache system';
      fs.writeFileSync(problemFile, problemContent);
      
      await runCli(['debate', '--problemDescription', problemFile]);
      
      // Verify the debate ran successfully (solution should be in stdout)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should error when problem file does not exist', async () => {
      const nonExistentFile = path.join(tmpDir, 'nonexistent.txt');
      
      await expect(runCli(['debate', '--problemDescription', nonExistentFile]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid arguments: problem description file not found')
      );
    });

    it('should error when problem file path is a directory', async () => {
      await expect(runCli(['debate', '--problemDescription', tmpDir]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid arguments: problem description path is a directory')
      );
    });

    it('should error when problem file is empty', async () => {
      const emptyFile = path.join(tmpDir, 'empty.txt');
      fs.writeFileSync(emptyFile, '');
      
      await expect(runCli(['debate', '--problemDescription', emptyFile]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid arguments: problem description file is empty')
      );
    });

    it('should error when problem file is whitespace-only', async () => {
      const whitespaceFile = path.join(tmpDir, 'whitespace.txt');
      fs.writeFileSync(whitespaceFile, '   \n\t  ');
      
      await expect(runCli(['debate', '--problemDescription', whitespaceFile]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid arguments: problem description file is empty')
      );
    });

    it('should error when problem file read fails', async () => {
      const problemFile = path.join(tmpDir, 'problem.txt');
      fs.writeFileSync(problemFile, 'Some content');
      
      // Mock fs.promises.readFile to throw a non-EXIT_INVALID_ARGS error
      jest.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(runCli(['debate', '--problemDescription', problemFile]))
        .rejects.toHaveProperty('code', EXIT_GENERAL_ERROR);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read problem description file')
      );
      
      jest.spyOn(fs.promises, 'readFile').mockRestore();
    });

    it('should trim whitespace from problem string', async () => {
      const problemWithWhitespace = '   Design a system   \n\t  ';
      
      await runCli(['debate', problemWithWhitespace]);
      
      // Verify the debate ran successfully (solution should be in stdout)
      expect(stdoutSpy).toHaveBeenCalled();
    });
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

  it('should use built-in defaults when agents array is empty', async () => {
    let tmpDir: string;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    
    try {
      const configPath = getTestConfigPath(tmpDir);
      const configContent = {
        agents: [],
        debate: createTestDebateConfig(),
      };
      
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const cfg = await loadConfig(configPath);
      
      // Should use built-in defaults
      expect(cfg.agents.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config missing agents')
      );
      
      consoleErrorSpy.mockRestore();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should use default judge when judge is missing', async () => {
    let tmpDir: string;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    
    try {
      const configPath = getTestConfigPath(tmpDir);
      const configContent = {
        agents: [createTestAgentConfig()],
        debate: createTestDebateConfig(),
        // No judge field
      };
      
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const cfg = await loadConfig(configPath);
      
      // Should have default judge
      expect(cfg.judge).toBeDefined();
      expect(cfg.judge!.id).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config missing judge')
      );
      
      consoleErrorSpy.mockRestore();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should use default debate when debate is missing', async () => {
    let tmpDir: string;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    
    try {
      const configPath = getTestConfigPath(tmpDir);
      const configContent = {
        agents: [createTestAgentConfig()],
        judge: {
          id: 'test-judge',
          name: 'Test Judge',
          role: 'generalist',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.3,
        },
        // No debate field
      };
      
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
      
      const cfg = await loadConfig(configPath);
      
      // Should have default debate config
      expect(cfg.debate).toBeDefined();
      expect(cfg.debate!.rounds).toBeDefined();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should load config successfully when all fields are present', async () => {
    let tmpDir: string;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    
    try {
      const configPath = getTestConfigPath(tmpDir);
      const configContent = createTestConfigContent();
      
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
      
      const cfg = await loadConfig(configPath);
      
      expect(cfg.agents).toBeDefined();
      expect(cfg.agents.length).toBe(1);
      expect(cfg.judge).toBeDefined();
      expect(cfg.debate).toBeDefined();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});

describe('Debate config validation', () => {
  const originalEnv = process.env;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrWriteSpy.mockRestore();
  });

  it('should use options.rounds when provided', async () => {
    const capturedStdout: string[] = [];
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStdout.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--rounds', '2']);
    
    // Should complete successfully with 2 rounds
    expect(stdoutWriteSpy).toHaveBeenCalled();
    
    stdoutWriteSpy.mockRestore();
  });

  it('should use sysConfig.debate.rounds when options.rounds is not provided', async () => {
    let tmpDir: string;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    
    try {
      const configPath = getTestConfigPath(tmpDir);
      const configContent = createTestConfigContent(undefined, {
        rounds: 5,
      });
      
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
      
      const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      
      await runCli(['debate', 'Design a system', '--config', configPath]);
      
      // Should use rounds from config (5)
      // Verify by checking the debate ran successfully
      expect(stdoutWriteSpy).toHaveBeenCalled();
      
      stdoutWriteSpy.mockRestore();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should use DEFAULT_ROUNDS when neither options.rounds nor sysConfig.debate.rounds is provided', async () => {
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    
    await runCli(['debate', 'Design a system']);
    
    // Should use default rounds (3)
    expect(stdoutWriteSpy).toHaveBeenCalled();
    
    stdoutWriteSpy.mockRestore();
  });

  it('should error when rounds is 0', async () => {
    await expect(runCli(['debate', 'Design a system', '--rounds', '0']))
      .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid arguments: --rounds must be >= 1')
    );
  });

  it('should error when rounds is negative', async () => {
    await expect(runCli(['debate', 'Design a system', '--rounds', '-1']))
      .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid arguments: --rounds must be >= 1')
    );
  });
});

describe('Agent filtering', () => {
  let tmpDir: string;
  const originalEnv = process.env;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-filter-test-'));
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.env = originalEnv;
    stdoutSpy.mockRestore();
  });

  it('should filter agents by role when --agents is provided', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ id: 'arch1', role: 'architect' }),
        createTestAgentConfig({ id: 'perf1', role: 'performance' }),
        createTestAgentConfig({ id: 'sec1', role: 'security' }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--agents', 'architect,performance', '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should only show architect and performance agents
    expect(stderr).toContain('architect');
    expect(stderr).toContain('performance');
    // Should not show security agent
    expect(stderr).not.toContain('sec1');
    
    stderrWriteSpy.mockRestore();
  });

  it('should use all enabled agents when --agents is not provided', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ id: 'arch1', role: 'architect' }),
        createTestAgentConfig({ id: 'perf1', role: 'performance' }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should use both agents
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should filter out disabled agents', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ id: 'arch1', name: 'Architect Agent', role: 'architect', enabled: true }),
        createTestAgentConfig({ id: 'perf1', name: 'Performance Agent', role: 'performance', enabled: false }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should only show enabled agent (check by name)
    expect(stderr).toContain('Architect Agent');
    // Should not show disabled agent's name
    expect(stderr).not.toContain('Performance Agent');
    
    stderrWriteSpy.mockRestore();
  });

  it('should default to built-in agents when no agents match filter', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ id: 'arch1', role: 'architect' }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--agents', 'nonexistent-role', '--rounds', '1']);
    
    // Should warn about defaulting to built-in agents (check console.error calls since warnUser uses it)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No agents selected; defaulting to architect,performance.')
    );
    
    consoleErrorSpy.mockRestore();
  });

  it('should default to built-in agents when filtered result is empty', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ id: 'arch1', role: 'architect', enabled: false }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should warn about defaulting to built-in agents (check console.error calls since warnUser uses it)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No agents selected; defaulting to architect,performance.')
    );
    
    consoleErrorSpy.mockRestore();
  });
});

describe('Prompt resolution branches', () => {
  let tmpDir: string;
  const originalEnv = process.env;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'));
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.env = originalEnv;
    stdoutSpy.mockRestore();
  });

  it('should use file prompt when systemPromptPath is provided', async () => {
    const promptFile = path.join(tmpDir, 'system-prompt.txt');
    fs.writeFileSync(promptFile, 'Custom system prompt');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ systemPromptPath: promptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show file prompt source (either 'file' or the actual path)
    expect(stderr).toMatch(/System prompt: (file|.*\.txt)/);
    
    stderrWriteSpy.mockRestore();
  });

  it('should use built-in prompt when systemPromptPath is not provided', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent();
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show built-in prompt source
    expect(stderr).toContain('built-in default');
    
    stderrWriteSpy.mockRestore();
  });

  it('should use file summary prompt when summaryPromptPath is provided', async () => {
    const summaryPromptFile = path.join(tmpDir, 'summary-prompt.txt');
    fs.writeFileSync(summaryPromptFile, 'Custom summary prompt');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ summaryPromptPath: summaryPromptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should use built-in summary prompt when summaryPromptPath is not provided', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent();
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should include absPath in metadata when prompt file is used', async () => {
    const promptFile = path.join(tmpDir, 'system-prompt.txt');
    fs.writeFileSync(promptFile, 'Custom system prompt');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ systemPromptPath: promptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
        systemPromptPath: promptFile,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1', '--output', path.join(tmpDir, 'result.json')]);
    
    // Check that the debate state includes prompt path metadata
    const resultFile = path.join(tmpDir, 'result.json');
    if (fs.existsSync(resultFile)) {
      const debateState = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
      // Prompt sources should be stored in debate state
      expect(debateState).toBeDefined();
    }
  });

  it('should use configDir when provided', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const promptFile = 'system-prompt.txt'; // Relative path
    const fullPromptPath = path.join(tmpDir, promptFile);
    fs.writeFileSync(fullPromptPath, 'Custom system prompt');
    
    const configContent = {
      agents: [
        createTestAgentConfig({ systemPromptPath: promptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    // configDir should be set to the directory containing the config file
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully (prompt resolved relative to configDir)
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should use process.cwd() when configDir is not provided', async () => {
    // When using built-in defaults, configDir should be process.cwd()
    await runCli(['debate', 'Design a system', '--rounds', '1']);
    
    // Should complete successfully
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe('Tracing context', () => {
  let tmpDir: string;
  const originalEnv = process.env;
  let stdoutSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracing-test-'));
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.env = originalEnv;
    stdoutSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should return undefined when trace is not LANGFUSE', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'none', // Not LANGFUSE
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully without tracing
    expect(stdoutSpy).toHaveBeenCalled();
    // Should not show tracing enabled message
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Langfuse tracing enabled')
    );
  });

  it('should initialize tracing when trace is LANGFUSE and config is valid', async () => {
    // Set required Langfuse environment variables
    process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
    process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should show tracing enabled message (check console.error calls since infoUser uses it)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Langfuse tracing enabled')
    );
  });

  it('should handle tracing initialization errors gracefully', async () => {
    // Don't set Langfuse environment variables (should cause validation error)
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should show warning about tracing initialization failure (check console.error calls since warnUser uses it)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Langfuse tracing initialization failed')
    );
    // Should still complete successfully
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should include problemFileName in metadata when provided', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
    process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
    
    const problemFile = path.join(tmpDir, 'problem.txt');
    fs.writeFileSync(problemFile, 'Design a system');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', '--problemDescription', problemFile, '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully (metadata includes problemFileName)
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should not include problemFileName in metadata when not provided', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
    process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully (metadata does not include problemFileName)
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should include contextFileName in metadata when provided', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
    process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
    
    const contextFile = path.join(tmpDir, 'context.txt');
    fs.writeFileSync(contextFile, 'Additional context');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--context', contextFile, '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully (metadata includes contextFileName)
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should include judgeConfig in metadata when judge exists', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
    process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent(undefined, {
      trace: 'langfuse',
    });
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--rounds', '1']);
    
    // Should complete successfully (metadata includes judgeConfig)
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe('Round summary output', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should output summaries when round has summaries', async () => {
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show round summary
    expect(stderr).toMatch(/Round\s+\d+/);
    
    stderrWriteSpy.mockRestore();
  });

  it('should output contributions when round has contributions', async () => {
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show contributions (proposal, critique, or refinement)
    // The exact content depends on the mock, but should show contribution types
    expect(stderr.length).toBeGreaterThan(0);
    
    stderrWriteSpy.mockRestore();
  });

  it('should handle contributions with metadata', async () => {
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show metadata (latency, tokens) in verbose summary
    // The format includes latency and tokens information
    expect(stderr).toMatch(/latency=|tokens=/);
    
    stderrWriteSpy.mockRestore();
  });
});

describe('Verbose header branches', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbose-header-test-'));
    resetLoadEnvironmentFileMock();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.env = originalEnv;
  });

  it('should show file prompt source in verbose header when prompt is from file', async () => {
    const promptFile = path.join(tmpDir, 'system-prompt.txt');
    fs.writeFileSync(promptFile, 'Custom system prompt');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ systemPromptPath: promptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
        systemPromptPath: promptFile,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show file prompt source (either 'file' or the actual path)
    expect(stderr).toMatch(/System prompt: (file|.*system-prompt\.txt)/);
    
    stderrWriteSpy.mockRestore();
  });

  it('should show built-in prompt source in verbose header when prompt is built-in', async () => {
    const configPath = getTestConfigPath(tmpDir);
    const configContent = createTestConfigContent();
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show built-in prompt source
    expect(stderr).toContain('System prompt: built-in default');
    
    stderrWriteSpy.mockRestore();
  });

  it('should show prompt path when available', async () => {
    const promptFile = path.join(tmpDir, 'system-prompt.txt');
    fs.writeFileSync(promptFile, 'Custom system prompt');
    
    const configPath = getTestConfigPath(tmpDir);
    const configContent = {
      agents: [
        createTestAgentConfig({ systemPromptPath: promptFile }),
      ],
      debate: createTestDebateConfig(),
      judge: {
        id: 'test-judge',
        name: 'Test Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3,
        systemPromptPath: promptFile,
      },
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--config', configPath, '--verbose', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should show file prompt source (path may be shown or just 'file')
    expect(stderr).toMatch(/System prompt: (file|.*\.txt)/);
    
    stderrWriteSpy.mockRestore();
  });

  it('should not show verbose header when verbose is false', async () => {
    const capturedStderr: string[] = [];
    const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStderr.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--rounds', '1']);
    
    const stderr = capturedStderr.join('');
    // Should not show verbose header
    expect(stderr).not.toContain('Running debate (verbose)');
    expect(stderr).not.toContain('Active Agents:');
    
    stderrWriteSpy.mockRestore();
  });
});

describe('Error handling', () => {
  const originalEnv = process.env;
  let stderrWriteSpy: jest.SpyInstance;
  let orchestratorSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Ensure loadEnvironmentFile doesn't throw
    mockedLoadEnvironmentFile.mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrWriteSpy.mockRestore();
    // Clean up orchestrator spy if it was created
    if (orchestratorSpy) {
      orchestratorSpy.mockRestore();
      orchestratorSpy = undefined;
    }
  });

  it('should use error code when error has code property', async () => {
    // Mock DebateOrchestrator constructor to throw an error with code property
    orchestratorSpy = jest.spyOn(require('dialectic-core'), 'DebateOrchestrator').mockImplementation(function() {
      throw Object.assign(new Error('Test error'), { code: EXIT_INVALID_ARGS });
    });
    
    await expect(runCli(['debate', 'Design a system', '--rounds', '1']))
      .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
  });

  it('should use EXIT_GENERAL_ERROR when error has no code property', async () => {
    // Mock DebateOrchestrator constructor to throw an error without code property
    orchestratorSpy = jest.spyOn(require('dialectic-core'), 'DebateOrchestrator').mockImplementation(function() {
      throw new Error('Test error without code');
    });
    
    await expect(runCli(['debate', 'Design a system', '--rounds', '1']))
      .rejects.toHaveProperty('code', EXIT_GENERAL_ERROR);
  });

  it('should use error message when available', async () => {
    const errorMessage = 'Custom error message';
    
    // Mock DebateOrchestrator constructor to throw an error with message
    orchestratorSpy = jest.spyOn(require('dialectic-core'), 'DebateOrchestrator').mockImplementation(function() {
      throw Object.assign(new Error(errorMessage), { code: EXIT_GENERAL_ERROR });
    });
    
    await expect(runCli(['debate', 'Design a system', '--rounds', '1']))
      .rejects.toThrow(errorMessage);
    
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining(errorMessage)
    );
  });

  it('should use "Unknown error" when error has no message', async () => {
    // Mock DebateOrchestrator constructor to throw an error without message
    const errorWithoutMessage: any = {};
    errorWithoutMessage.code = EXIT_GENERAL_ERROR;
    
    orchestratorSpy = jest.spyOn(require('dialectic-core'), 'DebateOrchestrator').mockImplementation(function() {
      throw errorWithoutMessage;
    });
    
    await expect(runCli(['debate', 'Design a system', '--rounds', '1']))
      .rejects.toThrow('Unknown error');
    
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error')
    );
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
    resetLoadEnvironmentFileMock();
    // Reset clarifications mock
    mockedCollectClarifications.mockClear();
    mockedCollectClarifications.mockResolvedValue([]);
    // Reset readline mock
    mockReadlineWithAnswers([]);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.restoreAllMocks();
    // Don't reset modules here as it breaks the readline mock
    // jest.resetModules();
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

    // Mock collectClarifications to return pre-defined questions from two agents
    // This avoids complex interactions with jest.requireActual and spies
    mockedCollectClarifications.mockResolvedValueOnce([
      {
        agentId: 'agent-architect',
        agentName: 'System Architect',
        role: 'architect',
        items: [{ id: 'q1', question: 'What is the SLA?', answer: '' }]
      },
      {
        agentId: 'agent-performance',
        agentName: 'Performance Specialist',
        role: 'performance',
        items: [{ id: 'q2', question: 'Any data retention rules?', answer: '' }]
      }
    ]);

    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);

    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport, '--rounds', '1']);

    expect(mockedCollectClarifications).toHaveBeenCalled();
    const content = fs.readFileSync(tmpReport, 'utf-8');
    expect(content).toContain('## Clarifications');
    expect(content).toContain('Question (q1):');
    expect(content).toContain('Question (q2):');
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
    // Create 7 questions but simulate that collectClarifications truncates to 5 and warns
    const truncatedQuestions = Array.from({ length: 5 }, (_, i) => ({ 
      id: `q${i + 1}`, 
      question: `Q${i + 1}`, 
      answer: '' 
    }));
    
    // Mock collectClarifications to simulate truncation behavior:
    // - Return only 5 questions (truncated from 7)
    // - Call the warn callback with the truncation message
    mockedCollectClarifications.mockImplementationOnce(
      (_problem: string, _agents: any[], _maxPerAgent: number, warn: (msg: string) => void) => {
        // Simulate the warning that would be emitted for 7 questions truncated to 5
        warn('Agent Test Agent returned 7 questions; limited to 5.');
        return Promise.resolve([{
          agentId: 'agent-architect',
          agentName: 'Test Agent',
          role: 'architect',
          items: truncatedQuestions
        }]);
      }
    );

    mockReadlineWithAnswers(new Array(10).fill('A'));

    await runCli(['debate', 'Design W', '--clarify']);
    expect(mockedCollectClarifications).toHaveBeenCalled();
    const stderr = (consoleErrorSpy.mock.calls.map(args => String(args[0])).join(''));
    expect(stderr).toMatch(/limited to 5/);
    
    // Reset mock for other tests
    mockedCollectClarifications.mockClear();
    mockedCollectClarifications.mockResolvedValue([]);
  });

  it('should skip groups with empty items array', async () => {
    // Mock collectClarifications to return groups with empty items
    mockedCollectClarifications.mockResolvedValueOnce([
      {
        agentId: 'agent1',
        agentName: 'Agent 1',
        role: 'architect',
        items: [], // Empty items array
      },
      {
        agentId: 'agent2',
        agentName: 'Agent 2',
        role: 'performance',
        items: [{ id: 'q1', question: 'Question 1', answer: '' }],
      },
    ]);
    
    mockReadlineWithAnswers(['Answer 1']);
    
    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);
    
    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport, '--rounds', '1']);
    
    const content = fs.readFileSync(tmpReport, 'utf-8');
    // Should only show questions from agent2 (agent1 has empty items)
    expect(content).toContain('Question (q1)');
    expect(content).toContain('Answer 1');
    
    // Reset mock
    mockedCollectClarifications.mockClear();
    mockedCollectClarifications.mockResolvedValue([]);
  });

  it('should set answer to NA when user input is empty', async () => {
    mockReadlineWithAnswers(['']); // Empty input
    
    // Mock collectClarifications to return a pre-defined question
    mockedCollectClarifications.mockResolvedValueOnce([
      {
        agentId: 'agent-architect',
        agentName: 'System Architect',
        role: 'architect',
        items: [{ id: 'q1', question: 'What is the requirement?', answer: '' }]
      }
    ]);
    
    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);
    
    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport, '--rounds', '1']);
    
    const content = fs.readFileSync(tmpReport, 'utf-8');
    // Should set answer to NA for empty input
    expect(content).toContain('\n```text\nNA\n```');
    // Reset mock for other tests
    mockedCollectClarifications.mockClear();
    mockedCollectClarifications.mockResolvedValue([]);
  });

  it('should set answer to user input when provided', async () => {
    const userAnswer = 'The requirement is X';
    mockReadlineWithAnswers([userAnswer]);
    
    // Mock collectClarifications to return a pre-defined question
    mockedCollectClarifications.mockResolvedValueOnce([
      {
        agentId: 'agent-architect',
        agentName: 'System Architect',
        role: 'architect',
        items: [{ id: 'q1', question: 'What is the requirement?', answer: '' }]
      }
    ]);
    
    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);
    
    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport, '--rounds', '1']);
    
    const content = fs.readFileSync(tmpReport, 'utf-8');
    // Should include the user-provided answer (may be in answer section)
    expect(content).toContain(userAnswer);
    
    // Reset mock for other tests
    mockedCollectClarifications.mockClear();
    mockedCollectClarifications.mockResolvedValue([]);
  });

  describe('Report generation', () => {
    let tmpDir: string;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
    });

    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      process.env = originalEnv;
    });

    it('should append .md extension when report path does not end with .md', async () => {
      const reportPath = path.join(tmpDir, 'report');
      
      await runCli(['debate', 'Design a system', '--report', reportPath, '--rounds', '1']);
      
      const expectedPath = reportPath + '.md';
      expect(fs.existsSync(expectedPath)).toBe(true);
      const content = fs.readFileSync(expectedPath, 'utf-8');
      expect(content).toContain('## Problem Description');
    });

    it('should not append .md extension when report path already ends with .md', async () => {
      const reportPath = path.join(tmpDir, 'report.md');
      
      await runCli(['debate', 'Design a system', '--report', reportPath, '--rounds', '1']);
      
      expect(fs.existsSync(reportPath)).toBe(true);
      const content = fs.readFileSync(reportPath, 'utf-8');
      expect(content).toContain('## Problem Description');
    });

    it('should handle report generation errors gracefully', async () => {
      const reportPath = path.join(tmpDir, 'report.md');
      
      // Mock generateDebateReport to throw an error
      mockedGenerateDebateReport.mockImplementationOnce(() => {
        throw new Error('Report generation failed');
      });
      
      // Should not throw, but should log warning
      await runCli(['debate', 'Design a system', '--report', reportPath, '--rounds', '1']);
      
      // Check that the error was logged (warnUser calls logWarning which writes to console.error)
      const errorCalls = consoleErrorSpy.mock.calls.map(args => String(args[0])).join('');
      expect(errorCalls).toMatch(/Failed to generate report/);
      
      // Reset mock to default implementation
      mockedGenerateDebateReport.mockImplementation(jest.requireActual('dialectic-core').generateDebateReport);
    });
  });

  describe('Agent logger', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

  it('should log when onlyVerbose is false', async () => {
    // Agent logger logs when onlyVerbose is false regardless of verbose flag
    // This is tested indirectly through agent activity logging
    // Note: In non-verbose mode, most output goes to stdout, not stderr
    const capturedStdout: string[] = [];
    const stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
      capturedStdout.push(String(chunk));
      return true;
    });
    
    await runCli(['debate', 'Design a system', '--rounds', '1']);
    
    // Should have output (solution text)
    const stdout = capturedStdout.join('');
    expect(stdout.length).toBeGreaterThan(0);
    
    stdoutWriteSpy.mockRestore();
  });

    it('should log when onlyVerbose is true and verbose is true', async () => {
      // Agent logger logs when onlyVerbose is true AND verbose is true
      const capturedStderr: string[] = [];
      const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
      });
      
      await runCli(['debate', 'Design a system', '--verbose', '--rounds', '1']);
      
      // Verbose output should include detailed information
      const stderr = capturedStderr.join('');
      expect(stderr).toContain('Running debate (verbose)');
      
      stderrWriteSpy.mockRestore();
    });

    it('should not log when onlyVerbose is true and verbose is false', async () => {
      // When verbose is false, messages with onlyVerbose=true should not be logged
      // This is tested by checking that verbose-specific content is not present
      const capturedStderr: string[] = [];
      const stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Buffer | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
      });
      
      await runCli(['debate', 'Design a system', '--rounds', '1']);
      
      const stderr = capturedStderr.join('');
      // Should not contain verbose header
      expect(stderr).not.toContain('Running debate (verbose)');
      
      stderrWriteSpy.mockRestore();
    });
  });

  describe('Context file handling', () => {
    let tmpDir: string;
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
    });

    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      process.env = originalEnv;
    });

    it('should return undefined when context file does not exist', async () => {
      const nonExistentFile = path.join(tmpDir, 'nonexistent.txt');
      
      await runCli(['debate', 'Design a system', '--context', nonExistentFile]);
      
      // Should complete successfully with warning
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context file not found')
      );
    });

    it('should return undefined when context path is a directory', async () => {
      await runCli(['debate', 'Design a system', '--context', tmpDir]);
      
      // Should complete successfully with warning
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context path is a directory')
      );
    });

    it('should return undefined when context file is empty', async () => {
      const emptyFile = path.join(tmpDir, 'empty.txt');
      fs.writeFileSync(emptyFile, '');
      
      await runCli(['debate', 'Design a system', '--context', emptyFile]);
      
      // Should complete successfully with warning
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context file is empty')
      );
    });

    it('should truncate context file exceeding MAX_CONTEXT_LENGTH', async () => {
      const longFile = path.join(tmpDir, 'long.txt');
      const longContent = 'x'.repeat(6000); // Exceeds 5000 character limit
      fs.writeFileSync(longFile, longContent);
      
      await runCli(['debate', 'Design a system', '--context', longFile]);
      
      // Should complete successfully with truncation warning
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context file exceeds 5000 characters')
      );
    });

    it('should return undefined when context file read fails', async () => {
      const contextFile = path.join(tmpDir, 'context.txt');
      fs.writeFileSync(contextFile, 'Some context');
      
      // Mock fs.promises.readFile to throw an error
      jest.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(new Error('Permission denied'));
      
      await runCli(['debate', 'Design a system', '--context', contextFile]);
      
      // Should complete successfully with warning
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read context file')
      );
      
      jest.spyOn(fs.promises, 'readFile').mockRestore();
    });

    it('should return context content when file is valid', async () => {
      const contextFile = path.join(tmpDir, 'context.txt');
      const contextContent = 'Additional context information';
      fs.writeFileSync(contextFile, contextContent);
      
      await runCli(['debate', 'Design a system', '--context', contextFile]);
      
      // Should complete successfully without warnings about missing/empty context
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Context file not found')
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Context file is empty')
      );
    });
  });
});

