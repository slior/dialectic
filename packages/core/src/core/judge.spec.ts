import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/llm-provider';
import { AgentConfig, LLM_PROVIDERS, AGENT_ROLES, PromptSource } from '../types/agent.types';
import { DebateRound, DebateContext, CONTRIBUTION_TYPES, SummarizationConfig } from '../types/debate.types';
import { TracingContext, SPAN_LEVEL } from '../types/tracing.types';
import { LengthBasedSummarizer } from '../utils/context-summarizer';

import { JudgeAgent } from './judge';

// Test constants
const DEFAULT_JUDGE_TEMPERATURE = 0.3;
const MOCK_INPUT_TOKENS = 100;
const MOCK_OUTPUT_TOKENS = 50;
const MOCK_TOTAL_TOKENS = 150;
const CONFIDENCE_CAP_WHEN_MAJORS_UNMET = 40;
const FALLBACK_CONFIDENCE_SCORE = 50;

// Mock provider
class MockLLMProvider implements LLMProvider {
  private responseText: string;
  private shouldFail: boolean;

  constructor(responseText: string, shouldFail: boolean = false) {
    this.responseText = responseText;
    this.shouldFail = shouldFail;
  }

  setResponse(text: string): void {
    this.responseText = text;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    if (this.shouldFail) {
      throw new Error('Mock LLM failure');
    }
    return {
      text: this.responseText,
      usage: {
        inputTokens: MOCK_INPUT_TOKENS,
        outputTokens: MOCK_OUTPUT_TOKENS,
        totalTokens: MOCK_TOTAL_TOKENS,
      },
    };
  }
}

// Mock Langfuse types
interface MockLangfuseSpan {
  end: jest.Mock;
  generation: jest.Mock;
}

interface MockLangfuseGeneration {
  end: jest.Mock;
}

interface MockLangfuseTrace {
  span: jest.Mock;
  id?: string;
}

interface MockLangfuse {
  trace: jest.Mock;
}

function createMockTracingContext(): TracingContext {
  const mockGeneration: MockLangfuseGeneration = {
    end: jest.fn(),
  };

  const mockSpan: MockLangfuseSpan = {
    end: jest.fn(),
    generation: jest.fn().mockReturnValue(mockGeneration),
  };

  const mockTrace: MockLangfuseTrace = {
    span: jest.fn().mockReturnValue(mockSpan),
    id: 'test-trace-id',
  };

  const mockLangfuse: MockLangfuse = {
    trace: jest.fn().mockReturnValue(mockTrace),
  };

  return {
    langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
    trace: mockTrace as unknown as TracingContext['trace'],
    currentSpans: new Map(),
  };
}

function createMockJudgeConfig(): AgentConfig {
  return {
    id: 'judge-1',
    name: 'Test Judge',
    role: AGENT_ROLES.GENERALIST,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_JUDGE_TEMPERATURE,
  };
}

function createMockSummarizationConfig(): SummarizationConfig {
  return {
    enabled: false,
    threshold: 10000,
    maxLength: 2000,
    method: 'length-based' as const,
  };
}

function createMockDebateRounds(): DebateRound[] {
  return [
    {
      roundNumber: 1,
      timestamp: new Date(),
      contributions: [
        {
          agentId: 'agent-1',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Architect proposal content',
          metadata: {},
        },
      ],
    },
  ];
}

function createValidJSONResponse(): string {
  return JSON.stringify({
    solutionMarkdown: '# Solution\n\nThis is a comprehensive solution.',
    tradeoffs: ['Trade-off 1', 'Trade-off 2'],
    recommendations: ['Recommendation 1'],
    unfulfilledMajorRequirements: [],
    openQuestions: [],
    confidence: 85,
  });
}

function createJSONWithUnfulfilledRequirements(): string {
  return JSON.stringify({
    solutionMarkdown: '# Solution\n\nThis solution has issues.',
    tradeoffs: ['Trade-off 1'],
    recommendations: ['Fix requirements'],
    unfulfilledMajorRequirements: ['Requirement 1 must be met', 'Requirement 2 is critical'],
    openQuestions: ['Question 1'],
    confidence: 60, // Should be capped at 40
  });
}

describe('JudgeAgent', () => {
  describe('JSON parsing and confidence capping', () => {
    it('should parse valid JSON response and return structured solution', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.description).toContain('# Solution');
      expect(result.description).toContain('This is a comprehensive solution.');
      expect(result.description).toContain('## Judge Assessment');
      expect(result.description).toContain('**Confidence Score**: 85/100');
      expect(result.tradeoffs).toEqual(['Trade-off 1', 'Trade-off 2']);
      expect(result.recommendations).toEqual(['Recommendation 1']);
      expect(result.confidence).toBe(85);
      expect(result.synthesizedBy).toBe('judge-1');
    });

    it('should hard-cap confidence at 40 when major requirements are unfulfilled', async () => {
      const jsonResponse = createJSONWithUnfulfilledRequirements();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.confidence).toBe(CONFIDENCE_CAP_WHEN_MAJORS_UNMET);
      expect(result.description).toContain('### ⚠️ Unfulfilled Major Requirements');
      expect(result.description).toContain('Requirement 1 must be met');
      expect(result.description).toContain('Requirement 2 is critical');
    });

    it('should cap confidence even if model sets it above 40 when majors are unmet', async () => {
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: ['Major requirement'],
        openQuestions: [],
        confidence: 90, // Model sets high, but should be capped
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.confidence).toBe(CONFIDENCE_CAP_WHEN_MAJORS_UNMET);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const jsonResponse = '```json\n' + createValidJSONResponse() + '\n```';
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
      expect(result.tradeoffs).toEqual(['Trade-off 1', 'Trade-off 2']);
    });

    it('should handle JSON with code block markers without language', async () => {
      const jsonResponse = '```\n' + createValidJSONResponse() + '\n```';
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
    });

    it('should fallback to plain text when JSON parsing fails', async () => {
      const plainTextResponse = 'This is not JSON. It is plain text solution.';
      const mockProvider = new MockLLMProvider(plainTextResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.description).toBe(plainTextResponse);
      expect(result.tradeoffs).toEqual([]);
      expect(result.recommendations).toEqual([]);
      expect(result.confidence).toBe(FALLBACK_CONFIDENCE_SCORE);
    });

    it('should handle invalid JSON gracefully', async () => {
      const invalidJSON = '{ "solutionMarkdown": "test", invalid json }';
      const mockProvider = new MockLLMProvider(invalidJSON);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.description).toBe(invalidJSON);
      expect(result.confidence).toBe(FALLBACK_CONFIDENCE_SCORE);
    });

    it('should handle JSON missing solutionMarkdown field', async () => {
      const incompleteJSON = JSON.stringify({
        tradeoffs: ['Trade-off 1'],
        confidence: 75,
      });
      const mockProvider = new MockLLMProvider(incompleteJSON);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      // Should fallback since solutionMarkdown is missing
      expect(result.description).toBe(incompleteJSON);
      expect(result.confidence).toBe(FALLBACK_CONFIDENCE_SCORE);
    });

    it('should normalize non-array fields to empty arrays', async () => {
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: 'not an array',
        recommendations: null,
        unfulfilledMajorRequirements: [],
        openQuestions: undefined,
        confidence: 80,
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.tradeoffs).toEqual([]);
      expect(result.recommendations).toEqual([]);
      expect(result.confidence).toBe(80);
    });

    it('should clamp confidence to 0-100 range', async () => {
      const jsonResponseHigh = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: [],
        openQuestions: [],
        confidence: 150, // Above 100
      });
      const mockProviderHigh = new MockLLMProvider(jsonResponseHigh);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judgeHigh = new JudgeAgent(
        config,
        mockProviderHigh,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const resultHigh = await judgeHigh.synthesize('Test problem', rounds, context);
      expect(resultHigh.confidence).toBe(100);

      const jsonResponseLow = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: [],
        openQuestions: [],
        confidence: -10, // Below 0
      });
      const mockProviderLow = new MockLLMProvider(jsonResponseLow);
      const judgeLow = new JudgeAgent(
        config,
        mockProviderLow,
        'System prompt',
        undefined,
        summaryConfig
      );

      const resultLow = await judgeLow.synthesize('Test problem', rounds, context);
      expect(resultLow.confidence).toBe(0);
    });

    it('should include all sections in rendered markdown when present', async () => {
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution\n\nMain content here.',
        tradeoffs: ['Trade-off A', 'Trade-off B'],
        recommendations: ['Recommendation X', 'Recommendation Y'],
        unfulfilledMajorRequirements: ['Requirement 1'],
        openQuestions: ['Question A', 'Question B'],
        confidence: 70,
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.description).toContain('# Solution');
      expect(result.description).toContain('Main content here.');
      expect(result.description).toContain('## Judge Assessment');
      expect(result.description).toContain('**Confidence Score**: 40/100'); // Capped at 40
      expect(result.description).toContain('### ⚠️ Unfulfilled Major Requirements');
      expect(result.description).toContain('Requirement 1');
      expect(result.description).toContain('### Open Questions');
      expect(result.description).toContain('Question A');
      expect(result.description).toContain('Question B');
      expect(result.description).toContain('### Recommendations');
      expect(result.description).toContain('Recommendation X');
      expect(result.description).toContain('Recommendation Y');
      expect(result.description).toContain('### Trade-offs');
      expect(result.description).toContain('Trade-off A');
      expect(result.description).toContain('Trade-off B');
    });

    it('should omit sections when arrays are empty', async () => {
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution\n\nContent.',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: [],
        openQuestions: [],
        confidence: 90,
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result.description).toContain('# Solution');
      expect(result.description).toContain('## Judge Assessment');
      expect(result.description).toContain('**Confidence Score**: 90/100');
      // Should not contain section headers for empty arrays
      expect(result.description).not.toContain('### ⚠️ Unfulfilled Major Requirements');
      expect(result.description).not.toContain('### Open Questions');
      expect(result.description).not.toContain('### Recommendations');
      expect(result.description).not.toContain('### Trade-offs');
    });
  });

  describe('Constructor', () => {
    it('should set promptSource when provided', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const promptSource: PromptSource = { source: 'file', absPath: '/path/to/prompt.txt' };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        promptSource,
        summaryConfig
      );

      expect(judge.promptSource).toEqual(promptSource);
    });

    it('should not set promptSource when undefined', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      expect(judge.promptSource).toBeUndefined();
    });

    it('should set summaryPromptSource when provided', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const summaryPromptSource: PromptSource = { source: 'file', absPath: '/path/to/summary-prompt.txt' };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig,
        summaryPromptSource
      );

      expect(judge.summaryPromptSource).toEqual(summaryPromptSource);
    });

    it('should initialize summarizer when summarization is enabled', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10000,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Access private summarizer via type assertion
      const summarizer = (judge as unknown as { summarizer?: LengthBasedSummarizer }).summarizer;
      expect(summarizer).toBeDefined();
      expect(summarizer).toBeInstanceOf(LengthBasedSummarizer);
    });

    it('should not initialize summarizer when summarization is disabled', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Access private summarizer via type assertion
      const summarizer = (judge as unknown as { summarizer?: LengthBasedSummarizer }).summarizer;
      expect(summarizer).toBeUndefined();
    });

    it('should use default temperature when temperature is undefined in config', () => {
      // This test covers line 91: temperature ?? DEFAULT_JUDGE_TEMPERATURE in constructor
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = {
        id: 'judge-1',
        name: 'Test Judge',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        // temperature is omitted to test default
      } as AgentConfig;
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10000,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // The summarizer should be initialized with DEFAULT_JUDGE_TEMPERATURE
      const summarizer = (judge as unknown as { summarizer?: LengthBasedSummarizer }).summarizer;
      expect(summarizer).toBeDefined();
    });

    it('should use default temperature when temperature is undefined in synthesize', async () => {
      // This test covers line 154: temperature ?? DEFAULT_JUDGE_TEMPERATURE in synthesize
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = {
        id: 'judge-1',
        name: 'Test Judge',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        // temperature is omitted to test default
      } as AgentConfig;
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };
      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
    });

    it('should use default temperature when temperature is undefined in prepareContext with tracing', async () => {
      // This test covers line 502: temperature ?? DEFAULT_JUDGE_TEMPERATURE in executeSummarizationWithTracing
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = {
        id: 'judge-1',
        name: 'Test Judge',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        // temperature is omitted to test default
      } as AgentConfig;
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeDefined();
    });

    it('should use unknown when trace.id is undefined', async () => {
      // This test covers line 181: trace.id || 'unknown'
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      
      // Create tracing context without trace.id
      const mockGeneration: MockLangfuseGeneration = {
        end: jest.fn(),
      };
      const mockSpan: MockLangfuseSpan = {
        end: jest.fn(),
        generation: jest.fn().mockReturnValue(mockGeneration),
      };
      const mockTrace: MockLangfuseTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        // id is undefined
      };
      const mockLangfuse: MockLangfuse = {
        trace: jest.fn().mockReturnValue(mockTrace),
      };
      const tracingContext: TracingContext = {
        langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
        trace: mockTrace as unknown as TracingContext['trace'],
        currentSpans: new Map(),
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      // Verify that span was created with 'unknown' as debateId
      expect(mockTrace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            debateId: 'unknown',
          }),
        })
      );
    });

    it('should handle undefined token values in convertUsageToLangfuse', async () => {
      // This test covers lines 220-222: usage.inputTokens ?? null, etc.
      class MockProviderWithPartialUsage implements LLMProvider {
        async complete(_request: CompletionRequest): Promise<CompletionResponse> {
          return {
            text: createValidJSONResponse(),
            usage: {
              // Only totalTokens is provided, inputTokens and outputTokens are undefined
              totalTokens: MOCK_TOTAL_TOKENS,
            },
          };
        }
      }

      const mockProvider = new MockProviderWithPartialUsage();
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration).toBeDefined();
      const callArgs = mockGeneration!.end.mock.calls[0][0];
      expect(callArgs.usage).toBeDefined();
      expect(callArgs.usage.input).toBeNull(); // Should be null when undefined
      expect(callArgs.usage.output).toBeNull(); // Should be null when undefined
      expect(callArgs.usage.total).toBe(MOCK_TOTAL_TOKENS);
    });

    it('should handle undefined totalTokens in convertUsageToLangfuse', async () => {
      // This test covers line 222: usage.totalTokens ?? null (the else branch)
      class MockProviderWithoutTotalTokens implements LLMProvider {
        async complete(_request: CompletionRequest): Promise<CompletionResponse> {
          return {
            text: createValidJSONResponse(),
            usage: {
              inputTokens: MOCK_INPUT_TOKENS,
              outputTokens: MOCK_OUTPUT_TOKENS,
              // totalTokens is omitted to test the ?? null branch
            },
          };
        }
      }

      const mockProvider = new MockProviderWithoutTotalTokens();
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration).toBeDefined();
      const callArgs = mockGeneration!.end.mock.calls[0][0];
      expect(callArgs.usage).toBeDefined();
      expect(callArgs.usage.input).toBe(MOCK_INPUT_TOKENS);
      expect(callArgs.usage.output).toBe(MOCK_OUTPUT_TOKENS);
      expect(callArgs.usage.total).toBeNull(); // Should be null when totalTokens is undefined
    });

    it('should handle non-array unfulfilledMajorRequirements in parseJudgeSynthesisOutput', async () => {
      // This test covers line 725: Array.isArray check for unfulfilledMajorRequirements
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: 'not an array', // Not an array
        openQuestions: [],
        confidence: 80,
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.unfulfilledMajorRequirements).toEqual([]); // Should be normalized to empty array
    });

    it('should handle non-number confidence in parseJudgeSynthesisOutput', async () => {
      // This test covers line 729: typeof parsed.confidence === 'number' check
      const jsonResponse = JSON.stringify({
        solutionMarkdown: '# Solution',
        tradeoffs: [],
        recommendations: [],
        unfulfilledMajorRequirements: [],
        openQuestions: [],
        confidence: 'not a number', // Not a number
      });
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = { problem: 'Test problem', history: rounds };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(FALLBACK_CONFIDENCE_SCORE); // Should use fallback
    });
  });

  describe('Static methods', () => {
    it('should return default system prompt', () => {
      const prompt = JudgeAgent.defaultSystemPrompt();
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return default summary prompt with content and maxLength', () => {
      const content = 'Test content to summarize';
      const maxLength = 2000;
      const prompt = JudgeAgent.defaultSummaryPrompt(content, maxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain(content);
      expect(prompt).toContain(maxLength.toString());
    });
  });

  describe('Tracing functionality', () => {
    it('should synthesize with tracing when tracingContext is provided', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
      expect(tracingContext.trace.span).toHaveBeenCalled();
    });

    it('should create span with correct metadata when tracing', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      expect(tracingContext.trace.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `judge-synthesize-${config.id}`,
          metadata: expect.objectContaining({
            judgeName: config.name,
            judgeId: config.id,
            debateId: tracingContext.trace.id || 'unknown',
          }),
        })
      );
    });

    it('should create generation with correct parameters when tracing', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      expect(mockSpan?.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation-0',
          input: expect.objectContaining({
            systemPrompt: 'System prompt',
            model: config.model,
            temperature: DEFAULT_JUDGE_TEMPERATURE,
          }),
          metadata: expect.objectContaining({
            model: config.model,
            temperature: DEFAULT_JUDGE_TEMPERATURE,
            provider: config.provider,
          }),
        })
      );
    });

    it('should end generation with usage when tracing', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration).toBeDefined();
      expect(mockGeneration!.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            text: jsonResponse,
          }),
          usage: expect.objectContaining({
            input: MOCK_INPUT_TOKENS,
            output: MOCK_OUTPUT_TOKENS,
            total: MOCK_TOTAL_TOKENS,
            unit: 'TOKENS',
          }),
        })
      );
    });

    it('should end span with solution description when tracing', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      expect(mockSpan?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            solutionDescription: expect.any(String),
          }),
        })
      );
    });

    it('should fallback to non-tracing execution when span creation fails', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();
      
      // Make span creation fail
      (tracingContext.trace.span as jest.Mock).mockImplementation(() => {
        throw new Error('Span creation failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for judge synthesize (span creation)')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should fallback to non-tracing execution when generation creation fails', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();
      
      // Get the mockSpan from the mock setup
      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan || 
        (tracingContext.trace.span as jest.Mock)() as unknown as MockLangfuseSpan;
      
      // Make generation creation fail
      mockSpan.generation.mockImplementation(() => {
        throw new Error('Generation creation failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for judge synthesize (generation creation)')
      );
      expect(mockSpan?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'Generation creation failed',
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle LLM errors during tracing and end spans with error', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await expect(judge.synthesize('Test problem', rounds, context)).rejects.toThrow('Mock LLM failure');

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'Mock LLM failure',
        })
      );
      expect(mockSpan?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'Mock LLM failure',
        })
      );
    });

    it('should handle errors when ending spans during error handling', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();
      
      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      // Set up mock to fail when span.end is called
      const mockGeneration: MockLangfuseGeneration = {
        end: jest.fn(),
      };
      const mockSpan: MockLangfuseSpan = {
        end: jest.fn().mockImplementation(() => {
          throw new Error('Span end failed');
        }),
        generation: jest.fn().mockReturnValue(mockGeneration),
      };
      const mockTrace: MockLangfuseTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        id: 'test-trace-id',
      };
      const mockLangfuse: MockLangfuse = {
        trace: jest.fn().mockReturnValue(mockTrace),
      };
      const customTracingContext: TracingContext = {
        langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
        trace: mockTrace as unknown as TracingContext['trace'],
        currentSpans: new Map(),
      };
      context.tracingContext = customTracingContext;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(judge.synthesize('Test problem', rounds, context)).rejects.toThrow('Mock LLM failure');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed while ending span')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle usage with null values when tracing', async () => {
      class MockProviderWithNullUsage implements LLMProvider {
        async complete(_request: CompletionRequest): Promise<CompletionResponse> {
          return {
            text: createValidJSONResponse(),
              // Omit usage to test null handling
          };
        }
      }

      const mockProvider = new MockProviderWithNullUsage();
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            text: expect.any(String),
          }),
        })
      );
      // Usage should not be included when all values are null
      expect(mockGeneration).toBeDefined();
      const callArgs = mockGeneration!.end.mock.calls[0][0];
      expect(callArgs.usage).toBeUndefined();
    });

    it('should handle missing usage when tracing', async () => {
      class MockProviderWithoutUsage implements LLMProvider {
        async complete(_request: CompletionRequest): Promise<CompletionResponse> {
          return {
            text: createValidJSONResponse(),
          };
        }
      }

      const mockProvider = new MockProviderWithoutUsage();
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      await judge.synthesize('Test problem', rounds, context);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration).toBeDefined();
      const callArgs = mockGeneration!.end.mock.calls[0][0];
      expect(callArgs.usage).toBeUndefined();
    });
  });

  describe('Summarization', () => {
    it('should return false when summarization is disabled', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      expect(judge.shouldSummarize(rounds)).toBe(false);
    });

    it('should return false when rounds are empty', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10000,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      expect(judge.shouldSummarize([])).toBe(false);
    });

    it('should return false when content is below threshold', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10000,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Short content', // Below threshold
              metadata: {},
            },
          ],
        },
      ];

      expect(judge.shouldSummarize(rounds)).toBe(false);
    });

    it('should return true when content exceeds threshold', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 100,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200); // Above threshold
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      expect(judge.shouldSummarize(rounds)).toBe(true);
    });

    it('should only include proposals and refinements in final round content', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Proposal content',
              metadata: {},
            },
            {
              agentId: 'agent-2',
              agentRole: AGENT_ROLES.PERFORMANCE,
              type: CONTRIBUTION_TYPES.CRITIQUE,
              content: 'Critique content', // Should not be included
              metadata: {},
            },
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: 'Refinement content',
              metadata: {},
            },
          ],
        },
      ];

      expect(judge.shouldSummarize(rounds)).toBe(true);
    });

    it('should prepare context without summarization when not needed', async () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const result = await judge.prepareContext(rounds);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeUndefined();
    });

    it('should prepare context with summarization when needed', async () => {
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeDefined();
      expect(result.summary?.summary).toBe(summaryText);
      expect(result.summary?.agentId).toBe(config.id);
      expect(result.summary?.agentRole).toBe(config.role);
    });

    it('should prepare context with tracing when tracingContext is provided', async () => {
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeDefined();
      expect(tracingContext.trace.span).toHaveBeenCalled();
    });

    it('should fallback when summarization fails', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summarization failed with error')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle missing summarizer when summarization is enabled', async () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Access private summarizer and set it to undefined
      // Using type assertion to bypass exactOptionalPropertyTypes
      (judge as unknown as { summarizer?: LengthBasedSummarizer | undefined }).summarizer = undefined;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summarization enabled but no summarizer available')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle tracing errors during prepareContext', async () => {
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();
      
      // Make span creation fail
      (tracingContext.trace.span as jest.Mock).mockImplementation(() => {
        throw new Error('Span creation failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for judge prepareContext (span creation)')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle generation creation failure during prepareContext with tracing', async () => {
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();
      
      // Get the mockSpan from the mock setup
      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan || 
        (tracingContext.trace.span as jest.Mock)() as unknown as MockLangfuseSpan;
      
      // Make generation creation fail
      mockSpan.generation.mockImplementation(() => {
        throw new Error('Generation creation failed');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for judge prepareContext (generation creation)')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle summarization errors during tracing and end span with error', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      await expect(judge.prepareContext(rounds, tracingContext)).rejects.toThrow('Mock LLM failure');

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'Mock LLM failure',
        })
      );
      expect(mockSpan?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SPAN_LEVEL.ERROR,
          statusMessage: 'Mock LLM failure',
        })
      );
    });

    it('should include token usage in generation when summarization succeeds with tracing', async () => {
      const summaryText = 'This is a summary of the debate.';
      const mockProvider = new MockLLMProvider(summaryText);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      await judge.prepareContext(rounds, tracingContext);

      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration?.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            summary: summaryText,
          }),
          usage: expect.objectContaining({
            total: MOCK_TOTAL_TOKENS,
            unit: 'TOKENS',
          }),
        })
      );
    });

    it('should use final round content when summarization is enabled in buildSynthesisPrompt', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Round 1 proposal',
              metadata: {},
            },
          ],
        },
        {
          roundNumber: 2,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const context: DebateContext = { problem: 'Test problem', history: rounds };
      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
    });

    it('should handle empty final round gracefully', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [],
        },
      ];

      expect(judge.shouldSummarize(rounds)).toBe(false);
    });

    it('should handle null final round gracefully', () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Test with empty rounds array
      expect(judge.shouldSummarize([])).toBe(false);
    });

    it('should handle getFinalRoundRelevantContent with undefined finalRound (sparse array)', async () => {
      // This test covers line 410: getFinalRoundRelevantContent when finalRound is undefined
      // We create a sparse array where the last element is undefined
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 0, // Set threshold to 0 so shouldSummarize returns true
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Create a sparse array where index 0 has content but index 1 is undefined
      // When getFinalRoundRelevantContent accesses rounds[rounds.length - 1],
      // it will get rounds[1] which is undefined, triggering line 410
      const sparseRounds = new Array(2);
      sparseRounds[0] = {
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'agent-1',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: 'a'.repeat(100), // Has content
            metadata: {},
          },
        ],
      };
      // sparseRounds[1] is undefined
      // rounds.length = 2, so rounds[rounds.length - 1] = rounds[1] = undefined
      
      // shouldSummarize checks rounds.length (2), so it doesn't return early
      // Then it calls getFinalRoundRelevantContent which accesses rounds[1] (undefined)
      // This triggers the !finalRound check at line 409, returning '' at line 410
      // With threshold 0, empty string length (0) >= 0 is true, so shouldSummarize returns true
      expect(judge.shouldSummarize(sparseRounds as DebateRound[])).toBe(true); // Because threshold is 0, so 0 >= 0
      
      // Now test synthesize to trigger buildSynthesisPrompt which also calls getFinalRoundRelevantContent
      const context: DebateContext = { problem: 'Test problem', history: sparseRounds as DebateRound[] };
      const result = await judge.synthesize('Test problem', sparseRounds as DebateRound[], context);
      expect(result).toBeDefined();
    });

    it('should handle getFinalRoundRelevantContent with null/empty rounds through buildSynthesisPrompt', async () => {
      // This test covers line 405: getFinalRoundRelevantContent with null/empty rounds
      // We test this by mocking shouldSummarize to return true even with empty rounds,
      // which will cause buildSynthesisPrompt to call getFinalRoundRelevantContent with empty rounds
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 100,
        maxLength: 2000,
        method: 'length-based' as const,
      };

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Mock shouldSummarize to return true even with empty rounds
      // This will cause buildSynthesisPrompt to call getFinalRoundRelevantContent with empty rounds
      // which will trigger line 405
      const shouldSummarizeSpy = jest.spyOn(judge, 'shouldSummarize').mockReturnValue(true);

      // Test with empty rounds - shouldSummarize returns true (mocked), so buildSynthesisPrompt
      // will call getFinalRoundRelevantContent with empty rounds, triggering line 405
      const emptyRounds: DebateRound[] = [];
      const context: DebateContext = { problem: 'Test problem', history: emptyRounds };
      const result = await judge.synthesize('Test problem', emptyRounds, context);
      
      expect(result).toBeDefined();
      expect(shouldSummarizeSpy).toHaveBeenCalledWith(emptyRounds);
      
      shouldSummarizeSpy.mockRestore();
    });

    it('should handle missing summarizer in executeSummarizationWithTracing', async () => {
      const mockProvider = new MockLLMProvider(createValidJSONResponse());
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      // Access private summarizer and set it to undefined
      (judge as unknown as { summarizer?: LengthBasedSummarizer | undefined }).summarizer = undefined;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.context.history).toEqual(rounds);
      expect(result.summary).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summarization enabled but no summarizer available')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle error when generation.end fails during summarization error', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const mockGeneration: MockLangfuseGeneration = {
        end: jest.fn().mockImplementation(() => {
          throw new Error('Generation end failed');
        }),
      };
      const mockSpan: MockLangfuseSpan = {
        end: jest.fn(),
        generation: jest.fn().mockReturnValue(mockGeneration),
      };
      const mockTrace: MockLangfuseTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        id: 'test-trace-id',
      };
      const mockLangfuse: MockLangfuse = {
        trace: jest.fn().mockReturnValue(mockTrace),
      };
      const tracingContext: TracingContext = {
        langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
        trace: mockTrace as unknown as TracingContext['trace'],
        currentSpans: new Map(),
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      await expect(judge.prepareContext(rounds, tracingContext)).rejects.toThrow('Mock LLM failure');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed while ending generation')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle convertTotalTokensToLangfuse with null/undefined', async () => {
      class MockProviderWithoutTokens implements LLMProvider {
        async complete(_request: CompletionRequest): Promise<CompletionResponse> {
          return {
            text: 'Summary text',
            // Omit usage.totalTokens to test undefined handling
            usage: {},
          };
        }
      }

      const mockProvider = new MockProviderWithoutTokens();
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const tracingContext = createMockTracingContext();

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      const result = await judge.prepareContext(rounds, tracingContext);

      expect(result.summary).toBeDefined();
      const mockSpan = (tracingContext.trace.span as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseSpan;
      const mockGeneration = mockSpan ? (mockSpan.generation as jest.Mock).mock.results[0]?.value as unknown as MockLangfuseGeneration : undefined;
      expect(mockGeneration).toBeDefined();
      const callArgs = mockGeneration!.end.mock.calls[0][0];
      // Usage should not be included when totalTokens is undefined
      expect(callArgs.usage).toBeUndefined();
    });

    it('should handle error when span.end fails during generation creation error', async () => {
      const jsonResponse = createValidJSONResponse();
      const mockProvider = new MockLLMProvider(jsonResponse);
      const config = createMockJudgeConfig();
      const summaryConfig = createMockSummarizationConfig();
      const mockSpan: MockLangfuseSpan = {
        end: jest.fn().mockImplementation(() => {
          throw new Error('Span end failed');
        }),
        generation: jest.fn().mockImplementation(() => {
          throw new Error('Generation creation failed');
        }),
      };
      const mockTrace: MockLangfuseTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        id: 'test-trace-id',
      };
      const mockLangfuse: MockLangfuse = {
        trace: jest.fn().mockReturnValue(mockTrace),
      };
      const tracingContext: TracingContext = {
        langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
        trace: mockTrace as unknown as TracingContext['trace'],
        currentSpans: new Map(),
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const rounds = createMockDebateRounds();
      const context: DebateContext = {
        problem: 'Test problem',
        history: rounds,
        tracingContext,
      };

      const result = await judge.synthesize('Test problem', rounds, context);

      expect(result).toBeDefined();
      expect(result.confidence).toBe(85);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for judge synthesize (generation creation)')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed while ending span')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle error when span.end fails during prepareContext error', async () => {
      const mockProvider = new MockLLMProvider('', true); // Should fail
      const config = createMockJudgeConfig();
      const summaryConfig: SummarizationConfig = {
        enabled: true,
        threshold: 10,
        maxLength: 2000,
        method: 'length-based' as const,
      };
      const mockGeneration: MockLangfuseGeneration = {
        end: jest.fn(),
      };
      const mockSpan: MockLangfuseSpan = {
        end: jest.fn().mockImplementation(() => {
          throw new Error('Span end failed');
        }),
        generation: jest.fn().mockReturnValue(mockGeneration),
      };
      const mockTrace: MockLangfuseTrace = {
        span: jest.fn().mockReturnValue(mockSpan),
        id: 'test-trace-id',
      };
      const mockLangfuse: MockLangfuse = {
        trace: jest.fn().mockReturnValue(mockTrace),
      };
      const tracingContext: TracingContext = {
        langfuse: mockLangfuse as unknown as TracingContext['langfuse'],
        trace: mockTrace as unknown as TracingContext['trace'],
        currentSpans: new Map(),
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const judge = new JudgeAgent(
        config,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );

      const longContent = 'a'.repeat(200);
      const rounds: DebateRound[] = [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: longContent,
              metadata: {},
            },
          ],
        },
      ];

      await expect(judge.prepareContext(rounds, tracingContext)).rejects.toThrow('Mock LLM failure');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed while ending span')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});

