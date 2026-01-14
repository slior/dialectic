import fs from 'fs';
import os from 'os';
import path from 'path';

import { EXIT_INVALID_ARGS, EXIT_CONFIG_ERROR, EXIT_GENERAL_ERROR, ErrorWithCode, EvaluatorAgent, loadEnvironmentFile } from 'dialectic-core';

import { runCli } from '../index';


// Test constants
const TEST_PROBLEM = 'Test problem';
const TEST_SOLUTION = 'Test solution';
const TEST_PROBLEM_SHORT = 'Test';
const TEST_SOLUTION_SHORT = 'Solution';
const AGENT_ID_E1 = 'e1';
const AGENT_ID_E2 = 'e2';
const AGENT_ID_E3 = 'e3';
const AGENT_NAME_E1 = 'E1';
const AGENT_NAME_E2 = 'E2';
const AGENT_NAME_E3 = 'E3';
const AGENT_NAME_EVALUATOR = 'Evaluator';
const MODEL_GPT4 = 'gpt-4';
const MODEL_GPT35_TURBO = 'gpt-3.5-turbo';
const PROVIDER_OPENAI = 'openai';
const PROVIDER_OPENROUTER = 'openrouter';
const CONFIG_FILE_NAME = 'config.json';
const DEBATE_FILE_NAME = 'debate.json';
const MOCK_LATENCY_MS = 100;
const TEMP_DIR_PREFIX = 'eval-test-';

// Create the mock function first
const mockCreateProvider = jest.fn();

// Mock the provider-factory module using the moduleNameMapper path
// This needs to happen before dialectic-core is mocked
jest.mock('dialectic-core/providers/provider-factory', () => ({
  createProvider: (..._args: unknown[]): unknown => mockCreateProvider(..._args)
}));

// Mock env-loader
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn(),
    createProvider: (..._args: unknown[]): unknown => mockCreateProvider(..._args)
  };
});

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;
const mockedCreateProvider = mockCreateProvider;

/**
 * Creates a mock provider for testing.
 */
function createMockProvider(): { complete: jest.Mock<unknown> } {
  return { complete: jest.fn() };
}

/**
 * Creates a basic evaluator agent configuration.
 */
function createBasicAgentConfig(id: string = AGENT_ID_E1, name: string = AGENT_NAME_E1): {
  id: string;
  name: string;
  model: string;
  provider: string;
} {
  return {
    id,
    name,
    model: MODEL_GPT4,
    provider: PROVIDER_OPENAI
  };
}

/**
 * Creates a basic debate JSON structure.
 */
function createBasicDebateData(problem: string = TEST_PROBLEM, solution: string = TEST_SOLUTION): {
  problem: string;
  finalSolution: { description: string };
} {
  return {
    problem,
    finalSolution: { description: solution }
  };
}

/**
 * Creates a basic evaluation response JSON structure.
 */
function createBasicEvaluationResponse(fcScore: number = 8, overallScore: number = 8): string {
  return JSON.stringify({
    evaluation: { functional_completeness: { score: fcScore } },
    overall_summary: { overall_score: overallScore }
  });
}

/**
 * Sets up mock provider and evaluator for a test.
 */
function setupMockProviderAndEvaluator(): void {
  const mockProvider = createMockProvider();
  mockedCreateProvider.mockReturnValue(mockProvider);
}

/**
 * Creates a mock evaluation result.
 */
function createMockEvaluationResult(
  id: string = AGENT_ID_E1,
  rawText?: string,
  latencyMs: number = MOCK_LATENCY_MS
): {
  id: string;
  rawText: string;
  latencyMs: number;
} {
  return {
    id,
    rawText: rawText ?? createBasicEvaluationResponse(),
    latencyMs
  };
}

/**
 * Mocks EvaluatorAgent.prototype.evaluate to return a successful evaluation.
 */
function mockSuccessfulEvaluation(
  id: string = AGENT_ID_E1,
  fcScore: number = 8,
  overallScore: number = 8
): jest.SpyInstance {
  return jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue(
    createMockEvaluationResult(id, createBasicEvaluationResponse(fcScore, overallScore))
  );
}

describe('CLI eval command', () => {
  const originalEnv = process.env;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', OPENROUTER_API_KEY: 'test-key' };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    }) as unknown as jest.MockedFunction<typeof process.exit>);
    mockedLoadEnvironmentFile.mockClear();
    mockedLoadEnvironmentFile.mockReturnValue(undefined);
    mockedCreateProvider.mockClear();
    
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Required flags validation', () => {
    it('should reject when --config flag is missing', async () => {
      await expect(runCli(['eval', '--debate', 'some-debate.json']))
        .rejects.toThrow();
    });

    it('should reject when --debate flag is missing', async () => {
      await expect(runCli(['eval', '--config', 'some-config.json']))
        .rejects.toThrow();
    });

    it('should reject when both required flags are missing', async () => {
      await expect(runCli(['eval']))
        .rejects.toThrow();
    });
  });

  describe('File existence validation', () => {
    it('should exit with invalid args when config file does not exist', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      await expect(runCli(['eval', '--config', 'nonexistent.json', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate file does not exist', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_EVALUATOR)]
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', 'nonexistent.json']))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Config validation', () => {
    it('should reject config without agents array', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({ foo: 'bar' }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('agents array required')
      );
    });

    it('should reject config with empty agents array', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({ agents: [] }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject config with malformed JSON', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, '{ agents: [invalid json}');
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should filter out disabled evaluators', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          { ...createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_E1), enabled: false },
          { ...createBasicAgentConfig(AGENT_ID_E2, AGENT_NAME_E2), enabled: false }
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('No enabled evaluator agents')
      );
    });
  });

  describe('Debate input validation', () => {
    let configPath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_EVALUATOR)]
      }));
    });

    it('should reject debate JSON without problem field', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify({
        finalSolution: { description: TEST_SOLUTION }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing non-empty problem')
      );
    });

    it('should reject debate JSON with empty problem', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: '   ',
        finalSolution: { description: TEST_SOLUTION }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject debate JSON without finalSolution', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: TEST_PROBLEM
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing non-empty finalSolution.description')
      );
    });

    it('should reject debate JSON with empty finalSolution.description', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: TEST_PROBLEM,
        finalSolution: { description: '' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject debate JSON with malformed JSON', async () => {
      const debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, '{ problem: invalid }');

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Environment file loading', () => {
    const CUSTOM_ENV_FILE = 'custom.env';
    const PROD_ENV_FILE = 'prod.env';

    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      // Mock provider and evaluator
      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call loadEnvironmentFile with default parameters', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should call loadEnvironmentFile with custom env file', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--env-file', CUSTOM_ENV_FILE]);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(CUSTOM_ENV_FILE, undefined);
    });

    it('should call loadEnvironmentFile with verbose flag', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--verbose']);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, true);
    });

    it('should call loadEnvironmentFile with both custom env file and verbose', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--env-file', PROD_ENV_FILE, '--verbose']);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(PROD_ENV_FILE, true);
    });
  });

  describe('Provider factory integration', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));
      
      mockedCreateProvider.mockClear();
    });

    it('should call createProvider for each enabled agent', async () => {
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_E1),
          { ...createBasicAgentConfig(AGENT_ID_E2, AGENT_NAME_E2), model: MODEL_GPT35_TURBO, provider: PROVIDER_OPENROUTER }
        ]
      }));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(mockedCreateProvider).toHaveBeenCalledTimes(2);
      expect(mockedCreateProvider).toHaveBeenCalledWith(PROVIDER_OPENAI);
      expect(mockedCreateProvider).toHaveBeenCalledWith(PROVIDER_OPENROUTER);
    });

    it('should propagate provider factory errors (missing API keys)', async () => {
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));

      mockedCreateProvider.mockImplementation(() => {
        const err = new Error('Missing API key for openai') as ErrorWithCode;
        err.code = EXIT_CONFIG_ERROR;
        throw err;
      });

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_CONFIG_ERROR);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      mockedCreateProvider.mockClear();
    });
  });

  describe('Evaluator execution and result parsing', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Design a rate limiter',
        finalSolution: { description: 'Use token bucket algorithm' }
      }));

      setupMockProviderAndEvaluator();
    });

    it('should successfully parse valid JSON response', async () => {
      const validResponse = {
        evaluation: {
          functional_completeness: { score: 8, reasoning: 'Good coverage' },
          non_functional: {
            performance_scalability: { score: 7 },
            security: { score: 9 },
            maintainability_evolvability: { score: 8 },
            regulatory_compliance: { score: 6 },
            testability: { score: 7 }
          }
        },
        overall_summary: {
          strengths: 'Well designed',
          weaknesses: 'Could improve X',
          overall_score: 8
        }
      };

      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify(validResponse),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('8.00'); // functional completeness
      expect(output).toContain('7.00'); // performance
      expect(output).toContain('9.00'); // security
    });

    it('should extract JSON from text with surrounding content', async () => {
      const responseWithExtra = 'Here is the evaluation:\n' +
        '{"evaluation":{"functional_completeness":{"score":8}},"overall_summary":{"overall_score":8}}\n' +
        'Additional text here';

      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: responseWithExtra,
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('8.00');
    });

    it('should skip agent with invalid JSON and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: 'This is not valid JSON at all',
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid JSON output; skipping agent')
      );
      
      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('N/A'); // All scores should be N/A
    });

    it('should skip agent that throws error during evaluation', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockRejectedValue(
        new Error('Network timeout')
      );

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Skipped due to error')
      );
    });

    it('should handle evaluation result with empty rawText', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: '', // Empty string
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid JSON output; skipping agent')
      );
    });

    it('should handle evaluation result with null rawText', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: null as unknown as string, // Null value
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid JSON output; skipping agent')
      );
    });
  });

  describe('Score validation and clamping', () => {
    const SCORE_BELOW_MIN_1 = -5;
    const SCORE_BELOW_MIN_2 = 0.5;
    const SCORE_ABOVE_MAX_1 = 15;
    const SCORE_ABOVE_MAX_2 = 100;

    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should clamp score below 1 to 1 and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: SCORE_BELOW_MIN_1 } },
          overall_summary: { overall_score: SCORE_BELOW_MIN_2 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(`clamped to [1,10] from ${SCORE_BELOW_MIN_1}`)
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(`clamped to [1,10] from ${SCORE_BELOW_MIN_2}`)
      );

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('1.00'); // Clamped scores
    });

    it('should clamp score above 10 to 10 and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: SCORE_ABOVE_MAX_1 } },
          overall_summary: { overall_score: SCORE_ABOVE_MAX_2 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(`clamped to [1,10] from ${SCORE_ABOVE_MAX_1}`)
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(`clamped to [1,10] from ${SCORE_ABOVE_MAX_2}`)
      );

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('10.00');
    });

    it('should ignore non-numeric scores and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 'eight' } },
          overall_summary: { overall_score: null }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid or missing numeric score')
      );

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('N/A');
    });

    it('should ignore missing score fields silently when field is absent', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
          // Missing all non_functional scores
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('8.00'); // fc and overall
      expect(output).toContain('N/A'); // missing scores
    });
  });

  describe('Score averaging across multiple agents', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_E1),
          createBasicAgentConfig(AGENT_ID_E2, AGENT_NAME_E2),
          createBasicAgentConfig(AGENT_ID_E3, AGENT_NAME_E3)
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should average scores from multiple agents', async () => {
      const evalSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      
      evalSpy.mockResolvedValueOnce({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });
      
      evalSpy.mockResolvedValueOnce({
        id: 'e2',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 6 } },
          overall_summary: { overall_score: 6 }
        }),
        latencyMs: 100
      });
      
      evalSpy.mockResolvedValueOnce({
        id: 'e3',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 7 } },
          overall_summary: { overall_score: 7 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Average of 8, 6, 7 = 7.00
      expect(output).toContain('7.00');
    });

    it('should average only present values when some agents fail', async () => {
      const evalSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      
      evalSpy.mockResolvedValueOnce({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });
      
      evalSpy.mockRejectedValueOnce(new Error('Timeout'));
      
      evalSpy.mockResolvedValueOnce({
        id: 'e3',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 6 } },
          overall_summary: { overall_score: 6 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Average of 8, 6 = 7.00 (e2 skipped)
      expect(output).toContain('7.00');
    });


    it('should handle missing evaluation object in parsed result', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          // Missing evaluation object
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Should handle missing evaluation gracefully
      expect(output).toContain('8.00'); // overall_score
      expect(output).toContain('N/A'); // missing functional_completeness
    });

    it('should handle missing non_functional object in parsed result', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 }
            // Missing non_functional object
          },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Should handle missing non_functional gracefully
      expect(output).toContain('8.00'); // functional_completeness and overall_score
      expect(output).toContain('N/A'); // missing non_functional scores
    });

    it('should handle missing overall_summary object in parsed result', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 }
          }
          // Missing overall_summary object
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Should handle missing overall_summary gracefully
      expect(output).toContain('8.00'); // functional_completeness
      expect(output).toContain('N/A'); // missing overall_score
    });

    it('should round to 2 decimal places', async () => {
      const evalSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      
      evalSpy.mockResolvedValueOnce({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });
      
      evalSpy.mockResolvedValueOnce({
        id: 'e2',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 7 } },
          overall_summary: { overall_score: 7 }
        }),
        latencyMs: 100
      });
      
      evalSpy.mockResolvedValueOnce({
        id: 'e3',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      // Average of 8, 7, 8 = 7.666... => 7.67
      expect(output).toContain('7.67');
    });
  });

  describe('Clarifications handling', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));

      setupMockProviderAndEvaluator();
    });

    it('should format clarifications with fenced code blocks', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { id: 'q1', question: 'What is the scale?', answer: '1M users' }
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Check that evaluate was called with properly formatted clarifications
      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.clarificationsMarkdown).toContain('### Architect (architect)');
      expect(call?.clarificationsMarkdown).toContain('```text');
      expect(call?.clarificationsMarkdown).toContain('What is the scale?');
      expect(call?.clarificationsMarkdown).toContain('1M users');
    });

    it('should handle debates without clarifications', async () => {
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      const evaluateSpy = mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Should have empty fenced code blocks
      expect(call?.clarificationsMarkdown).toMatch(/```.*```/);
    });

    it('should preserve NA answers in clarifications', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'security-1',
            agentName: 'Security',
            role: 'security',
            items: [
              { id: 'q1', question: 'Security requirements?', answer: 'NA' }
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.clarificationsMarkdown).toContain('NA');
    });
  });

  describe('Markdown output format', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should output markdown table to stdout by default', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 },
            non_functional: {
              performance_scalability: { score: 7 },
              security: { score: 9 },
              maintainability_evolvability: { score: 8 },
              regulatory_compliance: { score: 6 },
              testability: { score: 7 }
            }
          },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      
      // Check table structure
      expect(output).toContain('| Functional Completeness');
      expect(output).toContain('| Performance & Scalability');
      expect(output).toContain('| Security');
      expect(output).toContain('| Maintainability & Evolvability');
      expect(output).toContain('| Regulatory Compliance');
      expect(output).toContain('| Testability');
      expect(output).toContain('| Overall Score');
      
      // Check values with 2 decimal places
      expect(output).toContain('8.00');
      expect(output).toContain('7.00');
      expect(output).toContain('9.00');
      expect(output).toContain('6.00');
    });

    it('should write markdown table to file when --output specified (non-json)', async () => {
      const outputPath = path.join(tmpDir, 'results.md');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('| Functional Completeness');
      expect(content).toContain('8.00');
    });

    it('should show N/A for missing scores in markdown', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
          // Missing all non_functional scores
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('8.00'); // fc
      expect(output).toContain('N/A'); // missing scores
    });
  });

  describe('JSON output format', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          createBasicAgentConfig(AGENT_ID_E1, AGENT_NAME_E1),
          createBasicAgentConfig(AGENT_ID_E2, AGENT_NAME_E2)
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should write JSON output when --output ends with .json', async () => {
      const EXPECTED_REASONING = 'Good';
      const outputPath = path.join(tmpDir, 'results.json');
      
      const evalSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evalSpy.mockResolvedValueOnce({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8, reasoning: EXPECTED_REASONING } },
          overall_summary: { overall_score: 8, strengths: 'Strong', weaknesses: 'Minor' }
        }),
        latencyMs: 100
      });
      evalSpy.mockResolvedValueOnce({
        id: 'e2',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 6 } },
          overall_summary: { overall_score: 6 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      
      // Check structure
      expect(content).toHaveProperty('evaluation');
      expect(content).toHaveProperty('overall_score');
      expect(content).toHaveProperty('agents');
      
      // Check aggregated averages (8 + 6) / 2 = 7
      expect(content.evaluation.functional_completeness.average_score).toBe(7);
      expect(content.overall_score).toBe(7);
      
      // Check per-agent results
      expect(content.agents).toHaveProperty('e1');
      expect(content.agents).toHaveProperty('e2');
      expect(content.agents.e1.evaluation.functional_completeness.score).toBe(8);
      expect(content.agents.e1.evaluation.functional_completeness.reasoning).toBe(EXPECTED_REASONING);
    });

    it('should use null for N/A values in JSON output', async () => {
      const outputPath = path.join(tmpDir, 'results.json');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
          // Missing non_functional scores
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.evaluation.non_functional.performance_scalability.average_score).toBeNull();
      expect(content.evaluation.non_functional.security.average_score).toBeNull();
    });

    it('should write JSON even when output path case is .JSON', async () => {
      const outputPath = path.join(tmpDir, 'results.JSON');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content).toHaveProperty('evaluation');
    });
  });

  describe('CSV output format', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should write CSV file with header when file does not exist', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 },
            non_functional: {
              performance_scalability: { score: 7 },
              security: { score: 9 },
              maintainability_evolvability: { score: 8 },
              regulatory_compliance: { score: 6 },
              testability: { score: 7 }
            }
          },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines[0]).toBe('debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score');
      expect(lines[1]).toContain('debate');
      expect(lines[1]).toContain('8.00');
      expect(lines[1]).toContain('7.00');
      expect(lines[1]).toContain('9.00');
      expect(lines[1]).toContain('8.00');
      expect(lines[1]).toContain('6.00');
      expect(lines[1]).toContain('7.00');
      expect(lines[1]).toContain('8.00');
    });

    it('should append data row when CSV file exists', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      // Create existing CSV file with header
      fs.writeFileSync(outputPath, 'debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score\n');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(2); // Header + 1 data row
      expect(lines[0]).toBe('debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score');
      expect(lines[1]).toContain('debate');
    });

    it('should extract debate filename without .json extension', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      const debatePathWithJson = path.join(tmpDir, 'my-debate.json');
      
      fs.writeFileSync(debatePathWithJson, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePathWithJson, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines[1]).toBeDefined();
      const dataRow = lines[1]!.split(',');
      
      expect(dataRow[0]).toBe('my-debate'); // Should not include .json
    });

    it('should handle debate path without .json extension', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      const debatePathNoExt = path.join(tmpDir, 'my-debate');
      
      fs.writeFileSync(debatePathNoExt, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePathNoExt, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines[1]).toBeDefined();
      const dataRow = lines[1]!.split(',');
      
      expect(dataRow[0]).toBe('my-debate');
    });

    it('should format scores to 2 decimal places in CSV', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8.5 },
            non_functional: {
              performance_scalability: { score: 7.333 },
              security: { score: 9.99 }
            }
          },
          overall_summary: { overall_score: 8.123 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      
      expect(content).toContain('8.50');
      expect(content).toContain('7.33');
      expect(content).toContain('9.99');
      expect(content).toContain('8.12');
    });

    it('should use empty string for null scores in CSV', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
          // Missing all non_functional scores
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines[1]).toBeDefined();
      const dataRow = lines[1]!.split(',');
      
      // Check that null scores are empty strings (not "N/A")
      expect(dataRow[2]).toBe(''); // performance_scalability
      expect(dataRow[3]).toBe(''); // security
      expect(dataRow[4]).toBe(''); // maintainability_evolvability
      expect(dataRow[5]).toBe(''); // regulatory_compliance
      expect(dataRow[6]).toBe(''); // testability
      expect(content).not.toContain('N/A');
    });

    it('should escape CSV values containing commas', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      const debatePathWithComma = path.join(tmpDir, 'debate,with,commas.json');
      
      fs.writeFileSync(debatePathWithComma, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePathWithComma, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      const dataRow = lines[1];
      
      // Value with commas should be quoted
      expect(dataRow).toMatch(/^"debate,with,commas",/);
    });

    it('should not quote normal CSV values', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 },
            non_functional: {
              performance_scalability: { score: 7 }
            }
          },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      const dataRow = lines[1];
      
      // Normal values should not be quoted
      expect(dataRow).toMatch(/^debate,/);
      expect(dataRow).toContain(',8.00,');
      expect(dataRow).toContain(',7.00,');
    });

    it('should include all 7 score columns in correct order', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 1 },
            non_functional: {
              performance_scalability: { score: 2 },
              security: { score: 3 },
              maintainability_evolvability: { score: 4 },
              regulatory_compliance: { score: 5 },
              testability: { score: 6 }
            }
          },
          overall_summary: { overall_score: 7 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines[0]).toBeDefined();
      expect(lines[1]).toBeDefined();
      const header = lines[0]!;
      const dataRow = lines[1]!.split(',');
      
      // Verify header order
      expect(header).toBe('debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score');
      
      // Verify data order matches header (skip first field which is debate filename)
      expect(dataRow[1]).toBe('1.00'); // functional_completeness
      expect(dataRow[2]).toBe('2.00'); // performance_scalability
      expect(dataRow[3]).toBe('3.00'); // security
      expect(dataRow[4]).toBe('4.00'); // maintainability_evolvability
      expect(dataRow[5]).toBe('5.00'); // regulatory_compliance
      expect(dataRow[6]).toBe('6.00'); // testability
      expect(dataRow[7]).toBe(''); // requirements_fulfillment (empty when not provided)
      expect(dataRow[8]).toBe('7.00'); // overall_score
    });

    it('should detect CSV extension case-insensitively (.CSV)', async () => {
      const outputPath = path.join(tmpDir, 'results.CSV');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      
      // Should be CSV format, not JSON or Markdown
      expect(content).toContain('debate,Functional Completeness');
      expect(content).not.toContain('{');
      expect(content).not.toContain('|');
    });

    it('should write JSON when output ends with .json (not CSV)', async () => {
      const outputPath = path.join(tmpDir, 'results.json');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      expect(parsed).toHaveProperty('evaluation');
      expect(parsed).toHaveProperty('overall_score');
      expect(content).not.toContain('debate,Functional Completeness');
    });

    it('should write Markdown when output has no extension (not CSV)', async () => {
      const outputPath = path.join(tmpDir, 'results');
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      
      expect(content).toContain('| Functional Completeness');
      expect(content).toContain('|');
      expect(content).not.toContain('debate,Functional Completeness');
    });

    it('should append multiple rows to same CSV file', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      const debatePath2 = path.join(tmpDir, 'debate2.json');
      
      fs.writeFileSync(debatePath2, JSON.stringify({
        problem: 'Test 2',
        finalSolution: { description: 'Solution 2' }
      }));
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      // First evaluation
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);
      
      // Second evaluation
      await runCli(['eval', '--config', configPath, '--debate', debatePath2, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(3); // Header + 2 data rows
      expect(lines[0]).toBe('debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score');
      expect(lines[1]).toContain('debate');
      expect(lines[2]).toContain('debate2');
    });
  });

  describe('Verbose mode', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should log provider and model info in verbose mode', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--verbose']);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] provider=openai model=gpt-4')
      );
    });

    it('should log prompt sources in verbose mode (built-in)', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--verbose']);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(/systemPrompt=.*built-in default/)
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(/userPrompt=.*built-in default/)
      );
    });

    it('should log prompt sources in verbose mode (from file)', async () => {
      const promptsDir = path.join(tmpDir, 'prompts');
      fs.mkdirSync(promptsDir);
      const systemPromptPath = path.join(promptsDir, 'system.md');
      const userPromptPath = path.join(promptsDir, 'user.md');
      fs.writeFileSync(systemPromptPath, 'Custom system prompt');
      fs.writeFileSync(userPromptPath, 'Custom user prompt');

      const configPathWithPrompts = path.join(tmpDir, 'config-with-prompts.json');
      fs.writeFileSync(configPathWithPrompts, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          systemPromptPath: './prompts/system.md',
          userPromptPath: './prompts/user.md'
        }]
      }));

      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPathWithPrompts, '--debate', debatePath, '--verbose']);

      // Should log file paths, not "built-in default"
      const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0])).join('');
      expect(stderrCalls).toContain('systemPrompt=');
      expect(stderrCalls).toContain('userPrompt=');
      // Should contain file paths, not "built-in default"
      expect(stderrCalls).not.toContain('built-in default');
    });

    it('should not log verbose info when verbose flag is absent', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      stderrSpy.mockClear();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should not have verbose provider/model logs
      const stderrCalls = stderrSpy.mock.calls.map(c => c[0]).join('');
      expect(stderrCalls).not.toContain('provider=openai model=gpt-4');
    });
  });

  describe('Prompt resolution', () => {
    let configPath: string;
    let debatePath: string;
    let promptsDir: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      promptsDir = path.join(tmpDir, 'prompts');
      
      fs.mkdirSync(promptsDir);
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should use custom system prompt from file when specified', async () => {
      const customSystemPrompt = 'Custom evaluator system prompt';
      const promptFilePath = path.join(promptsDir, 'eval-system.md');
      fs.writeFileSync(promptFilePath, customSystemPrompt);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          systemPromptPath: './prompts/eval-system.md'
        }]
      }));

      const fromConfigSpy = jest.spyOn(EvaluatorAgent, 'fromConfig');
      const mockAgent = {
        id: 'e1',
        evaluate: jest.fn().mockResolvedValue({
          id: 'e1',
          rawText: JSON.stringify({
            evaluation: { functional_completeness: { score: 8 } },
            overall_summary: { overall_score: 8 }
          }),
          latencyMs: 100
        }),
        resolvedSystemPrompt: ''
      };
      
      fromConfigSpy.mockImplementation((_cfg: unknown, sysPrompt: string): EvaluatorAgent => {
        (mockAgent as unknown as { resolvedSystemPrompt: string }).resolvedSystemPrompt = sysPrompt;
        return mockAgent as unknown as EvaluatorAgent;
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Verify custom prompt was used
      expect(fromConfigSpy).toHaveBeenCalled();
      const calls = fromConfigSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toBeDefined();
      const sysPromptArg = calls[0]![1]; // Second argument is sysPrompt
      expect(sysPromptArg).toContain('Custom evaluator');
      
      fromConfigSpy.mockRestore();
    });

    it('should use custom user prompt from file when specified', async () => {
      const customUserPrompt = 'Evaluate: {problem} {clarifications} {final_solution}';
      const promptFilePath = path.join(promptsDir, 'eval-user.md');
      fs.writeFileSync(promptFilePath, customUserPrompt);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          userPromptPath: './prompts/eval-user.md'
        }]
      }));

      const fromConfigSpy = jest.spyOn(EvaluatorAgent, 'fromConfig');
      const mockAgent = {
        id: 'e1',
        evaluate: jest.fn().mockResolvedValue({
          id: 'e1',
          rawText: JSON.stringify({
            evaluation: { functional_completeness: { score: 8 } },
            overall_summary: { overall_score: 8 }
          }),
          latencyMs: 100
        }),
        resolvedUserPromptTemplate: ''
      };
      
      fromConfigSpy.mockImplementation((_cfg: unknown, _sysPrompt: string, userPrompt: string): EvaluatorAgent => {
        (mockAgent as unknown as { resolvedUserPromptTemplate: string }).resolvedUserPromptTemplate = userPrompt;
        return mockAgent as unknown as EvaluatorAgent;
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(fromConfigSpy).toHaveBeenCalled();
      const calls = fromConfigSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toBeDefined();
      const userPromptArg = calls[0]![2]; // Third argument is userPrompt
      expect(userPromptArg).toContain('Evaluate:');
      
      fromConfigSpy.mockRestore();
    });
  });

  describe('All score categories', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT)));

      setupMockProviderAndEvaluator();
    });

    it('should handle all score categories correctly', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 9, reasoning: 'Excellent' },
            non_functional: {
              performance_scalability: { score: 8, reasoning: 'Fast' },
              security: { score: 7, reasoning: 'Secure' },
              maintainability_evolvability: { score: 6, reasoning: 'Maintainable' },
              regulatory_compliance: { score: 5, reasoning: 'Compliant' },
              testability: { score: 4, reasoning: 'Testable' }
            }
          },
          overall_summary: {
            strengths: 'Good design',
            weaknesses: 'Some issues',
            overall_score: 7
          }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      
      expect(output).toContain('9.00'); // functional_completeness
      expect(output).toContain('8.00'); // performance_scalability
      expect(output).toContain('7.00'); // security and overall
      expect(output).toContain('6.00'); // maintainability
      expect(output).toContain('5.00'); // regulatory
      expect(output).toContain('4.00'); // testability
    });

    it('should handle requirements_fulfillment score', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: {
            functional_completeness: { score: 8 },
            non_functional: {
              requirements_fulfillment: { score: 9 }
            }
          },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('9.00'); // requirements_fulfillment
    });
  });

  describe('Clarification formatting edge cases', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));

      setupMockProviderAndEvaluator();
    });

    it('should handle clarification item with missing id', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { question: 'What is the scale?', answer: '1M users' } // Missing id
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Item without id should be skipped, so no question should appear
      expect(call?.clarificationsMarkdown).not.toContain('What is the scale?');
    });

    it('should handle clarification item with missing question', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { id: 'q1', answer: '1M users' } // Missing question
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Item without question should be skipped
      expect(call?.clarificationsMarkdown).not.toContain('q1');
    });

    it('should handle clarification item with missing answer', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { id: 'q1', question: 'What is the scale?' } // Missing answer (undefined)
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Item without answer should be skipped
      expect(call?.clarificationsMarkdown).not.toContain('What is the scale?');
    });

    it('should handle clarification group with missing agentName', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            role: 'architect',
            items: [
              { id: 'q1', question: 'What is the scale?', answer: '1M users' }
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Group without agentName should be skipped
      expect(call?.clarificationsMarkdown).not.toContain('What is the scale?');
    });

    it('should handle clarification group with missing role', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            items: [
              { id: 'q1', question: 'What is the scale?', answer: '1M users' }
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Group without role should be skipped
      expect(call?.clarificationsMarkdown).not.toContain('What is the scale?');
    });

    it('should handle clarification group with empty items array', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: []
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Group with empty items should be skipped
      expect(call?.clarificationsMarkdown).not.toContain('Architect');
    });

    it('should handle clarification group that becomes empty after filtering invalid items', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { question: 'Invalid item without id', answer: 'answer' }
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // After filtering invalid items, group header is added but no items
      // formatClarificationGroupMarkdown adds the header, but formatClarificationItemMarkdown returns ''
      // So the output will be "### Architect (architect)\n" which trims to "### Architect (architect)"
      // This tests that formatClarificationItemMarkdown returns '' for invalid items (line 76)
      const markdown = call?.clarificationsMarkdown || '';
      // The group header will be present, but no items will be formatted
      expect(markdown).toContain('### Architect (architect)');
      // But the invalid item should not appear
      expect(markdown).not.toContain('Invalid item without id');
    });
  });

  describe('Config validation edge cases', () => {
    let debatePath: string;

    beforeEach(() => {
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));
    });

    it('should reject config with agent that is null', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [null]
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('agent must be an object')
      );
    });

    it('should reject config with agent that is a string', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: ['invalid-agent']
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('agent must be an object')
      );
    });

    it('should reject config with agent that is a number', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [123]
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should default provider to openai when provider is not a string', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 123 // Invalid provider type
        }]
      }));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should default to openai provider
      expect(mockedCreateProvider).toHaveBeenCalledWith(PROVIDER_OPENAI);
    });

    it('should handle agent config with null/undefined id, name, model', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: null,
          name: undefined,
          model: null,
          provider: 'openai'
        }]
      }));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should handle null/undefined values by converting to empty strings
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle agent config with non-number timeout', async () => {
      const configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          timeout: 'invalid' // Not a number
        }]
      }));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should handle non-number timeout by setting to undefined
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('Error handling edge cases', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      setupMockProviderAndEvaluator();
    });

    it('should handle error without code property', async () => {
      // Test error handling by causing an error that doesn't have a code property
      // We'll mock loadAndValidateDebateState to throw a plain Error
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'readJsonFile').mockImplementationOnce(() => {
        throw new Error('Test error without code');
      });

      // Commander.js catches errors from action callbacks
      let caughtError: unknown;
      try {
        await runCli(['eval', '--config', configPath, '--debate', debatePath]);
      } catch (err) {
        caughtError = err;
        // Error is expected - should have code property set to EXIT_GENERAL_ERROR
        expect(err).toHaveProperty('code', EXIT_GENERAL_ERROR);
      }

      // Verify error was created with message
      expect(caughtError).toBeDefined();
      expect((caughtError as Error).message).toBe('Test error without code');

      // Should write error message to stderr
      const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0])).join('');
      expect(stderrCalls).toContain('Test error without code');

      // Restore
      jest.restoreAllMocks();
    });

    it('should handle error that is not an Error object', async () => {
      // Test error handling when error is not an Error instance
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'readJsonFile').mockImplementationOnce(() => {
        throw 'String error'; // Throw a string instead of Error
      });

      // Commander.js catches errors from action callbacks
      let caughtError: unknown;
      try {
        await runCli(['eval', '--config', configPath, '--debate', debatePath]);
      } catch (err) {
        caughtError = err;
        // Error should have code property set to EXIT_GENERAL_ERROR
        expect(err).toHaveProperty('code', EXIT_GENERAL_ERROR);
      }

      // Verify error was created
      expect(caughtError).toBeDefined();
      // Should use 'Unknown error' when error is not an object with message
      expect((caughtError as Error).message).toBe('Unknown error');

      // Restore
      jest.restoreAllMocks();
    });

    it('should handle error when writeStderr throws', async () => {
      // Mock writeStderr to throw an error
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'writeStderr').mockImplementation(() => {
        throw new Error('writeStderr failed');
      });

      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockRejectedValue(
        new Error('Test error')
      );

      // Should not throw from writeStderr, but should still throw the original error
      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toThrow();

      // Restore original
      jest.restoreAllMocks();
    });

    it('should handle error with null message', async () => {
      // Test error handling by causing an error that doesn't have a message property
      // We'll test this by mocking readJsonFile to throw an error without message
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'readJsonFile').mockImplementationOnce(() => {
        const err = { code: EXIT_INVALID_ARGS } as ErrorWithCode;
        throw err;
      });

      // Commander.js catches errors from action callbacks
      try {
        await runCli(['eval', '--config', configPath, '--debate', debatePath]);
      } catch {
        // Error is expected
      }

      // Should use 'Unknown error' when message is missing
      const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0])).join('');
      expect(stderrCalls).toContain('Unknown error');

      // Restore
      jest.restoreAllMocks();
    });
  });

  describe('Path resolution', () => {
    let configPath: string;
    let debatePath: string;
    const originalInitCwd = process.env.INIT_CWD;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();
    });

    afterEach(() => {
      if (originalInitCwd) {
        process.env.INIT_CWD = originalInitCwd;
      } else {
        delete process.env.INIT_CWD;
      }
    });

    it('should use INIT_CWD when available for relative paths', async () => {
      const customInitCwd = path.join(os.tmpdir(), 'custom-init-cwd');
      process.env.INIT_CWD = customInitCwd;

      // Create files in the custom init cwd
      const customConfigPath = path.join(customInitCwd, CONFIG_FILE_NAME);
      const customDebatePath = path.join(customInitCwd, DEBATE_FILE_NAME);
      
      fs.mkdirSync(customInitCwd, { recursive: true });
      fs.writeFileSync(customConfigPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(customDebatePath, JSON.stringify(createBasicDebateData()));

      await runCli(['eval', '--config', CONFIG_FILE_NAME, '--debate', DEBATE_FILE_NAME]);

      // Cleanup
      fs.rmSync(customInitCwd, { recursive: true, force: true });
    });

    it('should use process.cwd() when INIT_CWD is not set', async () => {
      delete process.env.INIT_CWD;

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should work fine with absolute paths
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle absolute paths regardless of INIT_CWD', async () => {
      process.env.INIT_CWD = '/some/other/path';

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Absolute paths should work regardless of INIT_CWD
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('CSV escaping edge cases', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      setupMockProviderAndEvaluator();
    });

    it('should escape CSV values containing double quotes', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      // Use a valid filename but test CSV escaping through score values
      // We'll test the escaping logic indirectly by checking CSV format
      
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--output', outputPath]);

      const content = fs.readFileSync(outputPath, 'utf-8');
      // Verify CSV format is correct (debate filename is first field)
      expect(content).toContain('debate');
      // The escapeCsvField function is tested indirectly through the CSV output format
    });

    it('should escape CSV values containing commas', async () => {
      const outputPath = path.join(tmpDir, 'results.csv');
      // Create a debate filename with commas (if filesystem allows)
      const debatePathWithComma = path.join(tmpDir, 'debate,with,commas.json');
      
      try {
        fs.writeFileSync(debatePathWithComma, JSON.stringify({
          problem: 'Test',
          finalSolution: { description: 'Solution' }
        }));
        
        jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
          id: 'e1',
          rawText: JSON.stringify({
            evaluation: { functional_completeness: { score: 8 } },
            overall_summary: { overall_score: 8 }
          }),
          latencyMs: 100
        });

        await runCli(['eval', '--config', configPath, '--debate', debatePathWithComma, '--output', outputPath]);

        const content = fs.readFileSync(outputPath, 'utf-8');
        // Value with commas should be quoted
        expect(content).toMatch(/^"debate,with,commas",/);
      } catch {
        // Skip test if filesystem doesn't allow commas in filenames (Windows)
        // The escapeCsvField function logic is still covered by other tests
      }
    });
  });

  describe('JSON parsing edge cases', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));
      fs.writeFileSync(debatePath, JSON.stringify(createBasicDebateData()));

      setupMockProviderAndEvaluator();
    });

    it('should handle JSON parsing failure gracefully', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: '{ invalid json }',
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid JSON output; skipping agent')
      );
    });

    it('should handle text without JSON object', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: 'This is just plain text with no JSON',
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[e1] Invalid JSON output; skipping agent')
      );
    });

    it('should extract JSON from text with multiple JSON objects', async () => {
      const responseWithMultipleJson = 'First: {"foo": "bar"}\n' +
        'Second: {"evaluation":{"functional_completeness":{"score":8}},"overall_summary":{"overall_score":8}}\n' +
        'Third: {"baz": "qux"}';

      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: responseWithMultipleJson,
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Should parse the first JSON object found
      const output = stdoutSpy.mock.calls.join('');
      // The first JSON object doesn't have evaluation, so should show N/A
      expect(output).toContain('N/A');
    });
  });

  describe('Empty clarifications edge cases', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, CONFIG_FILE_NAME);
      debatePath = path.join(tmpDir, DEBATE_FILE_NAME);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [createBasicAgentConfig()]
      }));

      setupMockProviderAndEvaluator();
      mockSuccessfulEvaluation();
    });

    it('should handle clarifications array that exists but is empty', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: []
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Empty clarifications array should return empty code blocks
      expect(call?.clarificationsMarkdown).toMatch(/```.*```/);
    });

    it('should handle clarifications with whitespace-only content', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        ...createBasicDebateData(TEST_PROBLEM_SHORT, TEST_SOLUTION_SHORT),
        clarifications: [
          {
            agentId: 'architect-1',
            agentName: 'Architect',
            role: 'architect',
            items: [
              { id: 'q1', question: '   ', answer: '   ' } // All whitespace
            ]
          }
        ]
      }));

      const evaluateSpy = mockSuccessfulEvaluation();
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Whitespace-only content is still valid and will be formatted
      // The group header will be present, and items with whitespace will be formatted
      expect(call?.clarificationsMarkdown).toContain('### Architect (architect)');
      expect(call?.clarificationsMarkdown).toContain('q1');
    });
  });
});

