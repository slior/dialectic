import type { Langfuse } from 'langfuse';

import { LLMProvider, CompletionRequest } from '../providers/llm-provider';
import { TracingContext, SPAN_LEVEL } from '../types/tracing.types';

import * as consoleUtils from './console';
import { TracingLLMProvider } from './tracing-provider';
import * as tracingUtils from './tracing-utils';


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
    jest.clearAllMocks();
    jest.spyOn(tracingUtils, 'getSpanParent').mockImplementation((context, agentId) => {
      if (agentId && context.currentSpans.has(agentId)) {
        return context.currentSpans.get(agentId)!;
      }
      return context.trace;
    });
    jest.spyOn(consoleUtils, 'logWarning').mockImplementation(() => {});

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
            provider: 'openai',
            iteration: 0,
          }),
        })
      );
    });

    it('should handle response without usage', async () => {
      mockProvider.complete = jest.fn().mockResolvedValue({
        text: 'response without usage',
      });

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
            text: 'response without usage',
          }),
        })
      );
      const endCall = mockGeneration.end.mock.calls[0][0];
      expect(endCall.usage).toBeUndefined();
    });

    it('should handle response with toolCalls', async () => {
      const toolCalls = [
        {
          id: 'call-1',
          name: 'test_tool',
          arguments: { input: 'test' },
        },
      ];

      mockProvider.complete = jest.fn().mockResolvedValue({
        text: 'response with tools',
        toolCalls,
      });

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
            text: 'response with tools',
            toolCalls,
          }),
        })
      );
    });

    it('should handle messages in request', async () => {
      const messages = [
        { role: 'system' as const, content: 'System message' },
        { role: 'user' as const, content: 'User message' },
      ];

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
        messages,
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            messages,
          }),
        })
      );
    });

    it('should handle provider errors and end generation with error', async () => {
      const providerError = new Error('Provider error');
      mockProvider.complete = jest.fn().mockRejectedValue(providerError);

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await expect(tracingProvider.complete(request)).rejects.toThrow('Provider error');

      expect(mockGeneration.end).toHaveBeenCalledWith({
        level: SPAN_LEVEL.ERROR,
        statusMessage: 'Provider error',
      });
    });

    it('should use span parent when agentId is set', async () => {
      const agentId = 'agent-1';
      tracingContext.currentSpans.set(agentId, mockSpan as unknown as ReturnType<TracingContext['trace']['span']>);
      tracingProvider.setAgentId(agentId);

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockSpan.generation).toHaveBeenCalled();
      expect(mockTrace.generation).not.toHaveBeenCalled();
    });

    it('should use trace parent when agentId is undefined', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalled();
      expect(mockSpan.generation).not.toHaveBeenCalled();
    });

    it('should use trace parent when agentId is set but span not found', async () => {
      const agentId = 'agent-1';
      tracingProvider.setAgentId(agentId);

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalled();
      expect(mockSpan.generation).not.toHaveBeenCalled();
    });

    it('should handle partial usage fields with null values', async () => {
      mockProvider.complete = jest.fn().mockResolvedValue({
        text: 'response',
        usage: {
          inputTokens: 10,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      });

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      const endCall = mockGeneration.end.mock.calls[0][0];
      expect(endCall.usage).toEqual({
        input: 10,
        output: null,
        total: null,
        unit: 'TOKENS',
      });
    });

    it('should handle empty usage object', async () => {
      mockProvider.complete = jest.fn().mockResolvedValue({
        text: 'response',
        usage: {},
      });

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);

      const endCall = mockGeneration.end.mock.calls[0][0];
      expect(endCall.usage).toEqual({
        input: null,
        output: null,
        total: null,
        unit: 'TOKENS',
      });
    });

    it('should handle error when generation.end throws', async () => {
      const endError = new Error('End error');
      mockGeneration.end = jest.fn().mockImplementation(() => {
        throw endError;
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
      expect(consoleUtils.logWarning).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for LLM call')
      );
    });

    it('should handle error when getSpanParent throws', async () => {
      jest.spyOn(tracingUtils, 'getSpanParent').mockImplementation(() => {
        throw new Error('getSpanParent error');
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
      expect(consoleUtils.logWarning).toHaveBeenCalledWith(
        expect.stringContaining('Langfuse tracing failed for LLM call')
      );
    });

    it('should increment iteration count correctly across multiple calls', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);
      await tracingProvider.complete(request);
      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation-0',
          metadata: expect.objectContaining({ iteration: 0 }),
        })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation-1',
          metadata: expect.objectContaining({ iteration: 1 }),
        })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'llm-generation-2',
          metadata: expect.objectContaining({ iteration: 2 }),
        })
      );
    });
  });

  describe('setAgentId', () => {
    it('should set agentId correctly', () => {
      const agentId = 'agent-1';
      tracingProvider.setAgentId(agentId);

      // Verify agentId is set by checking it's used in getSpanParent call
      tracingContext.currentSpans.set(agentId, mockSpan as unknown as ReturnType<TracingContext['trace']['span']>);

      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      tracingProvider.complete(request);

      expect(tracingUtils.getSpanParent).toHaveBeenCalledWith(tracingContext, agentId);
    });

    it('should allow changing agentId', () => {
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';
      const mockSpan2: MockLangfuseSpan = {
        end: jest.fn(),
        generation: jest.fn().mockReturnValue(mockGeneration),
      };

      tracingContext.currentSpans.set(agentId1, mockSpan as unknown as ReturnType<TracingContext['trace']['span']>);
      tracingContext.currentSpans.set(agentId2, mockSpan2 as unknown as ReturnType<TracingContext['trace']['span']>);

      tracingProvider.setAgentId(agentId1);
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      tracingProvider.complete(request);
      expect(mockSpan.generation).toHaveBeenCalled();

      jest.clearAllMocks();
      tracingProvider.setAgentId(agentId2);
      tracingProvider.complete(request);
      expect(mockSpan2.generation).toHaveBeenCalled();
    });
  });

  describe('resetIterationCount', () => {
    it('should reset iteration count to 0', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);
      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-1' })
      );

      tracingProvider.resetIterationCount();

      jest.clearAllMocks();
      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
    });

    it('should reset iteration count multiple times', async () => {
      const request: CompletionRequest = {
        model: 'gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      };

      await tracingProvider.complete(request);
      tracingProvider.resetIterationCount();
      await tracingProvider.complete(request);
      tracingProvider.resetIterationCount();
      await tracingProvider.complete(request);

      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
      expect(mockTrace.generation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'llm-generation-0' })
      );
    });
  });
});

