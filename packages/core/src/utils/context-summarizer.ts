import { LLMProvider } from '../providers/llm-provider';
import type { AgentRole, LLM_PROVIDERS } from '../types/agent.types';
import type { SummarizationConfig, SummarizationMetadata } from '../types/debate.types';

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
  private readonly model?: string;
  private readonly temperature?: number;
  private readonly providerName?: typeof LLM_PROVIDERS[keyof typeof LLM_PROVIDERS];

  constructor(
    private provider: LLMProvider,
    options?: { 
      model?: string; 
      temperature?: number; 
      provider?: typeof LLM_PROVIDERS[keyof typeof LLM_PROVIDERS]; 
    }
  ) {
    if (options && options.model !== undefined) {
      this.model = options.model;
    }
    if (options && options.temperature !== undefined) {
      this.temperature = options.temperature;
    }
    if (options && options.provider !== undefined) {
      this.providerName = options.provider;
    }
  }

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

    // Call LLM to generate summary using configured values with fallbacks
    const selectedModel = this.model ?? DEFAULT_SUMMARY_MODEL;
    const selectedTemperature = this.temperature ?? DEFAULT_SUMMARY_TEMPERATURE;

    const response = await this.provider.complete({
      model: selectedModel,
      temperature: selectedTemperature,
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

    // Record model, temperature, and provider used for summarization
    metadata.model = selectedModel;
    metadata.temperature = selectedTemperature;
    if (this.providerName) {
      metadata.provider = this.providerName;
    }

    return {
      summary: summaryText,
      metadata,
    };
  }
}

