import { OpenAIProvider, LLMProvider, ToolSchema } from '@dialectic/core';
import OpenAI from 'openai';

// Test constants
const DEFAULT_TEMPERATURE = 0.5;

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

describe('OpenAIProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock for fallback test
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    });
  });

  it('falls back to chat completions when Responses API is unavailable', async () => {
    const provider: LLMProvider = new OpenAIProvider('fake');
    const res = await provider.complete({ model: 'gpt-4', systemPrompt: 'sys', userPrompt: 'hello', temperature: DEFAULT_TEMPERATURE });
    expect(res.text).toBe('ok');
  });
});

describe('OpenAI Provider Tool Calling', () => {
  let provider: OpenAIProvider;
  let mockClient: {
    responses: { create: jest.Mock };
    chat: { completions: { create: jest.Mock } };
  };

  const mockToolSchema: ToolSchema = {
    name: 'test_tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Input parameter',
        },
      },
      required: ['input'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      responses: {
        create: mockResponsesCreate,
      },
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    };

    // Reset the mock implementation to return our mock client
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockClient as any);
    provider = new OpenAIProvider('test-api-key');
  });

  describe('Tools Parameter', () => {
    it('should pass tools parameter to OpenAI SDK', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response text',
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(mockResponsesCreate).toHaveBeenCalled();
      const callArgs = mockResponsesCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(Array.isArray(callArgs.tools)).toBe(true);
    });

    it('should convert ToolSchema to OpenAI function calling format', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response',
        usage: { total_tokens: 10 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      const callArgs = mockResponsesCreate.mock.calls[0][0];
      const tool = callArgs.tools[0];
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBe('test_tool');
      expect(tool.function.description).toBe('A test tool');
      expect(tool.function.parameters).toBeDefined();
    });
  });

  describe('Tool Calls Extraction - Responses API', () => {
    it('should extract tool_calls from Responses API response', async () => {
      const mockToolCalls = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{"input":"test"}',
          },
        },
      ];

      mockResponsesCreate.mockResolvedValue({
        output_text: 'I need to call a tool',
        tool_calls: mockToolCalls,
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.name).toBe('test_tool');
      expect(response.toolCalls?.[0]?.id).toBe('call_1');
    });

    it('should extract tool_calls from nested output structure', async () => {
      const mockToolCalls = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{}',
          },
        },
      ];

      mockResponsesCreate.mockResolvedValue({
        output: [
          {
            content: [
              {
                text: 'Response',
                tool_calls: mockToolCalls,
              },
            ],
          },
        ],
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
    });

    it('should return both text and toolCalls in response', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response text',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        ],
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(response.text).toBe('Response text');
      expect(response.toolCalls).toBeDefined();
    });
  });

  describe('Tool Calls Extraction - Chat Completions API Fallback', () => {
    it('should extract tool_calls from Chat Completions API when Responses API fails', async () => {
      const mockToolCalls = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{"input":"test"}',
          },
        },
      ];

      // Responses API fails
      mockResponsesCreate.mockRejectedValue(new Error('API error'));

      // Chat Completions succeeds
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response text',
              tool_calls: mockToolCalls,
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.name).toBe('test_tool');
    });

    it('should pass tools to Chat Completions API fallback', async () => {
      mockResponsesCreate.mockRejectedValue(new Error('Error'));
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { total_tokens: 10 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(mockChatCompletionsCreate).toHaveBeenCalled();
      const callArgs = mockChatCompletionsCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle tools provided but not supported gracefully', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response without tool calls',
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
        tools: [mockToolSchema],
      });

      expect(response.text).toBeDefined();
      expect(response.toolCalls).toBeUndefined();
    });

    it('should work without tools parameter', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response',
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: DEFAULT_TEMPERATURE,
      });

      expect(response.text).toBe('Response');
      expect(response.toolCalls).toBeUndefined();
    });
  });
});

