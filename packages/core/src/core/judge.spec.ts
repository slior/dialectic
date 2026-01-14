import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/llm-provider';
import { AgentConfig, LLM_PROVIDERS, AGENT_ROLES } from '../types/agent.types';
import { DebateRound, DebateContext, CONTRIBUTION_TYPES, SummarizationConfig } from '../types/debate.types';

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

  constructor(responseText: string) {
    this.responseText = responseText;
  }

  setResponse(text: string): void {
    this.responseText = text;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
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
});

