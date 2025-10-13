import type { AgentRole } from '../types/agent.types';
import type { SummarizationConfig, SummarizationMetadata } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

/**
 * Default model to use for summarization.
 * Using GPT-4 for its strong summarization capabilities.
 */
const DEFAULT_SUMMARY_MODEL = 'gpt-4';

/**
 * Default temperature for summarization LLM calls.
 * Lower temperature (0.3) produces more consistent, factual summaries.
 */
const DEFAULT_SUMMARY_TEMPERATURE = 0.3;

/**
 * Result of a summarization operation.
 */
export interface SummarizationResult {
  summary: string; /** The generated summary text. */
  metadata: SummarizationMetadata; /** Metadata about the summarization operation. */
}

/**
 * Interface for context summarization strategies.
 * Allows pluggable summarization implementations (e.g., length-based, semantic, hierarchical).
 */
export interface ContextSummarizer {
  /**
   * Summarizes the given content from the perspective of a specific agent role.
   * 
   * @param content - The full content to summarize.
   * @param role - The agent role for perspective-based summarization.
   * @param config - Summarization configuration (threshold, maxLength, etc.).
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param summaryPrompt - The summarization-specific prompt template.
   * @returns A promise resolving to the summary and metadata.
   */
  summarize(
    content: string,
    role: AgentRole,
    config: SummarizationConfig,
    systemPrompt: string,
    summaryPrompt: string
  ): Promise<SummarizationResult>;
}

/**
 * Length-based summarization strategy using LLM.
 * Summarizes content when it exceeds a character threshold.
 */
export class LengthBasedSummarizer implements ContextSummarizer {
  constructor(private provider: LLMProvider) {}

  /**
   * Summarizes content using an LLM call with role-specific prompts.
   * 
   * @param content - The full content to summarize.
   * @param role - The agent role for perspective-based summarization.
   * @param config - Summarization configuration.
   * @param systemPrompt - The system prompt for the LLM.
   * @param summaryPrompt - The summarization prompt template.
   * @returns The summary and metadata.
   */
  async summarize(
    content: string,
    _role: AgentRole,
    config: SummarizationConfig,
    systemPrompt: string,
    summaryPrompt: string
  ): Promise<SummarizationResult> {
    const beforeChars = content.length;
    const startTime = Date.now();

    // Call LLM to generate summary
    const response = await this.provider.complete({
      model: DEFAULT_SUMMARY_MODEL,
      temperature: DEFAULT_SUMMARY_TEMPERATURE,
      systemPrompt,
      userPrompt: summaryPrompt,
    });

    const latencyMs = Date.now() - startTime;

    // Truncate summary to maxLength if needed
    let summaryText = response.text.trim();
    if (summaryText.length > config.maxLength) {
      summaryText = summaryText.substring(0, config.maxLength);
    }

    const afterChars = summaryText.length;

    const metadata: SummarizationMetadata = {
      beforeChars,
      afterChars,
      method: config.method,
      timestamp: new Date(),
      latencyMs,
    };

    if (response.usage?.totalTokens != null) {
      metadata.tokensUsed = response.usage.totalTokens;
    }

    return {
      summary: summaryText,
      metadata,
    };
  }
}

