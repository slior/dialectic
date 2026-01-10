import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/llm-provider';
import { TracingContext, SPAN_LEVEL } from '../types/tracing.types';

import { logWarning } from './console';
import { getSpanParent } from './tracing-utils';

/**
 * Tracing wrapper for LLM providers that creates Langfuse generation spans
 * for each LLM completion call.
 * 
 * This wrapper maintains an iteration counter for tool calling loops,
 * creating separate generation spans for each iteration.
 */
export class TracingLLMProvider implements LLMProvider {
  private iterationCount: number = 0;
  private agentId?: string;

  constructor(
    private readonly wrappedProvider: LLMProvider,
    private readonly tracingContext: TracingContext
  ) {}

  /**
   * Sets the agent ID for this provider instance.
   * This is used to correctly resolve the parent span when multiple agents execute concurrently.
   * 
   * @param agentId - The ID of the agent using this provider.
   */
  setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  /**
   * Creates a generation span for the LLM call and wraps the provider's complete method.
   * 
   * @param request - The completion request to send to the LLM.
   * @returns The completion response from the LLM.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const generationName = `llm-generation-${this.iterationCount}`;
    this.iterationCount++;

    try {
      // Create generation within the current span if available, otherwise on the trace
      // If agentId is undefined (e.g., for judge), getSpanParent will return the trace
      const generation = getSpanParent(this.tracingContext, this.agentId).generation({
        name: generationName,
        input: {
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          messages: request.messages,
          model: request.model,
          temperature: request.temperature,
        },
        metadata: {
          model: request.model,
          temperature: request.temperature,
          provider: 'openai', // TODO: determine from request or provider type
          iteration: this.iterationCount - 1,
        },
      });

      try {
        const response = await this.wrappedProvider.complete(request);

        // Convert usage to langfuse format
        const langfuseUsage = response.usage ? {
          input: response.usage.inputTokens ?? null,
          output: response.usage.outputTokens ?? null,
          total: response.usage.totalTokens ?? null,
          unit: 'TOKENS' as const,
        } : undefined;

        // End generation with output and usage
        generation.end({
          output: {
            text: response.text,
            toolCalls: response.toolCalls,
          },
          ...(langfuseUsage && { usage: langfuseUsage }),
        });

        return response;
      } catch (error: any) {
        // End generation with error
        generation.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: error.message,
        });
        throw error;
      }
    } catch (tracingError: any) {
      // If tracing fails, log warning and continue with original provider call
      logWarning(`Langfuse tracing failed for LLM call: ${tracingError.message}`);
      return await this.wrappedProvider.complete(request);
    }
  }

  /**
   * Resets the iteration counter. Should be called when starting a new tool calling sequence.
   */
  resetIterationCount(): void {
    this.iterationCount = 0;
  }
}
