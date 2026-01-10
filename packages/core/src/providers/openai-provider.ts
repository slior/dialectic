import OpenAI from 'openai';


import { CompletionRequest, CompletionResponse, LLMProvider, ResponsesAPIClient, completeWithFallback } from './llm-provider';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generates a completion response for the given {@link CompletionRequest}. 
   * Tries to use the OpenAI Responses API if available, falling back to the Chat Completions API if necessary.
   *
   * This method performs the following steps:
   *  1. Converts the tools (if any) in the request to OpenAI-compatible format.
   *  2. Builds the chat message array for the API, including system and user prompts as required.
   *  3. Attempts to call the Responses API. If successful, extracts the completion text, usage, and tool calls.
   *  4. If the Responses API fails or is unavailable, falls back to the Chat Completions API, handling tool calling and usage metrics.
   *
   * @param request - The completion request containing model, prompts, options, and (optionally) tool definitions.
   * @returns A promise that resolves to a {@link CompletionResponse} containing the completion text, usage statistics, and tool calls if present.
   * @throws Error if both the Responses API and the Chat Completions API fail to return a valid completion.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return await completeWithFallback(this.client as OpenAI & ResponsesAPIClient, request);
  }
}
