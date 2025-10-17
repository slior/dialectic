import { OpenRouterProvider } from '../src/providers/openrouter-provider';
import { CompletionRequest } from '../src/providers/llm-provider';

// Mock OpenAI SDK
const mockResponsesCreate = jest.fn();
const mockChatCompletionsCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      responses: {
        create: mockResponsesCreate,
      },
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    })),
  };
});

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider('test-api-key');
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create OpenAI client with OpenRouter configuration', () => {
      // Create a new provider to test constructor
      new OpenRouterProvider('test-api-key');
      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'dialectic',
          'X-Title': 'Dialectic - Multi-Agent Debate',
        },
      });
    });
  });

  describe('complete', () => {
    const mockRequest: CompletionRequest = {
      model: 'openai/gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Hello, world!',
      temperature: 0.7,
      maxTokens: 100,
    };

    it('should use Responses API successfully', async () => {
      const mockResponse = {
        output_text: 'Hello! How can I help you?',
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(mockRequest);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: 0.7,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: 100,
      });

      expect(result).toEqual({
        text: 'Hello! How can I help you?',
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
      });
    });

    it('should handle Responses API with output array format', async () => {
      const mockResponse = {
        output: [
          {
            content: [
              {
                text: 'Hello! How can I help you?',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(mockRequest);

      expect(result).toEqual({
        text: 'Hello! How can I help you?',
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
      });
    });

    it('should fallback to Chat Completions API when Responses API fails', async () => {
      const mockChatResponse = {
        choices: [
          {
            message: {
              content: 'Hello! How can I help you?',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockRejectedValue(new Error('Responses API not available'));
      mockChatCompletionsCreate.mockResolvedValue(mockChatResponse);

      const result = await provider.complete(mockRequest);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      expect(result).toEqual({
        text: 'Hello! How can I help you?',
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
      });
    });

    it('should handle requests without maxTokens', async () => {
      const requestWithoutMaxTokens: CompletionRequest = {
        model: mockRequest.model,
        systemPrompt: mockRequest.systemPrompt,
        userPrompt: mockRequest.userPrompt,
        temperature: mockRequest.temperature,
        // maxTokens intentionally omitted
      };

      const mockResponse = {
        output_text: 'Hello! How can I help you?',
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      await provider.complete(requestWithoutMaxTokens);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: 0.7,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
      });
    });

    it('should handle requests with stopSequences', async () => {
      const requestWithStopSequences = {
        ...mockRequest,
        stopSequences: ['\n\n', 'Human:'],
      };

      const mockResponse = {
        output_text: 'Hello! How can I help you?',
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      await provider.complete(requestWithStopSequences);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: 0.7,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: 100,
        stop: ['\n\n', 'Human:'],
      });
    });

    it('should handle responses without usage information', async () => {
      const mockResponse = {
        output_text: 'Hello! How can I help you?',
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(mockRequest);

      expect(result).toEqual({
        text: 'Hello! How can I help you?',
      });
    });

    it('should handle different model names including prefixed models', async () => {
      const anthropicRequest = {
        ...mockRequest,
        model: 'anthropic/claude-3-sonnet',
      };

      const mockResponse = {
        output_text: 'Hello from Claude!',
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(anthropicRequest);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'anthropic/claude-3-sonnet',
        temperature: 0.7,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: 100,
      });

      expect(result.text).toBe('Hello from Claude!');
    });
  });
});
