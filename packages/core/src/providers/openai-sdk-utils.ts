import OpenAI from 'openai';

import { ToolSchema, ToolCall, OpenAITool } from '../types/tool.types';

import { ChatMessage, CHAT_ROLES, CompletionRequest, CompletionResponse, CompletionUsage } from './llm-provider';

/**
 * Usage information from Responses API (supports both snake_case and camelCase).
 */
export interface ResponsesAPIUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Usage information from Chat Completions API (supports both prompt_tokens/completion_tokens and input_tokens/output_tokens).
 */
export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Tool call structure in Responses API response.
 */
interface ResponsesAPIToolCall {
  id?: string;
  name?: string;
  function?: {
    name?: string;
    arguments?: string | unknown;
  };
}

/**
 * Content item in Responses API output array.
 */
interface ResponsesAPIContent {
  text?: string;
  tool_calls?: ResponsesAPIToolCall[];
}

/**
 * Output item in Responses API response (array format).
 */
interface ResponsesAPIOutput {
  content?: ResponsesAPIContent[];
}

/**
 * Output object in Responses API response (object format with usage).
 */
interface ResponsesAPIOutputObject {
  usage?: ResponsesAPIUsage;
}

/**
 * Request payload for OpenAI Responses API.
 * This API is accessed via the SDK but may not have official TypeScript types.
 */
export interface ResponsesAPIPayload {
  /** Model identifier. */
  model: string;
  /** Temperature setting. */
  temperature: number;
  /** Input messages array. */
  input: ChatMessage[];
  /** Maximum output tokens (optional). */
  max_output_tokens?: number;
  /** Stop sequences (optional). */
  stop?: string[];
  /** Tools in OpenAI format (optional). */
  tools?: OpenAITool[];
}

/**
 * Response from OpenAI Responses API.
 * This API is accessed via the SDK but may not have official TypeScript types.
 * The `output` field can be either an array of output items or an object with usage.
 */
export interface ResponsesAPIResponse {
  /** Direct text output from the API. */
  output_text?: string;
  /** Usage information at top level. */
  usage?: ResponsesAPIUsage;
  /** Tool calls at top level. */
  tool_calls?: ResponsesAPIToolCall[];
  /** Nested output structure (can be array or object with usage). */
  output?: ResponsesAPIOutput[] | ResponsesAPIOutputObject;
}

/**
 * Tool call structure in Chat Completions API message.
 */
interface ChatCompletionToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Message from Chat Completions API response.
 * This represents the message structure returned by OpenAI's Chat Completions API.
 */
export interface ChatCompletionMessage {
  /** The message content. */
  content: string | null;
  /** Optional array of tool calls made in this message. */
  tool_calls?: ChatCompletionToolCall[];
  /** Optional role of the message. */
  role?: string;
}

/**
 * Type for the Responses API client methods.
 * The Responses API exists on the OpenAI client but may not be fully typed in the SDK.
 */
export interface ResponsesAPIClient {
  responses?: {
    create?: (payload: ResponsesAPIPayload) => Promise<ResponsesAPIResponse>;
  };
}

/**
 * Type for the Chat Completions API client methods.
 * Represents a client that supports the OpenAI Chat Completions API structure.
 * Used by both OpenAI and OpenRouter providers.
 * 
 * Note: The `create` method uses `any` because:
 * 1. The OpenAI SDK's `create` method has multiple overloads with different signatures
 * 2. TypeScript's `Parameters` utility type (used in `extractOpenAIChatCompletionTypes`) 
 *    requires a function signature to extract parameter types from the concrete client type
 * 3. The actual types are extracted at compile time from the concrete client instance,
 *    so `any` here is safe and necessary for type extraction to work properly
 */
export interface ChatCompletionAPIClient {
  chat: {
    completions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (...args: any[]) => any;
    };
  };
}

/**
 * Converts ToolSchema array to OpenAI function calling format.
 * 
 * @param tools - Array of tool schemas.
 * @returns Array of tools in OpenAI SDK format.
 */
export function convertToolsToOpenAIFormat(tools: ToolSchema[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Converts tools from request to OpenAI format if tools are provided.
 * 
 * @param request - The completion request that may contain tools.
 * @returns Array of tools in OpenAI format, or undefined if no tools provided.
 */
export function getOpenAITools(request: CompletionRequest): OpenAITool[] | undefined {
  return request.tools && request.tools.length > 0 
    ? convertToolsToOpenAIFormat(request.tools)
    : undefined;
}

/**
 * Gets messages array from request, using provided messages or constructing from systemPrompt/userPrompt.
 * 
 * @param request - The completion request that may contain messages or systemPrompt/userPrompt.
 * @returns Array of chat messages.
 */
export function getMessages(request: CompletionRequest): ChatMessage[] {
  return request.messages || [
    { role: CHAT_ROLES.SYSTEM, content: request.systemPrompt },
    { role: CHAT_ROLES.USER, content: request.userPrompt },
  ];
}

/**
 * Builds the Responses API payload from request parameters.
 * 
 * @param request - The completion request.
 * @param messages - The chat messages array.
 * @param openAITools - Optional array of tools in OpenAI format.
 * @returns The Responses API payload object.
 */
export function buildResponsesPayload(request: CompletionRequest, messages: ChatMessage[], openAITools?: OpenAITool[]): ResponsesAPIPayload {
  const payload: ResponsesAPIPayload = {
    model: request.model,
    temperature: request.temperature,
    input: messages,
  };
  if (request.maxTokens != null) payload.max_output_tokens = request.maxTokens;
  if (request.stopSequences) payload.stop = request.stopSequences;
  if (openAITools) payload.tools = openAITools;
  return payload;
}

/**
 * Converts usage from Responses API format to CompletionUsage.
 * 
 * @param usage - Usage object from Responses API response.
 * @returns CompletionUsage object, or undefined if usage is not provided.
 */
export function convertResponsesUsage(usage?: ResponsesAPIUsage): CompletionUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const result: CompletionUsage = {};
  const inputTokens = usage.input_tokens ?? usage.inputTokens;
  const outputTokens = usage.output_tokens ?? usage.outputTokens;
  const totalTokens = usage.total_tokens ?? usage.totalTokens;
  
  if (inputTokens != null) result.inputTokens = inputTokens;
  if (outputTokens != null) result.outputTokens = outputTokens;
  if (totalTokens != null) result.totalTokens = totalTokens;
  
  return result;
}

/**
 * Builds a CompletionResponse from text, usage, and tool calls.
 * 
 * @param text - The response text.
 * @param usage - Optional usage object from Responses API.
 * @param toolCalls - Optional array of tool calls.
 * @returns A CompletionResponse object.
 */
export function buildCompletionResponse(text: string, usage?: ResponsesAPIUsage, toolCalls?: ToolCall[]): CompletionResponse {
  const out: CompletionResponse = { text };
  const convertedUsage = convertResponsesUsage(usage);
  if (convertedUsage) {
    out.usage = convertedUsage;
  }
  if (toolCalls) {
    out.toolCalls = toolCalls;
  }
  return out;
}

/**
 * Extracts tool calls from Responses API response.
 * 
 * @param resp - Response from Responses API.
 * @returns Array of ToolCall objects, or undefined if no tool calls.
 */
export function extractToolCallsFromResponsesAPI(resp: ResponsesAPIResponse): ToolCall[] | undefined {
  // Check for tool_calls at top level
  if (resp.tool_calls && Array.isArray(resp.tool_calls)) {
    return resp.tool_calls.map((tc) => ({
      id: tc.id || tc.function?.name || '',
      name: tc.function?.name || tc.name || '',
      arguments: typeof tc.function?.arguments === 'string' 
        ? tc.function.arguments 
        : JSON.stringify(tc.function?.arguments || {}),
    }));
  }

  // Check nested structure: output[0]?.content[0]?.tool_calls
  if (Array.isArray(resp?.output)) {
    const nestedToolCalls = resp.output[0]?.content?.[0]?.tool_calls;
    if (nestedToolCalls && Array.isArray(nestedToolCalls)) {
      return nestedToolCalls.map((tc) => ({
        id: tc.id || tc.function?.name || '',
        name: tc.function?.name || tc.name || '',
        arguments: typeof tc.function?.arguments === 'string' 
          ? tc.function.arguments 
          : JSON.stringify(tc.function?.arguments || {}),
      }));
    }
  }

  return undefined;
}

/**
 * Attempts to complete the request using the Responses API.
 * 
 * @param client - Client instance that supports Responses API (can be OpenAI or OpenRouter client).
 * @param request - The completion request.
 * @param messages - The chat messages array.
 * @param openAITools - Optional array of tools in OpenAI format.
 * @returns A CompletionResponse if successful.
 * @throws Error if the Responses API returned an unexpected shape.
 */
export async function tryWithResponsesAPI(
  client: ResponsesAPIClient,
  request: CompletionRequest,
  messages: ChatMessage[],
  openAITools?: OpenAITool[]
): Promise<CompletionResponse> {
  // Build Responses API payload conditionally
  const respPayload = buildResponsesPayload(request, messages, openAITools);

  const resp = await client.responses?.create?.(respPayload);

  if (resp && resp.output_text) {
    const usage = resp?.usage ?? (Array.isArray(resp?.output) ? undefined : resp?.output?.usage);
    const toolCalls = extractToolCallsFromResponsesAPI(resp);
    return buildCompletionResponse(resp.output_text, usage, toolCalls);
  }
  // Some SDK shapes use output[0]?.content[0]?.text
  const outText: string | undefined = Array.isArray(resp?.output) ? resp.output[0]?.content?.[0]?.text : undefined;
  if (outText && resp) {
    const usage = resp.usage ?? (Array.isArray(resp.output) ? undefined : resp.output?.usage);
    const toolCalls = extractToolCallsFromResponsesAPI(resp);
    return buildCompletionResponse(outText, usage, toolCalls);
  }

  // Fallback if Responses API returned unexpected shape
  throw new Error('Unexpected Responses API response shape');
}

/**
 * Extracts tool calls from Chat Completions API response.
 * 
 * @param message - Message from Chat Completions API.
 * @returns Array of ToolCall objects, or undefined if no tool calls.
 */
export function extractToolCallsFromChatAPI(message: ChatCompletionMessage): ToolCall[] | undefined {
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    return message.tool_calls.map((tc) => ({
      id: tc.id || '',
      name: tc.function?.name || '',
      arguments: tc.function?.arguments || '{}',
    }));
  }
  return undefined;
}

/**
 * Converts usage from Chat Completions API format to CompletionUsage.
 * 
 * @param usage - Usage object from Chat Completions API response.
 * @returns CompletionUsage object, or undefined if usage is not provided.
 */
export function convertChatUsage(usage?: ChatCompletionUsage): CompletionUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const result: CompletionUsage = {};
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens;
  const totalTokens = usage.total_tokens;
  
  if (inputTokens != null) result.inputTokens = inputTokens;
  if (outputTokens != null) result.outputTokens = outputTokens;
  if (totalTokens != null) result.totalTokens = totalTokens;
  
  return result;
}

/**
 * Attempts to complete the request using the Chat Completions API.
 * 
 * @param client - Client instance that supports Chat Completions API (can be OpenAI or OpenRouter client).
 * @param request - The completion request.
 * @param messages - The chat messages array.
 * @param openAITools - Optional array of tools in OpenAI format.
 * @returns A CompletionResponse.
 */
export async function tryWithChatCompletionAPI<T extends ChatCompletionAPIClient>(
  client: T,
  request: CompletionRequest,
  messages: ChatMessage[],
  openAITools?: OpenAITool[]
): Promise<CompletionResponse> {
  const _typeExtractor = extractOpenAIChatCompletionTypes(client);
  type ChatCompletionCreateParams = typeof _typeExtractor.createParams;
  type ChatCompletionMessageParam = typeof _typeExtractor.messageParam;
  const chatPayload: ChatCompletionCreateParams = {
    model: request.model,
    messages: messages as ChatCompletionMessageParam[],
    temperature: request.temperature,
  };
  if (request.maxTokens != null) chatPayload.max_tokens = request.maxTokens;
  if (request.stopSequences) chatPayload.stop = request.stopSequences;
  if (openAITools) chatPayload.tools = openAITools;

  const chatResponse = await client.chat.completions.create(chatPayload);
  // Assert non-streaming response since we're not using stream: true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chat = chatResponse as any;
  const message = chat.choices[0]?.message;
  const txt = message?.content ?? '';
  const toolCalls = message ? extractToolCallsFromChatAPI(message) : undefined;
  const usage = chat.usage;
  const out: CompletionResponse = { text: txt };
  const convertedUsage = convertChatUsage(usage);
  if (convertedUsage) {
    out.usage = convertedUsage;
  }
  if (toolCalls) {
    out.toolCalls = toolCalls;
  }
  return out;
}

/**
 * Generates a completion response for the given {@link CompletionRequest}. 
 * Tries to use the Responses API if available, falling back to the Chat Completions API if necessary.
 *
 * This function performs the following steps:
 *  1. Converts the tools (if any) in the request to OpenAI-compatible format.
 *  2. Builds the chat message array for the API, including system and user prompts as required.
 *  3. Attempts to call the Responses API. If successful, extracts the completion text, usage, and tool calls.
 *  4. If the Responses API fails or is unavailable, falls back to the Chat Completions API, handling tool calling and usage metrics.
 *
 * @param client - Client instance that supports both Responses API and Chat Completions API (can be OpenAI or OpenRouter client).
 * @param request - The completion request containing model, prompts, options, and (optionally) tool definitions.
 * @returns A promise that resolves to a {@link CompletionResponse} containing the completion text, usage statistics, and tool calls if present.
 * @throws Error if both the Responses API and the Chat Completions API fail to return a valid completion.
 */
export async function completeWithFallback(
  client: OpenAI & ResponsesAPIClient,
  request: CompletionRequest
): Promise<CompletionResponse> {
  const openAITools = getOpenAITools(request); // Convert tools to OpenAI format if provided
  const messages = getMessages(request); // Use messages array if provided (for tool calling), otherwise use systemPrompt/userPrompt

  try {
    return await tryWithResponsesAPI(client, request, messages, openAITools);
  } catch (_err) {
    // Fallback to Chat Completions API
    return await tryWithChatCompletionAPI(client, request, messages, openAITools);
  }
}

/**
 * Helper function to extract OpenAI Chat Completions API types from a client instance.
 * This allows both OpenAIProvider and OpenRouterProvider to use the same type extraction pattern.
 * 
 * Usage in provider classes:
 * ```typescript
 * const _typeExtractor = extractOpenAIChatCompletionTypes(this.client);
 * type ChatCompletionCreateParams = typeof _typeExtractor.createParams;
 * type ChatCompletionMessageParam = typeof _typeExtractor.messageParam;
 * ```
 * 
 * Note: The constraint uses `any` because the OpenAI SDK's `create` method has multiple overloads,
 * and TypeScript's `Parameters` utility type requires a specific function signature to extract
 * parameter types. Using `any` here is safe because this function is only used for type extraction,
 * not runtime execution.
 * 
 * @param client - OpenAI client instance (used to extract types from the SDK method signature).
 * @returns Object with type information for type extraction (not for runtime use).
 */
export function extractOpenAIChatCompletionTypes<T extends ChatCompletionAPIClient>(
  _client: T // eslint-disable-line @typescript-eslint/no-unused-vars
): {
  createParams: Parameters<T['chat']['completions']['create']>[0];
  messageParam: Parameters<T['chat']['completions']['create']>[0]['messages'][number];
} {
  // This function exists only for type extraction via typeof, not for runtime use
  return null as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
