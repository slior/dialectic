import OpenAI from 'openai';

import { ToolSchema } from '../types/tool.types';


import { CHAT_ROLES, type CompletionRequest, type ChatMessage } from './llm-provider';
import {
  buildCompletionResponse,
  buildResponsesPayload,
  completeWithFallback,
  convertChatUsage,
  convertResponsesUsage,
  convertToolsToOpenAIFormat,
  extractOpenAIChatCompletionTypes,
  extractToolCallsFromChatAPI,
  extractToolCallsFromResponsesAPI,
  getMessages,
  getOpenAITools,
  tryWithChatCompletionAPI,
  tryWithResponsesAPI,
  type ResponsesAPIClient,
  type ResponsesAPIResponse,
  type ResponsesAPIUsage,
  type ChatCompletionMessage,
  type ChatCompletionUsage,
} from './openai-sdk-utils';


// --- Test fixtures (reused across tests) ---

const mockToolSchema: ToolSchema = {
  name: 'test_tool',
  description: 'A test tool',
  parameters: {
    type: 'object',
    properties: { input: { type: 'string', description: 'Input' } },
    required: ['input'],
  },
};

function createBaseRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model: 'gpt-4',
    systemPrompt: 'sys',
    userPrompt: 'user',
    temperature: 0.5,
    ...overrides,
  };
}

const baseMessages: ChatMessage[] = [
  { role: CHAT_ROLES.SYSTEM, content: 'sys' },
  { role: CHAT_ROLES.USER, content: 'user' },
];

describe('openai-sdk-utils', () => {
  describe('convertToolsToOpenAIFormat', () => {
    it('converts ToolSchema array to OpenAI format', () => {
      const tools: ToolSchema[] = [mockToolSchema];
      const out = convertToolsToOpenAIFormat(tools);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: mockToolSchema.parameters,
        },
      });
    });

    it('converts multiple tools', () => {
      const t2: ToolSchema = { ...mockToolSchema, name: 'tool2', description: 'Second' };
      const out = convertToolsToOpenAIFormat([mockToolSchema, t2]);
      expect(out).toHaveLength(2);
      expect(out[0]!.function.name).toBe('test_tool');
      expect(out[1]!.function.name).toBe('tool2');
    });
  });

  describe('getOpenAITools', () => {
    it('returns converted tools when request has non-empty tools', () => {
      const req = createBaseRequest({ tools: [mockToolSchema] });
      const out = getOpenAITools(req);
      expect(out).toBeDefined();
      expect(out).toHaveLength(1);
      expect(out![0]!.function.name).toBe('test_tool');
    });

    it('returns undefined when request has no tools', () => {
      expect(getOpenAITools(createBaseRequest())).toBeUndefined();
    });

    it('returns undefined when request has empty tools array', () => {
      expect(getOpenAITools(createBaseRequest({ tools: [] }))).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('returns request.messages when provided', () => {
      const msgs: ChatMessage[] = [{ role: CHAT_ROLES.USER, content: 'custom' }];
      const out = getMessages(createBaseRequest({ messages: msgs }));
      expect(out).toBe(msgs);
    });

    it('builds [system, user] from systemPrompt and userPrompt when messages omitted', () => {
      const out = getMessages(createBaseRequest());
      expect(out).toEqual([
        { role: CHAT_ROLES.SYSTEM, content: 'sys' },
        { role: CHAT_ROLES.USER, content: 'user' },
      ]);
    });
  });

  describe('buildResponsesPayload', () => {
    it('builds minimal payload', () => {
      const req = createBaseRequest();
      const out = buildResponsesPayload(req, baseMessages);
      expect(out).toEqual({
        model: 'gpt-4',
        temperature: 0.5,
        input: baseMessages,
      });
    });

    it('adds max_output_tokens when maxTokens is set', () => {
      const req = createBaseRequest({ maxTokens: 100 });
      const out = buildResponsesPayload(req, baseMessages);
      expect(out.max_output_tokens).toBe(100);
    });

    it('adds stop when stopSequences is set', () => {
      const req = createBaseRequest({ stopSequences: ['\n\n'] });
      const out = buildResponsesPayload(req, baseMessages);
      expect(out.stop).toEqual(['\n\n']);
    });

    it('adds tools when openAITools is provided', () => {
      const tools = convertToolsToOpenAIFormat([mockToolSchema]);
      const out = buildResponsesPayload(createBaseRequest(), baseMessages, tools);
      expect(out.tools).toBe(tools);
    });

    it('omits max_output_tokens when maxTokens is not set', () => {
      const req = createBaseRequest();
      const out = buildResponsesPayload(req, baseMessages);
      expect(out).not.toHaveProperty('max_output_tokens');
    });

    it('omits max_output_tokens when maxTokens is 0 (falsy but we only check != null)', () => {
      const req = createBaseRequest({ maxTokens: 0 });
      const out = buildResponsesPayload(req, baseMessages);
      expect(out.max_output_tokens).toBe(0);
    });
  });

  describe('convertResponsesUsage', () => {
    it('returns undefined when usage is undefined', () => {
      expect(convertResponsesUsage(undefined)).toBeUndefined();
    });

    it('maps snake_case to CompletionUsage', () => {
      const u: ResponsesAPIUsage = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
      expect(convertResponsesUsage(u)).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    });

    it('maps camelCase to CompletionUsage', () => {
      const u: ResponsesAPIUsage = { inputTokens: 4, outputTokens: 5, totalTokens: 6 };
      expect(convertResponsesUsage(u)).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 6 });
    });

    it('prefers snake_case when both present', () => {
      const u: ResponsesAPIUsage = { input_tokens: 1, inputTokens: 9, output_tokens: 2, outputTokens: 9, total_tokens: 3, totalTokens: 9 };
      expect(convertResponsesUsage(u)).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    });

    it('includes only defined token fields', () => {
      expect(convertResponsesUsage({ input_tokens: 1 })).toEqual({ inputTokens: 1 });
      expect(convertResponsesUsage({ output_tokens: 2 })).toEqual({ outputTokens: 2 });
      expect(convertResponsesUsage({ total_tokens: 3 })).toEqual({ totalTokens: 3 });
    });

    it('returns empty object when usage has no token fields', () => {
      expect(convertResponsesUsage({})).toEqual({});
    });
  });

  describe('buildCompletionResponse', () => {
    it('builds response with text only', () => {
      expect(buildCompletionResponse('hi')).toEqual({ text: 'hi' });
    });

    it('includes usage when provided', () => {
      const u: ResponsesAPIUsage = { total_tokens: 10 };
      expect(buildCompletionResponse('hi', u)).toEqual({ text: 'hi', usage: { totalTokens: 10 } });
    });

    it('includes toolCalls when provided', () => {
      const tc = [{ id: 'x', name: 'f', arguments: '{}' }];
      expect(buildCompletionResponse('hi', undefined, tc)).toEqual({ text: 'hi', toolCalls: tc });
    });

    it('includes both usage and toolCalls', () => {
      const u: ResponsesAPIUsage = { total_tokens: 5 };
      const tc = [{ id: 'y', name: 'g', arguments: '{"a":1}' }];
      expect(buildCompletionResponse('ok', u, tc)).toEqual({
        text: 'ok',
        usage: { totalTokens: 5 },
        toolCalls: tc,
      });
    });

    it('does not add usage when convertResponsesUsage returns undefined', () => {
      expect(buildCompletionResponse('x', undefined)).toEqual({ text: 'x' });
    });
  });

  describe('extractToolCallsFromResponsesAPI', () => {
    it('returns undefined when no tool_calls and no nested output', () => {
      expect(extractToolCallsFromResponsesAPI({})).toBeUndefined();
      expect(extractToolCallsFromResponsesAPI({ output_text: 'x' })).toBeUndefined();
    });

    it('extracts from top-level tool_calls', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [
          { id: 'c1', function: { name: 'foo', arguments: '{"x":1}' } },
          { name: 'bar', function: { name: 'bar', arguments: '{}' } },
        ],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(2);
      expect(out![0]).toEqual({ id: 'c1', name: 'foo', arguments: '{"x":1}' });
      expect(out![1]).toEqual({ id: 'bar', name: 'bar', arguments: '{}' });
    });

    it('uses tc.function?.name as id when tc.id is missing', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [{ function: { name: 'f1', arguments: '{}' } }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.id).toBe('f1');
    });

    it('uses tc.name when tc.function?.name is missing', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [{ id: 'x', name: 'n1', function: {} }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.name).toBe('n1');
    });

    it('stringifies arguments when not a string', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [{ id: 'x', function: { name: 'f', arguments: { a: 1 } } }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.arguments).toBe('{"a":1}');
    });

    it('uses empty object JSON when function.arguments is undefined', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [{ id: 'x', function: { name: 'f' } }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.arguments).toBe('{}');
    });

    it('uses empty id and name when tc.id, tc.function?.name, and tc.name are all missing', () => {
      const resp: ResponsesAPIResponse = {
        tool_calls: [{ function: { arguments: '{}' } }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.id).toBe('');
      expect(out![0]!.name).toBe('');
    });

    it('extracts from nested output[0].content[0].tool_calls', () => {
      const resp: ResponsesAPIResponse = {
        output: [
          {
            content: [
              {
                tool_calls: [
                  { id: 'n1', function: { name: 'nested', arguments: '{"k":"v"}' } },
                ],
              },
            ],
          },
        ],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]).toEqual({ id: 'n1', name: 'nested', arguments: '{"k":"v"}' });
    });

    it('returns undefined when output is array but content[0].tool_calls is missing', () => {
      const resp: ResponsesAPIResponse = {
        output: [{ content: [{ text: 'hi' }] }],
      };
      expect(extractToolCallsFromResponsesAPI(resp)).toBeUndefined();
    });

    it('nested tool_calls uses empty id and name when all optional fields missing', () => {
      const resp: ResponsesAPIResponse = {
        output: [{ content: [{ tool_calls: [{ function: {} }] }] }],
      };
      const out = extractToolCallsFromResponsesAPI(resp);
      expect(out).toHaveLength(1);
      expect(out![0]!.id).toBe('');
      expect(out![0]!.name).toBe('');
      expect(out![0]!.arguments).toBe('{}');
    });

    it('returns undefined when output is object (not array)', () => {
      const resp: ResponsesAPIResponse = { output: { usage: { total_tokens: 1 } } };
      expect(extractToolCallsFromResponsesAPI(resp)).toBeUndefined();
    });
  });

  describe('tryWithResponsesAPI', () => {
    it('returns buildCompletionResponse when resp.output_text is present', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'hello',
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      });
      const client = { responses: { create } };
      const req = createBaseRequest();
      const out = await tryWithResponsesAPI(client, req, baseMessages);
      expect(out).toEqual({
        text: 'hello',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4', temperature: 0.5, input: baseMessages })
      );
    });

    it('uses resp.usage when resp.output is array (so output.usage not used)', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'hi',
        usage: { total_tokens: 7 },
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.usage).toEqual({ totalTokens: 7 });
    });

    it('uses undefined for usage when resp.usage absent and resp.output is array', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'txt',
        output: [{ content: [{ text: 'ignored' }] }],
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.text).toBe('txt');
      expect(out.usage).toBeUndefined();
    });

    it('uses resp.output.usage when output is object and resp.usage is absent', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'there',
        output: { usage: { total_tokens: 11 } },
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.usage).toEqual({ totalTokens: 11 });
    });

    it('includes toolCalls when present in response', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'call',
        tool_calls: [{ id: 't1', function: { name: 'fn', arguments: '{}' } }],
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.toolCalls).toHaveLength(1);
      expect(out.toolCalls![0]!.name).toBe('fn');
    });

    it('returns from output[0].content[0].text when output_text is absent', async () => {
      const create = jest.fn().mockResolvedValue({
        output: [{ content: [{ text: 'nested' }] }],
        usage: { total_tokens: 1 },
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.text).toBe('nested');
      expect(out.usage).toEqual({ totalTokens: 1 });
    });

    it('uses resp.usage when output is array (output.usage not read)', async () => {
      const create = jest.fn().mockResolvedValue({
        output: [{ content: [{ text: 'n' }] }],
        usage: { total_tokens: 99 },
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.usage).toEqual({ totalTokens: 99 });
    });

    it('uses resp.output.usage when output is object and resp.usage absent for output_text path', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'obj',
        output: { usage: { total_tokens: 42 } },
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.usage).toEqual({ totalTokens: 42 });
    });

    it('uses undefined for usage when resp.usage absent and resp.output is array in nested text path', async () => {
      const create = jest.fn().mockResolvedValue({
        output: [{ content: [{ text: 'nested' }] }],
      });
      const client = { responses: { create } };
      const out = await tryWithResponsesAPI(client, createBaseRequest(), baseMessages);
      expect(out.text).toBe('nested');
      expect(out.usage).toBeUndefined();
    });

    it('throws when response shape is unexpected (no output_text and no nested text)', async () => {
      const create = jest.fn().mockResolvedValue({ output: [] });
      const client = { responses: { create } };
      await expect(tryWithResponsesAPI(client, createBaseRequest(), baseMessages)).rejects.toThrow(
        'Unexpected Responses API response shape'
      );
    });

    it('throws when resp is undefined (create returns undefined)', async () => {
      const create = jest.fn().mockResolvedValue(undefined);
      const client = { responses: { create } };
      await expect(tryWithResponsesAPI(client, createBaseRequest(), baseMessages)).rejects.toThrow(
        'Unexpected Responses API response shape'
      );
    });

    it('throws when client.responses.create is missing (create returns undefined)', async () => {
      const client = { responses: {} };
      await expect(tryWithResponsesAPI(client, createBaseRequest(), baseMessages)).rejects.toThrow(
        'Unexpected Responses API response shape'
      );
    });

    it('passes openAITools in payload when provided', async () => {
      const create = jest.fn().mockResolvedValue({ output_text: 'ok' });
      const client = { responses: { create } };
      const tools = convertToolsToOpenAIFormat([mockToolSchema]);
      await tryWithResponsesAPI(client, createBaseRequest(), baseMessages, tools);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ tools }));
    });
  });

  describe('extractToolCallsFromChatAPI', () => {
    it('returns undefined when message has no tool_calls', () => {
      expect(extractToolCallsFromChatAPI({ content: 'x' })).toBeUndefined();
    });

    it('returns empty array when tool_calls is empty array', () => {
      expect(extractToolCallsFromChatAPI({ content: null, tool_calls: [] })).toEqual([]);
    });

    it('extracts and maps tool_calls', () => {
      const msg: ChatCompletionMessage = {
        content: null,
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'f1', arguments: '{"x":1}' } },
          { id: 'b', type: 'function', function: { name: 'f2', arguments: '{}' } },
        ],
      };
      const out = extractToolCallsFromChatAPI(msg);
      expect(out).toHaveLength(2);
      expect(out![0]).toEqual({ id: 'a', name: 'f1', arguments: '{"x":1}' });
      expect(out![1]).toEqual({ id: 'b', name: 'f2', arguments: '{}' });
    });

    it('uses empty string for id when missing, and "{}" for arguments when falsy', () => {
      const msg: ChatCompletionMessage = {
        content: null,
        tool_calls: [{ id: '', type: 'function', function: { name: 'f', arguments: '' } }],
      };
      const out = extractToolCallsFromChatAPI(msg);
      expect(out).toHaveLength(1);
      expect(out![0]!.id).toBe('');
      expect(out![0]!.arguments).toBe('{}');
    });

    it('uses function.name and function.arguments with fallbacks', () => {
      const msg: ChatCompletionMessage = {
        content: null,
        tool_calls: [{ id: 'i', type: 'function', function: { name: 'n', arguments: '{}' } }],
      };
      const out = extractToolCallsFromChatAPI(msg);
      expect(out![0]).toEqual({ id: 'i', name: 'n', arguments: '{}' });
    });

    it('uses empty name when function.name is missing and "{}" when function.arguments is missing', () => {
      const msg = {
        content: null,
        tool_calls: [{ id: 'i', type: 'function' as const, function: { arguments: '{}' } }],
      };
      const out = extractToolCallsFromChatAPI(msg as ChatCompletionMessage);
      expect(out).toHaveLength(1);
      expect(out![0]!.name).toBe('');
      expect(out![0]!.arguments).toBe('{}');
    });

    it('uses "{}" for arguments when function.arguments is undefined', () => {
      const msg = {
        content: null,
        tool_calls: [{ id: 'i', type: 'function' as const, function: { name: 'f' } }],
      };
      const out = extractToolCallsFromChatAPI(msg as ChatCompletionMessage);
      expect(out).toHaveLength(1);
      expect(out![0]!.arguments).toBe('{}');
    });
  });

  describe('convertChatUsage', () => {
    it('returns undefined when usage is undefined', () => {
      expect(convertChatUsage(undefined)).toBeUndefined();
    });

    it('maps prompt_tokens and completion_tokens to input/output', () => {
      const u: ChatCompletionUsage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };
      expect(convertChatUsage(u)).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    });

    it('maps input_tokens and output_tokens when prompt/completion absent', () => {
      const u: ChatCompletionUsage = { input_tokens: 10, output_tokens: 20, total_tokens: 30 };
      expect(convertChatUsage(u)).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    });

    it('prefers prompt_tokens over input_tokens', () => {
      const u: ChatCompletionUsage = { prompt_tokens: 1, input_tokens: 9, completion_tokens: 2, output_tokens: 9, total_tokens: 3 };
      expect(convertChatUsage(u)).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    });

    it('includes only defined fields', () => {
      expect(convertChatUsage({ total_tokens: 5 })).toEqual({ totalTokens: 5 });
      expect(convertChatUsage({ prompt_tokens: 1 })).toEqual({ inputTokens: 1 });
    });
  });

  describe('tryWithChatCompletionAPI', () => {
    it('returns CompletionResponse with text, usage, and toolCalls', async () => {
      const create = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'reply',
              tool_calls: [{ id: 'x', type: 'function', function: { name: 'f', arguments: '{}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      });
      const client = { chat: { completions: { create } } };
      const req = createBaseRequest({ maxTokens: 50, stopSequences: ['\n'] });
      const tools = convertToolsToOpenAIFormat([mockToolSchema]);
      const out = await tryWithChatCompletionAPI(client, req, baseMessages, tools);
      expect(out).toEqual({
        text: 'reply',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        toolCalls: [{ id: 'x', name: 'f', arguments: '{}' }],
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: baseMessages,
          temperature: 0.5,
          max_tokens: 50,
          stop: ['\n'],
          tools,
        })
      );
    });

    it('omits max_tokens when maxTokens is undefined', async () => {
      const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'y' } }] });
      const client = { chat: { completions: { create } } };
      await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      const payload = create.mock.calls[0][0];
      expect(payload).not.toHaveProperty('max_tokens');
    });

    it('uses empty string when message.content is null', async () => {
      const create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: null } }],
      });
      const client = { chat: { completions: { create } } };
      const out = await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      expect(out.text).toBe('');
    });

    it('uses empty string when choices[0] or message is missing', async () => {
      const create = jest.fn().mockResolvedValue({ choices: [] });
      const client = { chat: { completions: { create } } };
      const out = await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      expect(out.text).toBe('');
    });

    it('omits usage when chat.usage is absent', async () => {
      const create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'z' } }],
      });
      const client = { chat: { completions: { create } } };
      const out = await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      expect(out.usage).toBeUndefined();
    });

    it('omits toolCalls when message has no tool_calls', async () => {
      const create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'only text' } }],
      });
      const client = { chat: { completions: { create } } };
      const out = await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      expect(out.toolCalls).toBeUndefined();
    });

    it('omits tools from payload when openAITools not provided', async () => {
      const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'h' } }] });
      const client = { chat: { completions: { create } } };
      await tryWithChatCompletionAPI(client, createBaseRequest(), baseMessages);
      const payload = create.mock.calls[0][0];
      expect(payload).not.toHaveProperty('tools');
    });
  });

  describe('completeWithFallback', () => {
    it('returns Responses API result when it succeeds', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'from responses',
        usage: { total_tokens: 1 },
      });
      const chatCreate = jest.fn();
      const client = {
        responses: { create },
        chat: { completions: { create: chatCreate } },
      };
      const out = await completeWithFallback(client as unknown as OpenAI & ResponsesAPIClient, createBaseRequest());
      expect(out.text).toBe('from responses');
      expect(chatCreate).not.toHaveBeenCalled();
    });

    it('falls back to Chat Completions API when Responses API throws', async () => {
      const create = jest.fn().mockRejectedValue(new Error('Responses unavailable'));
      const chatCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'from chat' } }],
      });
      const client = {
        responses: { create },
        chat: { completions: { create: chatCreate } },
      };
      const out = await completeWithFallback(client as unknown as OpenAI & ResponsesAPIClient, createBaseRequest());
      expect(out.text).toBe('from chat');
      expect(chatCreate).toHaveBeenCalled();
    });

    it('uses getOpenAITools and getMessages', async () => {
      const create = jest.fn().mockResolvedValue({
        output_text: 'ok',
        usage: { total_tokens: 1 },
      });
      const client = { responses: { create }, chat: { completions: { create: jest.fn() } } };
      const req = createBaseRequest({
        tools: [mockToolSchema],
        messages: [{ role: CHAT_ROLES.USER, content: 'custom' }],
      });
      await completeWithFallback(client as unknown as OpenAI & ResponsesAPIClient, req);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ role: CHAT_ROLES.USER, content: 'custom' }],
          tools: expect.any(Array),
        })
      );
    });
  });

  describe('extractOpenAIChatCompletionTypes', () => {
    it('returns null at runtime (type-helper only)', () => {
      const client = { chat: { completions: { create: jest.fn() } } };
      const out = extractOpenAIChatCompletionTypes(client);
      expect(out).toBeNull();
    });
  });
});
