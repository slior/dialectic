import { TracingLLMProvider, LLMProvider, CompletionRequest, TracingContext } from 'dialectic-core';
import type { Langfuse } from 'langfuse';

// Test constants
const DEFAULT_TEMPERATURE = 0.5;
const VERBOSE_TEMPERATURE = 0.7;
const MOCK_INPUT_TOKENS = 50;
const MOCK_OUTPUT_TOKENS = 50;
const MOCK_TOTAL_TOKENS = 100;

/**
 * Mock type for Langfuse generation with jest mocks.
 */
interface MockLangfuseGeneration {
  end: jest.Mock;
}

/**
 * Mock type for Langfuse span with jest mocks.
 */
interface MockLangfuseSpan {
  end: jest.Mock;
  generation: jest.Mock<MockLangfuseGeneration>;
}

/**
 * Mock type for Langfuse trace with jest mocks.
 */
interface MockLangfuseTrace {
  span: jest.Mock<MockLangfuseSpan>;
  generation: jest.Mock<MockLangfuseGeneration>;
}

/**
 * Mock type for Langfuse client with jest mocks.
 */
interface MockLangfuse {
  trace: jest.Mock<MockLangfuseTrace>;
  flushAsync: jest.Mock<Promise<void>>;
}

describe('TracingLLMProvider', () => {
  let mockProvider: jest.Mocked<LLMProvider>;
  let mockLangfuse: MockLangfuse;
  let mockTrace: MockLangfuseTrace;
  let mockSpan: MockLangfuseSpan;
  let mockGeneration: MockLangfuseGeneration;
  let tracingContext: TracingContext;
  let tracingProvider: TracingLLMProvider;

  beforeEach(() => {
    mockProvider = {
      complete: jest.fn().mockResolvedValue({
        text: 'test response',
        usage: {
          inputTokens: MOCK_INPUT_TOKENS,
          outputTokens: MOCK_OUTPUT_TOKENS,
          totalTokens: MOCK_TOTAL_TOKENS,
        },
      }),
    } as jest.Mocked<LLMProvider>;

    mockGeneration = {
      end: jest.fn(),
    };

    mockSpan = {
      end: jest.fn(),
      generation: jest.fn().mockReturnValue(mockGeneration),
    };

    mockTrace = {
      span: jest.fn().mockReturnValue(mockSpan),
      generation: jest.fn().mockReturnValue(mockGeneration),
    };

    mockLangfuse = {
      trace: jest.fn().mockReturnValue(mockTrace),
      flushAsync: jest.fn().mockResolvedValue(undefined),
    };

    tracingContext = {
      langfuse: mockLangfuse as unknown as Langfuse,
      trace: mockTrace as unknown as ReturnType<Langfuse['trace']>,
      currentSpans: new Map(),
    };

    tracingProvider = new TracingLLMProvider(mockProvider, tracingContext);
  });

  describe('complete', () => {
    it('should create generation span and wrap provider call', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      const result = await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalled();
      expect(mockProvider.complete).toHaveBeenCalledWith(request);
      expect(result).toBeDefined();
      expect(result.text).toBe('test response');
    });

    it('should capture input/output correctly', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation-0',
          input: expect.objectContaining({
            systemPrompt: 'System prompt',
            userPrompt: 'User prompt',
          }),
        })
      );
    });

    it('should capture usage metadata', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockGeneration.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            text: 'test response',
          }),
          usage: expect.any(Object),
        })
      );
      // Verify usage was passed (structure may vary)
      const endCall = mockGeneration.end.mock.calls[0][0];
      expect(endCall.usage).toBeDefined();
    });

    it('should handle tool calling iterations correctly', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
        tools: [],
        messages: [],
      };

      await tracingProvider.complete(request);
      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-1' })
      );
    });

    it('should handle tracing errors gracefully', async () => {
      mockTrace.generation = jest.fn().mockImplementation(() => {
        throw new Error('Tracing error');
      });

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      const result = await tracingProvider.complete(request);

      expect(result).toBeDefined();
      expect(result.text).toBe('test response');
      expect(mockProvider.complete).toHaveBeenCalled();
    });

    it('should include correct metadata in generation tags', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: VERBOSE_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            model: 'gpt-4',
            temperature: VERBOSE_TEMPERATURE,
          }),
        })
      );
    });
  });
});

