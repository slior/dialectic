import { OpenRouterProvider, CompletionRequest } from 'dialectic-core';

// Test constants
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 100;
const MOCK_INPUT_TOKENS = 10;
const MOCK_OUTPUT_TOKENS = 8;
const MOCK_TOTAL_TOKENS = 18;

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
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
    };

    it('should use Responses API successfully', async () => {
      const mockResponse = {
        output_text: 'Hello! How can I help you?',
        usage: {
        input_tokens: MOCK_INPUT_TOKENS,
        output_tokens: MOCK_OUTPUT_TOKENS,
        total_tokens: MOCK_TOTAL_TOKENS,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(mockRequest);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: DEFAULT_MAX_TOKENS,
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
        input_tokens: MOCK_INPUT_TOKENS,
        output_tokens: MOCK_OUTPUT_TOKENS,
        total_tokens: MOCK_TOTAL_TOKENS,
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
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_TOKENS,
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
        input_tokens: MOCK_INPUT_TOKENS,
        output_tokens: MOCK_OUTPUT_TOKENS,
        total_tokens: MOCK_TOTAL_TOKENS,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      await provider.complete(requestWithoutMaxTokens);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: DEFAULT_TEMPERATURE,
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
        input_tokens: MOCK_INPUT_TOKENS,
        output_tokens: MOCK_OUTPUT_TOKENS,
        total_tokens: MOCK_TOTAL_TOKENS,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      await provider.complete(requestWithStopSequences);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4',
        temperature: DEFAULT_TEMPERATURE,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: DEFAULT_MAX_TOKENS,
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
        input_tokens: MOCK_INPUT_TOKENS,
        output_tokens: MOCK_OUTPUT_TOKENS,
        total_tokens: MOCK_TOTAL_TOKENS,
        },
      };

      mockResponsesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete(anthropicRequest);

      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'anthropic/claude-3-sonnet',
        temperature: DEFAULT_TEMPERATURE,
        input: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
        ],
        max_output_tokens: DEFAULT_MAX_TOKENS,
      });

      expect(result.text).toBe('Hello from Claude!');
    });
  });
});

