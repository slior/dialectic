import { EvaluatorAgent, EvaluatorConfig, EvaluatorInputs, LLMProvider, CompletionRequest, CompletionResponse, CompletionUsage, LLM_PROVIDERS } from 'dialectic-core';
import * as consoleUtils from '../utils/console';
import * as providerFactory from '../providers/provider-factory';

// Test constants
const FIXED_TEMPERATURE = 0.1;
const MOCK_INPUT_TOKENS = 100;
const MOCK_OUTPUT_TOKENS = 50;
const MOCK_TOTAL_TOKENS = 150;
const TEST_EVALUATOR_ID = 'eval-1';
const TEST_EVALUATOR_NAME = 'Test Evaluator';
const TEST_MODEL = 'gpt-4';
const TEST_SYSTEM_PROMPT = 'You are an evaluator.';
const TEST_USER_PROMPT_TEMPLATE = 'Problem: {problem}\nClarifications: {clarifications}\nSolution: {final_solution}\nRequirements: {requirements_info}';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  private responseText: string;
  private shouldFail: boolean;
  private failError: Error | null;
  private usage: CompletionUsage | undefined;
  private capturedRequest: CompletionRequest | null = null;

  constructor(
    responseText: string = 'Mock evaluation result',
    shouldFail: boolean = false,
    failError: Error | null = null,
    usage?: CompletionUsage
  ) {
    this.responseText = responseText;
    this.shouldFail = shouldFail;
    this.failError = failError;
    this.usage = usage ?? undefined;
  }

  setResponse(text: string) {
    this.responseText = text;
  }

  setFailure(shouldFail: boolean, error?: Error) {
    this.shouldFail = shouldFail;
    this.failError = error || new Error('Mock provider error');
  }

  getCapturedRequest(): CompletionRequest | null {
    return this.capturedRequest;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.capturedRequest = request;
    if (this.shouldFail) {
      throw this.failError || new Error('Mock provider error');
    }
    return {
      text: this.responseText,
      ...(this.usage !== undefined && { usage: this.usage }),
    };
  }
}

// Helper functions
function createMockEvaluatorConfig(): EvaluatorConfig {
  return {
    id: TEST_EVALUATOR_ID,
    name: TEST_EVALUATOR_NAME,
    model: TEST_MODEL,
    provider: LLM_PROVIDERS.OPENAI,
  };
}

function createMockEvaluatorInputs(): EvaluatorInputs {
  return {
    problem: 'Design a caching system',
    clarificationsMarkdown: 'No clarifications',
    finalSolution: 'Use Redis for caching',
    requirementsInfo: 'High availability required',
  };
}

describe('EvaluatorAgent', () => {
  let mockProvider: MockLLMProvider;
  let writeStderrSpy: jest.SpyInstance;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
    writeStderrSpy = jest.spyOn(consoleUtils, 'writeStderr').mockImplementation(() => {});
    jest.spyOn(providerFactory, 'createProvider').mockReturnValue(mockProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all properties correctly', () => {
      const config = createMockEvaluatorConfig();
      const agent = new EvaluatorAgent(
        config,
        mockProvider,
        TEST_SYSTEM_PROMPT,
        TEST_USER_PROMPT_TEMPLATE
      );

      expect(agent.id).toBe(TEST_EVALUATOR_ID);
      expect(agent.name).toBe(TEST_EVALUATOR_NAME);
      expect(agent.model).toBe(TEST_MODEL);
      expect(agent.provider).toBe(mockProvider);
      expect(agent.resolvedSystemPrompt).toBe(TEST_SYSTEM_PROMPT);
      expect(agent.resolvedUserPromptTemplate).toBe(TEST_USER_PROMPT_TEMPLATE);
    });
  });

  describe('fromConfig', () => {
    it('should create EvaluatorAgent with provider from factory', () => {
      const config = createMockEvaluatorConfig();
      const agent = EvaluatorAgent.fromConfig(
        config,
        TEST_SYSTEM_PROMPT,
        TEST_USER_PROMPT_TEMPLATE
      );

      expect(agent).toBeInstanceOf(EvaluatorAgent);
      expect(agent.id).toBe(TEST_EVALUATOR_ID);
      expect(agent.name).toBe(TEST_EVALUATOR_NAME);
      expect(agent.model).toBe(TEST_MODEL);
      expect(providerFactory.createProvider).toHaveBeenCalledWith(LLM_PROVIDERS.OPENAI);
    });

    it('should handle OpenRouter provider', () => {
      const config: EvaluatorConfig = {
        ...createMockEvaluatorConfig(),
        provider: LLM_PROVIDERS.OPENROUTER,
      };
      const agent = EvaluatorAgent.fromConfig(
        config,
        TEST_SYSTEM_PROMPT,
        TEST_USER_PROMPT_TEMPLATE
      );

      expect(agent.provider).toBe(mockProvider);
      expect(providerFactory.createProvider).toHaveBeenCalledWith(LLM_PROVIDERS.OPENROUTER);
    });
  });

  describe('evaluate', () => {
    describe('success path', () => {
      it('should return evaluation result with all fields', async () => {
        const mockUsage = {
          inputTokens: MOCK_INPUT_TOKENS,
          outputTokens: MOCK_OUTPUT_TOKENS,
          totalTokens: MOCK_TOTAL_TOKENS,
        };
        mockProvider = new MockLLMProvider('Evaluation result', false, null, mockUsage);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        const result = await agent.evaluate(inputs);

        expect(result).toBeDefined();
        expect(result.id).toBe(TEST_EVALUATOR_ID);
        expect(result.rawText).toBe('Evaluation result');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(result.usage).toEqual(mockUsage);
      });

      it('should return result without usage when usage is undefined', async () => {
        mockProvider = new MockLLMProvider('Evaluation result', false, null, undefined);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        const result = await agent.evaluate(inputs);

        expect(result.usage).toBeUndefined();
      });

      it('should call provider with correct parameters', async () => {
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await agent.evaluate(inputs);

        const capturedRequest = mockProvider.getCapturedRequest();
        expect(capturedRequest).toBeDefined();
        expect(capturedRequest?.model).toBe(TEST_MODEL);
        expect(capturedRequest?.temperature).toBe(FIXED_TEMPERATURE);
        expect(capturedRequest?.systemPrompt).toBe(TEST_SYSTEM_PROMPT);
        expect(capturedRequest?.userPrompt).toContain('Design a caching system');
        expect(capturedRequest?.userPrompt).toContain('No clarifications');
        expect(capturedRequest?.userPrompt).toContain('Use Redis for caching');
        expect(capturedRequest?.userPrompt).toContain('High availability required');
      });

      it('should measure latency correctly', async () => {
        // Mock provider with delay
        const delayedProvider = new MockLLMProvider('Result');
        const originalComplete = delayedProvider.complete.bind(delayedProvider);
        delayedProvider.complete = async (request: CompletionRequest) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return originalComplete(request);
        };

        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          delayedProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        const result = await agent.evaluate(inputs);

        expect(result.latencyMs).toBeGreaterThanOrEqual(10);
      });
    });

    describe('prompt rendering', () => {
      it('should replace all placeholders in user prompt template', async () => {
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await agent.evaluate(inputs);

        const capturedRequest = mockProvider.getCapturedRequest();
        expect(capturedRequest?.userPrompt).not.toContain('{problem}');
        expect(capturedRequest?.userPrompt).not.toContain('{clarifications}');
        expect(capturedRequest?.userPrompt).not.toContain('{final_solution}');
        expect(capturedRequest?.userPrompt).not.toContain('{requirements_info}');
      });

      it('should use "N/A" when requirementsInfo is missing', async () => {
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const { requirementsInfo, ...inputs } = createMockEvaluatorInputs();

        await agent.evaluate(inputs);

        const capturedRequest = mockProvider.getCapturedRequest();
        expect(capturedRequest?.userPrompt).toContain('Requirements: N/A');
      });

      it('should handle empty strings in inputs', async () => {
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs: EvaluatorInputs = {
          problem: '',
          clarificationsMarkdown: '',
          finalSolution: '',
          requirementsInfo: '',
        };

        await agent.evaluate(inputs);

        const capturedRequest = mockProvider.getCapturedRequest();
        expect(capturedRequest?.userPrompt).toBeDefined();
        expect(capturedRequest?.userPrompt).toContain('Problem: \n');
      });

      it('should handle special characters in inputs', async () => {
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs: EvaluatorInputs = {
          problem: 'Problem with "quotes" and \n newlines',
          clarificationsMarkdown: '```json\n{"key": "value"}\n```',
          finalSolution: 'Solution with {braces}',
          requirementsInfo: 'Requirements with $special$ chars',
        };

        await agent.evaluate(inputs);

        const capturedRequest = mockProvider.getCapturedRequest();
        expect(capturedRequest?.userPrompt).toContain('Problem with "quotes"');
        expect(capturedRequest?.userPrompt).toContain('```json');
        expect(capturedRequest?.userPrompt).toContain('Solution with {braces}');
        expect(capturedRequest?.userPrompt).toContain('$special$');
      });
    });

    describe('error handling', () => {
      it('should catch and re-throw provider errors', async () => {
        const error = new Error('Provider failed');
        mockProvider = new MockLLMProvider('', true, error);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await expect(agent.evaluate(inputs)).rejects.toThrow('Provider failed');
      });

      it('should write error message to stderr with evaluator ID', async () => {
        const error = new Error('Provider failed');
        mockProvider = new MockLLMProvider('', true, error);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await expect(agent.evaluate(inputs)).rejects.toThrow();

        expect(writeStderrSpy).toHaveBeenCalledWith(
          `[${TEST_EVALUATOR_ID}] Evaluation failed: Provider failed\n`
        );
      });

      it('should handle errors without message', async () => {
        const error = new Error();
        // Error() with no message has message as empty string, not undefined
        mockProvider = new MockLLMProvider('', true, error);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await expect(agent.evaluate(inputs)).rejects.toThrow();

        // When err.message is empty string, it uses empty string (not 'unknown error')
        // because empty string is not nullish. Only undefined/null trigger ?? fallback.
        expect(writeStderrSpy).toHaveBeenCalledWith(
          `[${TEST_EVALUATOR_ID}] Evaluation failed: \n`
        );
      });

      it('should handle non-Error objects thrown', async () => {
        const error = { message: 'Custom error object' } as any;
        mockProvider = new MockLLMProvider('', true, error);
        const config = createMockEvaluatorConfig();
        const agent = new EvaluatorAgent(
          config,
          mockProvider,
          TEST_SYSTEM_PROMPT,
          TEST_USER_PROMPT_TEMPLATE
        );
        const inputs = createMockEvaluatorInputs();

        await expect(agent.evaluate(inputs)).rejects.toBeDefined();

        expect(writeStderrSpy).toHaveBeenCalledWith(
          `[${TEST_EVALUATOR_ID}] Evaluation failed: Custom error object\n`
        );
      });
    });
  });
});

