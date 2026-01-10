import OpenAI from 'openai';

import { CompletionRequest, CompletionResponse, LLMProvider, ResponsesAPIClient, completeWithFallback } from './llm-provider';

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
    return await completeWithFallback(this.client as OpenAI & ResponsesAPIClient, request);
  }
}
