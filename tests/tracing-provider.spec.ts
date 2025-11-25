import { TracingLLMProvider } from '../src/utils/tracing-provider';
import { LLMProvider, CompletionRequest } from '../src/providers/llm-provider';
import { TracingContext } from '../src/types/tracing.types';

describe('TracingLLMProvider', () => {
  let mockProvider: jest.Mocked<LLMProvider>;
  let mockLangfuse: any;
  let mockTrace: any;
  let mockSpan: any;
  let mockGeneration: any;
  let tracingContext: TracingContext;
  let tracingProvider: TracingLLMProvider;

  beforeEach(() => {
    mockProvider = {
      complete: jest.fn().mockResolvedValue({
        text: 'test response',
        usage: {
          inputTokens: 50,
          outputTokens: 50,
          totalTokens: 100,
        },
      }),
    } as any;

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
    } as any;

    tracingContext = {
      langfuse: mockLangfuse,
      trace: mockTrace,
      currentSpans: new Map(),
    };

    tracingProvider = new TracingLLMProvider(mockProvider, tracingContext);
  });

  describe('complete', () => {
    it('should create generation span and wrap provider call', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: 0.5,
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
        temperature: 0.5,
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
        temperature: 0.5,
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
        temperature: 0.5,
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
        temperature: 0.5,
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
        temperature: 0.7,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            model: 'gpt-4',
            temperature: 0.7,
          }),
        })
      );
    });
  });
});

