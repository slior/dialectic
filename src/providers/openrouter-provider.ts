import OpenAI from 'openai';
import { CompletionRequest, CompletionResponse, LLMProvider } from './llm-provider';

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
    // Try Responses API first
    try {
      // Build Responses API payload conditionally
      const respPayload: any = {
        model: request.model,
        temperature: request.temperature,
        input: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
      };
      if (request.maxTokens != null) respPayload.max_output_tokens = request.maxTokens;
      if (request.stopSequences) respPayload.stop = request.stopSequences;

      const resp = await (this.client as any).responses?.create?.(respPayload);

      if (resp && resp.output_text) {
        const usage = resp?.usage ?? resp?.output?.usage;
        const out: CompletionResponse = { text: resp.output_text as string };
        if (usage) {
          out.usage = {
            inputTokens: usage.input_tokens ?? usage.inputTokens,
            outputTokens: usage.output_tokens ?? usage.outputTokens,
            totalTokens: usage.total_tokens ?? usage.totalTokens,
          };
        }
        return out;
      }
      // Some SDK shapes use output[0]?.content[0]?.text
      const outText: string | undefined = resp?.output?.[0]?.content?.[0]?.text;
      if (outText) {
        const usage = resp?.usage ?? resp?.output?.usage;
        const out: CompletionResponse = { text: outText };
        if (usage) {
          out.usage = {
            inputTokens: usage.input_tokens ?? usage.inputTokens,
            outputTokens: usage.output_tokens ?? usage.outputTokens,
            totalTokens: usage.total_tokens ?? usage.totalTokens,
          };
        }
        return out;
      }

      // Fallback if Responses API returned unexpected shape
      throw new Error('Unexpected Responses API response shape');
    } catch (_err) {
      // Fallback to Chat Completions API
      const chatPayload: any = {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature,
      };
      if (request.maxTokens != null) chatPayload.max_tokens = request.maxTokens;
      if (request.stopSequences) chatPayload.stop = request.stopSequences;

      const chat = await this.client.chat.completions.create(chatPayload);
      const txt = chat.choices[0]?.message?.content ?? '';
      const usage = (chat as any).usage;
      const out: CompletionResponse = { text: txt };
      if (usage) {
        out.usage = {
          inputTokens: usage.prompt_tokens ?? usage.input_tokens,
          outputTokens: usage.completion_tokens ?? usage.output_tokens,
          totalTokens: usage.total_tokens,
        };
      }
      return out;
    }
  }
}
