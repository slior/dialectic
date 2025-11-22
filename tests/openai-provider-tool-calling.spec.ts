import { OpenAIProvider } from '../src/providers/openai-provider';
import { ToolSchema } from '../src/types/tool.types';
import OpenAI from 'openai';

// Mock OpenAI client
jest.mock('openai');

describe('OpenAI Provider Tool Calling', () => {
  let provider: OpenAIProvider;
  let mockClient: jest.Mocked<OpenAI>;

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
    mockClient = {
      responses: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as any;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockClient as any);
    provider = new OpenAIProvider('test-api-key');
  });

  describe('Tools Parameter', () => {
    it('should pass tools parameter to OpenAI SDK', async () => {
      mockClient.responses.create = jest.fn().mockResolvedValue({
        output_text: 'Response text',
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      expect(mockClient.responses.create).toHaveBeenCalled();
      const callArgs = (mockClient.responses.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(Array.isArray(callArgs.tools)).toBe(true);
    });

    it('should convert ToolSchema to OpenAI function calling format', async () => {
      mockClient.responses.create = jest.fn().mockResolvedValue({
        output_text: 'Response',
        usage: { total_tokens: 10 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      const callArgs = (mockClient.responses.create as jest.Mock).mock.calls[0][0];
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

      mockClient.responses.create = jest.fn().mockResolvedValue({
        output_text: 'I need to call a tool',
        tool_calls: mockToolCalls,
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
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

      mockClient.responses.create = jest.fn().mockResolvedValue({
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
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
    });

    it('should return both text and toolCalls in response', async () => {
      mockClient.responses.create = jest.fn().mockResolvedValue({
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
        temperature: 0.5,
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
      mockClient.responses.create = jest.fn().mockRejectedValue(new Error('API error'));

      // Chat Completions succeeds
      mockClient.chat.completions.create = jest.fn().mockResolvedValue({
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
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0]?.name).toBe('test_tool');
    });

    it('should pass tools to Chat Completions API fallback', async () => {
      mockClient.responses.create = jest.fn().mockRejectedValue(new Error('Error'));
      mockClient.chat.completions.create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { total_tokens: 10 },
      });

      await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      expect(mockClient.chat.completions.create).toHaveBeenCalled();
      const callArgs = (mockClient.chat.completions.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle tools provided but not supported gracefully', async () => {
      mockClient.responses.create = jest.fn().mockResolvedValue({
        output_text: 'Response without tool calls',
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
        tools: [mockToolSchema],
      });

      expect(response.text).toBeDefined();
      expect(response.toolCalls).toBeUndefined();
    });

    it('should work without tools parameter', async () => {
      mockClient.responses.create = jest.fn().mockResolvedValue({
        output_text: 'Response',
        usage: { total_tokens: 10 },
      });

      const response = await provider.complete({
        model: 'gpt-4',
        systemPrompt: 'System',
        userPrompt: 'User',
        temperature: 0.5,
      });

      expect(response.text).toBe('Response');
      expect(response.toolCalls).toBeUndefined();
    });
  });
});

