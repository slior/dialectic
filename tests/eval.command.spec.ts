import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCli } from '../src/cli/index';
import { EXIT_INVALID_ARGS, EXIT_CONFIG_ERROR } from '../src/utils/exit-codes';
import { EvaluatorAgent } from '../src/eval/evaluator-agent';

// Mock env-loader
jest.mock('../src/utils/env-loader', () => ({
  loadEnvironmentFile: jest.fn()
}));

// Mock provider-factory
jest.mock('../src/providers/provider-factory', () => ({
  createProvider: jest.fn()
}));

import { loadEnvironmentFile } from '../src/utils/env-loader';
import { createProvider } from '../src/providers/provider-factory';

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;
const mockedCreateProvider = createProvider as jest.MockedFunction<typeof createProvider>;

describe('CLI eval command', () => {
  const originalEnv = process.env;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    }) as any);
    mockedLoadEnvironmentFile.mockClear();
    mockedCreateProvider.mockClear();
    
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
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
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', 'nonexistent.json', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate file does not exist', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'Evaluator', model: 'gpt-4', provider: 'openai' }]
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', 'nonexistent.json']))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Config validation', () => {
    it('should reject config without agents array', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({ foo: 'bar' }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('agents array required')
      );
    });

    it('should reject config with empty agents array', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({ agents: [] }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject config with malformed JSON', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, '{ agents: [invalid json}');
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should filter out disabled evaluators', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      const debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          { id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai', enabled: false },
          { id: 'e2', name: 'E2', model: 'gpt-4', provider: 'openai', enabled: false }
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

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
      configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'Evaluator', model: 'gpt-4', provider: 'openai' }]
      }));
    });

    it('should reject debate JSON without problem field', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing non-empty problem')
      );
    });

    it('should reject debate JSON with empty problem', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: '   ',
        finalSolution: { description: 'Test solution' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject debate JSON without finalSolution', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem'
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing non-empty finalSolution.description')
      );
    });

    it('should reject debate JSON with empty finalSolution.description', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: '' }
      }));

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should reject debate JSON with malformed JSON', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, '{ problem: invalid }');

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Environment file loading', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));

      // Mock provider and evaluator
      const mockProvider = { complete: jest.fn() };
      mockedCreateProvider.mockReturnValue(mockProvider as any);
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: '{"evaluation":{"functional_completeness":{"score":8}},"overall_summary":{"overall_score":8}}',
        latencyMs: 100
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call loadEnvironmentFile with default parameters', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath]);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should call loadEnvironmentFile with custom env file', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--env-file', 'custom.env']);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith('custom.env', undefined);
    });

    it('should call loadEnvironmentFile with verbose flag', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--verbose']);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith(undefined, true);
    });

    it('should call loadEnvironmentFile with both custom env file and verbose', async () => {
      await runCli(['eval', '--config', configPath, '--debate', debatePath, '--env-file', 'prod.env', '--verbose']);
      expect(mockedLoadEnvironmentFile).toHaveBeenCalledWith('prod.env', true);
    });
  });

  describe('Provider factory integration', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test problem',
        finalSolution: { description: 'Test solution' }
      }));
    });

    it('should call createProvider for each enabled agent', async () => {
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          { id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' },
          { id: 'e2', name: 'E2', model: 'gpt-3.5-turbo', provider: 'openrouter' }
        ]
      }));

      const mockProvider = { complete: jest.fn() };
      mockedCreateProvider.mockReturnValue(mockProvider as any);
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: '{"evaluation":{"functional_completeness":{"score":8}},"overall_summary":{"overall_score":8}}',
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(mockedCreateProvider).toHaveBeenCalledTimes(2);
      expect(mockedCreateProvider).toHaveBeenCalledWith('openai');
      expect(mockedCreateProvider).toHaveBeenCalledWith('openrouter');
    });

    it('should propagate provider factory errors (missing API keys)', async () => {
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));

      mockedCreateProvider.mockImplementation(() => {
        const err: any = new Error('Missing API key for openai');
        err.code = EXIT_CONFIG_ERROR;
        throw err;
      });

      await expect(runCli(['eval', '--config', configPath, '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_CONFIG_ERROR);
    });
  });

  describe('Evaluator execution and result parsing', () => {
    let configPath: string;
    let debatePath: string;
    let mockProvider: any;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Design a rate limiter',
        finalSolution: { description: 'Use token bucket algorithm' }
      }));

      mockProvider = { complete: jest.fn() };
      mockedCreateProvider.mockReturnValue(mockProvider);
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
  });

  describe('Score validation and clamping', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
    });

    it('should clamp score below 1 to 1 and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: -5 } },
          overall_summary: { overall_score: 0.5 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('clamped to [1,10] from -5')
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('clamped to [1,10] from 0.5')
      );

      const output = stdoutSpy.mock.calls.join('');
      expect(output).toContain('1.00'); // Clamped scores
    });

    it('should clamp score above 10 to 10 and warn', async () => {
      jest.spyOn(EvaluatorAgent.prototype, 'evaluate').mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 15 } },
          overall_summary: { overall_score: 100 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('clamped to [1,10] from 15')
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('clamped to [1,10] from 100')
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
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          { id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' },
          { id: 'e2', name: 'E2', model: 'gpt-4', provider: 'openai' },
          { id: 'e3', name: 'E3', model: 'gpt-4', provider: 'openai' }
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
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
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
    });

    it('should format clarifications with fenced code blocks', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' },
        clarifications: [
          {
            agentName: 'Architect',
            role: 'architect',
            items: [
              { id: 'q1', question: 'What is the scale?', answer: '1M users' }
            ]
          }
        ]
      }));

      const evaluateSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evaluateSpy.mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

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
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
        // No clarifications field
      }));

      const evaluateSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evaluateSpy.mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      expect(evaluateSpy).toHaveBeenCalled();
      const call = evaluateSpy.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      // Should have empty fenced code blocks
      expect(call?.clarificationsMarkdown).toMatch(/```.*```/);
    });

    it('should preserve NA answers in clarifications', async () => {
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' },
        clarifications: [
          {
            agentName: 'Security',
            role: 'security',
            items: [
              { id: 'q1', question: 'Security requirements?', answer: 'NA' }
            ]
          }
        ]
      }));

      const evaluateSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evaluateSpy.mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

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
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
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
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [
          { id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' },
          { id: 'e2', name: 'E2', model: 'gpt-4', provider: 'openai' }
        ]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
    });

    it('should write JSON output when --output ends with .json', async () => {
      const outputPath = path.join(tmpDir, 'results.json');
      
      const evalSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evalSpy.mockResolvedValueOnce({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8, reasoning: 'Good' } },
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
      expect(content.agents.e1.evaluation.functional_completeness.reasoning).toBe('Good');
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

  describe('Verbose mode', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
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
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      promptsDir = path.join(tmpDir, 'prompts');
      
      fs.mkdirSync(promptsDir);
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
    });

    it('should use custom system prompt from file when specified', async () => {
      const customSystemPrompt = 'Custom evaluator system prompt';
      fs.writeFileSync(path.join(promptsDir, 'eval-system.md'), customSystemPrompt);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          systemPromptPath: './prompts/eval-system.md'
        }]
      }));

      const evaluateSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evaluateSpy.mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      // Verify custom prompt was used
      const agent = evaluateSpy.mock.instances[0] as any;
      expect(agent.resolvedSystemPrompt).toContain('Custom evaluator');
    });

    it('should use custom user prompt from file when specified', async () => {
      const customUserPrompt = 'Evaluate: {problem} {clarifications} {final_solution}';
      fs.writeFileSync(path.join(promptsDir, 'eval-user.md'), customUserPrompt);
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{
          id: 'e1',
          name: 'E1',
          model: 'gpt-4',
          provider: 'openai',
          userPromptPath: './prompts/eval-user.md'
        }]
      }));

      const evaluateSpy = jest.spyOn(EvaluatorAgent.prototype, 'evaluate');
      evaluateSpy.mockResolvedValue({
        id: 'e1',
        rawText: JSON.stringify({
          evaluation: { functional_completeness: { score: 8 } },
          overall_summary: { overall_score: 8 }
        }),
        latencyMs: 100
      });

      await runCli(['eval', '--config', configPath, '--debate', debatePath]);

      const agent = evaluateSpy.mock.instances[0] as any;
      expect(agent.resolvedUserPromptTemplate).toContain('Evaluate:');
    });
  });

  describe('All score categories', () => {
    let configPath: string;
    let debatePath: string;

    beforeEach(() => {
      configPath = path.join(tmpDir, 'config.json');
      debatePath = path.join(tmpDir, 'debate.json');
      
      fs.writeFileSync(configPath, JSON.stringify({
        agents: [{ id: 'e1', name: 'E1', model: 'gpt-4', provider: 'openai' }]
      }));
      fs.writeFileSync(debatePath, JSON.stringify({
        problem: 'Test',
        finalSolution: { description: 'Solution' }
      }));

      mockedCreateProvider.mockReturnValue({ complete: jest.fn() } as any);
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
  });
});

