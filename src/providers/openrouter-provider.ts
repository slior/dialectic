import OpenAI from 'openai';
import { CompletionRequest, CompletionResponse, LLMProvider, CHAT_ROLES } from './llm-provider';
import { ToolSchema, ToolCall } from '../types/tool.types';

/**
 * OpenRouter API configuration constants
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_HTTP_REFERER = 'dialectic';
const OPENROUTER_X_TITLE = 'Dialectic - Multi-Agent Debate';

/**
 * OpenRouter provider implementation using OpenAI SDK with OpenRouter-specific configuration.
 * 
 * This provider leverages the OpenAI SDK for compatibility while using OpenRouter's API
 * endpoint and authentication. It supports the same fallback strategy as the OpenAI provider
 * (Responses API → Chat Completions API) and handles OpenRouter-specific response formats.
 * 
 * OpenRouter models are specified using their full qualified names (e.g., "openai/gpt-4",
 * "anthropic/claude-3-sonnet") as provided by the user in their configuration.
 */
export class OpenRouterProvider implements LLMProvider {
  private client: OpenAI;

  /**
   * Creates a new OpenRouter provider instance.
   * @param apiKey - OpenRouter API key for authentication
   */
  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': OPENROUTER_HTTP_REFERER,
        'X-Title': OPENROUTER_X_TITLE,
      },
    });
  }

  /**
   * Converts ToolSchema array to OpenAI function calling format.
   * 
   * @param tools - Array of tool schemas.
   * @returns Array of tools in OpenAI SDK format.
   */
  private convertToolsToOpenAIFormat(tools: ToolSchema[]): any[] {
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
   * Extracts tool calls from Responses API response.
   * 
   * @param resp - Response from Responses API.
   * @returns Array of ToolCall objects, or undefined if no tool calls.
   */
  private extractToolCallsFromResponsesAPI(resp: any): ToolCall[] | undefined {
    // Check for tool_calls at top level
    if (resp.tool_calls && Array.isArray(resp.tool_calls)) {
      return resp.tool_calls.map((tc: any) => ({
        id: tc.id || tc.function?.name || '',
        name: tc.function?.name || tc.name || '',
        arguments: typeof tc.function?.arguments === 'string' 
          ? tc.function.arguments 
          : JSON.stringify(tc.function?.arguments || {}),
      }));
    }

    // Check nested structure: output[0]?.content[0]?.tool_calls
    const nestedToolCalls = resp?.output?.[0]?.content?.[0]?.tool_calls;
    if (nestedToolCalls && Array.isArray(nestedToolCalls)) {
      return nestedToolCalls.map((tc: any) => ({
        id: tc.id || tc.function?.name || '',
        name: tc.function?.name || tc.name || '',
        arguments: typeof tc.function?.arguments === 'string' 
          ? tc.function.arguments 
          : JSON.stringify(tc.function?.arguments || {}),
      }));
    }

    return undefined;
  }

  /**
   * Extracts tool calls from Chat Completions API response.
   * 
   * @param message - Message from Chat Completions API.
   * @returns Array of ToolCall objects, or undefined if no tool calls.
   */
  private extractToolCallsFromChatAPI(message: any): ToolCall[] | undefined {
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      return message.tool_calls.map((tc: any) => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '{}',
      }));
    }
    return undefined;
  }

  /**
   * Makes a completion request to OpenRouter API.
   * 
   * Uses the same fallback strategy as OpenAI provider:
   * 1. Attempts to use Responses API (newer interface)
   * 2. Falls back to Chat Completions API if Responses API fails
   * 
   * @param request - The completion request containing model, prompts, and parameters
   * @returns Promise resolving to completion response with text and usage metadata
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Convert tools to OpenAI format if provided
    const openAITools = request.tools && request.tools.length > 0 
      ? this.convertToolsToOpenAIFormat(request.tools)
      : undefined;

    // Use messages array if provided (for tool calling), otherwise use systemPrompt/userPrompt
    const messages = request.messages || [
      { role: CHAT_ROLES.SYSTEM, content: request.systemPrompt },
      { role: CHAT_ROLES.USER, content: request.userPrompt },
    ];

    // Try Responses API first
    try {
      // Build Responses API payload conditionally
      const respPayload: any = {
        model: request.model,
        temperature: request.temperature,
        input: messages,
      };
      if (request.maxTokens != null) respPayload.max_output_tokens = request.maxTokens;
      if (request.stopSequences) respPayload.stop = request.stopSequences;
      if (openAITools) respPayload.tools = openAITools;

      const resp = await (this.client as any).responses?.create?.(respPayload);

      if (resp && resp.output_text) {
        const usage = resp?.usage ?? resp?.output?.usage;
        const toolCalls = this.extractToolCallsFromResponsesAPI(resp);
        const out: CompletionResponse = { text: resp.output_text as string };
        if (usage) {
          out.usage = {
            inputTokens: usage.input_tokens ?? usage.inputTokens,
            outputTokens: usage.output_tokens ?? usage.outputTokens,
            totalTokens: usage.total_tokens ?? usage.totalTokens,
          };
        }
        if (toolCalls) {
          out.toolCalls = toolCalls;
        }
        return out;
      }
      // Some SDK shapes use output[0]?.content[0]?.text
      const outText: string | undefined = resp?.output?.[0]?.content?.[0]?.text;
      if (outText) {
        const usage = resp?.usage ?? resp?.output?.usage;
        const toolCalls = this.extractToolCallsFromResponsesAPI(resp);
        const out: CompletionResponse = { text: outText };
        if (usage) {
          out.usage = {
            inputTokens: usage.input_tokens ?? usage.inputTokens,
            outputTokens: usage.output_tokens ?? usage.outputTokens,
            totalTokens: usage.total_tokens ?? usage.totalTokens,
          };
        }
        if (toolCalls) {
          out.toolCalls = toolCalls;
        }
        return out;
      }

      // Fallback if Responses API returned unexpected shape
      throw new Error('Unexpected Responses API response shape');
    } catch (_err) {
      // Fallback to Chat Completions API
      const chatPayload: any = {
        model: request.model,
        messages: messages,
        temperature: request.temperature,
      };
      if (request.maxTokens != null) chatPayload.max_tokens = request.maxTokens;
      if (request.stopSequences) chatPayload.stop = request.stopSequences;
      if (openAITools) chatPayload.tools = openAITools;

      const chat = await this.client.chat.completions.create(chatPayload);
      const message = chat.choices[0]?.message;
      const txt = message?.content ?? '';
      const toolCalls = message ? this.extractToolCallsFromChatAPI(message) : undefined;
      const usage = (chat as any).usage;
      const out: CompletionResponse = { text: txt };
      if (usage) {
        out.usage = {
          inputTokens: usage.prompt_tokens ?? usage.input_tokens,
          outputTokens: usage.completion_tokens ?? usage.output_tokens,
          totalTokens: usage.total_tokens,
        };
      }
      if (toolCalls) {
        out.toolCalls = toolCalls;
      }
      return out;
    }
  }
}
