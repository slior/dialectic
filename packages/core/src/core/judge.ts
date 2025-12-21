import { AgentConfig, PromptSource } from '../types/agent.types';
import { DebateContext, DebateRound, Solution, DebateSummary, ContextPreparationResult, SummarizationConfig, CONTRIBUTION_TYPES } from '../types/debate.types';
import { TracingContext, LangfuseSpan, LangfuseGeneration, SPAN_LEVEL } from '../types/tracing.types';
import { LLMProvider } from '../providers/llm-provider';
import { ContextSummarizer, LengthBasedSummarizer } from '../utils/context-summarizer';
import { DEFAULT_JUDGE_SUMMARY_PROMPT } from '../agents/prompts/judge-prompts';
import { logWarning } from '../utils/console';
import { getErrorMessage } from '../utils/common';

/**
 * Default system instructions for the judge when synthesizing a final solution.
 */
const DEFAULT_JUDGE_SYSTEM_PROMPT = `You are an expert technical judge responsible for synthesizing the best solution from multiple agent proposals and debates.
Be objective and evidence-based; combine complementary ideas; address concerns; provide recommendations and a confidence score.`;

/**
 * Default temperature used by the judge when no temperature is provided on the config.
 */
const DEFAULT_JUDGE_TEMPERATURE = 0.3;

/**
 * Default confidence score to return when a more sophisticated scoring mechanism is not implemented.
 */
const DEFAULT_CONFIDENCE_SCORE = 75;

/**
 * JudgeAgent is responsible for synthesizing the best solution from the debate history.
 *
 * It consumes all proposals and critiques across rounds and produces a single Solution
 * that combines the strongest ideas while acknowledging trade-offs and recommendations.
 */
export class JudgeAgent {
  private readonly resolvedSystemPrompt: string;
  public readonly promptSource?: PromptSource;
  
  // Summarization-related fields
  private readonly summarizer?: ContextSummarizer;
  private readonly summaryConfig: SummarizationConfig;
  public readonly summaryPromptSource?: PromptSource;
  
  constructor(
    private config: AgentConfig, 
    private provider: LLMProvider, 
    resolvedSystemPrompt: string, 
    promptSource: PromptSource | undefined,
    summaryConfig: SummarizationConfig,
    summaryPromptSource?: PromptSource
  ) {
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    this.summaryConfig = summaryConfig;
    
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
    }

    if (summaryPromptSource !== undefined) {
      this.summaryPromptSource = summaryPromptSource;
    }
    
    // Initialize summarizer if summarization is enabled
    if (summaryConfig.enabled) {
      this.summarizer = new LengthBasedSummarizer(provider, {
        model: this.config.model,
        temperature: this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE,
        provider: this.config.provider,
      });
    }
  }

  /**
   * Synthesizes a final Solution for the given problem using the full debate history.
   *
   * @param problem - The problem statement under debate.
   * @param rounds - The debate rounds containing proposals and critiques.
   * @param context - Additional debate context, including optional tracing context.
   * @returns A synthesized Solution that includes a description and basic metadata.
   */
  async synthesize(problem: string, rounds: DebateRound[], context: DebateContext): Promise<Solution> {
    const prompt = this.buildSynthesisPrompt(problem, rounds);
    const systemPrompt = this.resolvedSystemPrompt;
    const temperature = this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE;

    const tracingContext = context.tracingContext;
    const spanName = `judge-synthesize-${this.config.id}`;

    if (tracingContext) {
      return await this.synthesizeWithTracing(tracingContext, spanName, systemPrompt, prompt, temperature);
    }

    // Non-tracing execution (when tracing disabled)
    return await this.executeSynthesis(systemPrompt, prompt, temperature);
  }

  /**
   * Synthesizes a solution with Langfuse tracing enabled.
   * Creates spans and generations for observability, with fallback to non-tracing execution on errors.
   * 
   * @param tracingContext - The tracing context for creating spans and generations.
   * @param spanName - Name for the synthesis span.
   * @param systemPrompt - The system prompt for the LLM.
   * @param prompt - The user prompt for synthesis.
   * @param temperature - Temperature setting for the LLM.
   * @returns A synthesized Solution.
   * @private
   */
  private async synthesizeWithTracing(
    tracingContext: TracingContext,
    spanName: string,
    systemPrompt: string,
    prompt: string,
    temperature: number
  ): Promise<Solution> {
    let span: LangfuseSpan | undefined;
    let generation: LangfuseGeneration | undefined;
    
    try {
      // Create span - if this fails, we'll fall back to non-tracing execution
      span = tracingContext.trace.span({
        name: spanName,
        metadata: {
          judgeName: this.config.name,
          judgeId: this.config.id,
          debateId: tracingContext.trace.id || 'unknown',
        },
      });
    } catch (tracingError: unknown) {
      logWarning(`Langfuse tracing failed for judge synthesize (span creation): ${getErrorMessage(tracingError)}`);
      // Fallback to non-tracing execution
      return await this.executeSynthesis(systemPrompt, prompt, temperature);
    }

    try {
      // Create generation - if this fails, we'll end the span and fall back
      // span is guaranteed to be defined here (if it wasn't, we would have returned early)
      generation = span!.generation({
        name: 'llm-generation-0',
        input: {
          systemPrompt,
          userPrompt: prompt,
          model: this.config.model,
          temperature,
        },
        metadata: {
          model: this.config.model,
          temperature,
          provider: this.config.provider,
        },
      });
    } catch (tracingError: unknown) {
      const errorMessage = getErrorMessage(tracingError);
      logWarning(`Langfuse tracing failed for judge synthesize (generation creation): ${errorMessage}`);
      // End span and fall back to non-tracing execution
      // span is guaranteed to be defined here (if it wasn't, we would have returned early)
      try {
        span!.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: errorMessage,
        });
      } catch {
        // Ignore errors ending span
      }
      return await this.executeSynthesis(systemPrompt, prompt, temperature);
    }

    // Execute LLM call - if this fails, we should NOT retry, just propagate the error
    try {
      const res = await this.provider.complete({
        model: this.config.model,
        temperature,
        systemPrompt,
        userPrompt: prompt,
      });

      // Convert usage to langfuse format
      const langfuseUsage = res.usage ? {
        input: res.usage.inputTokens ?? null,
        output: res.usage.outputTokens ?? null,
        total: res.usage.totalTokens ?? null,
        unit: 'TOKENS' as const,
      } : undefined;

      // generation and span are guaranteed to be defined here (if they weren't, we would have returned early)
      generation!.end({
        output: {
          text: res.text,
        },
        ...(langfuseUsage && { usage: langfuseUsage }),
      });

      span!.end({
        output: {
          solutionDescription: res.text.substring(0, 200), // Truncate for metadata
        },
      });

      return {
        description: res.text,
        tradeoffs: [],
        recommendations: [],
        confidence: DEFAULT_CONFIDENCE_SCORE,
        synthesizedBy: this.config.id,
      };
    } catch (error: unknown) {
      // LLM call failed - end tracing with error and propagate the error (don't retry)
      // generation and span are guaranteed to be defined here (if they weren't, we would have returned early)
      const errorMessage = getErrorMessage(error);
      try {
        generation!.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: errorMessage,
        });
        span!.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: errorMessage,
        });
      } catch (tracingError: unknown) {
        // If ending tracing fails, log but don't mask the original error
        logWarning(`Langfuse tracing failed while ending span: ${getErrorMessage(tracingError)}`);
      }
      throw error;
    }
  }

  /**
   * Executes the LLM completion call for synthesis and returns a Solution.
   * This is a helper method that encapsulates the common pattern of calling the provider
   * and creating a Solution object from the response.
   * 
   * @param systemPrompt - The system prompt for the LLM.
   * @param userPrompt - The user prompt for synthesis.
   * @param temperature - Temperature setting for the LLM.
   * @returns A Solution object created from the LLM response.
   */
  private async executeSynthesis(
    systemPrompt: string,
    userPrompt: string,
    temperature: number
  ): Promise<Solution> {
    const res = await this.provider.complete({
      model: this.config.model,
      temperature,
      systemPrompt,
      userPrompt,
    });

    return {
      description: res.text,
      tradeoffs: [],
      recommendations: [],
      confidence: DEFAULT_CONFIDENCE_SCORE,
      synthesizedBy: this.config.id,
    };
  }

  /**
   * Expose the default system prompt text for the judge.
   */
  static defaultSystemPrompt(): string { return DEFAULT_JUDGE_SYSTEM_PROMPT; }

  /**
   * Returns the default summary prompt for the judge.
   * 
   * @param content - The content to summarize.
   * @param maxLength - Maximum length for the summary.
   * @returns The default summary prompt text for the judge.
   */
  static defaultSummaryPrompt(content: string, maxLength: number): string {
    return DEFAULT_JUDGE_SUMMARY_PROMPT(content, maxLength);
  }

  /**
   * Determines if context summarization should occur based on configuration and final round content size.
   * 
   * Summarization is triggered when:
   * 1. Summarization is enabled in configuration
   * 2. Debate rounds exist
   * 3. Character count of final round's proposals and refinements exceeds threshold
   * 
   * @param rounds - The debate rounds to evaluate.
   * @returns True if summarization should occur, false otherwise.
   */
  shouldSummarize(rounds: DebateRound[]): boolean {
    
    if (!this.summaryConfig.enabled) {
      return false;
    }

    if (!rounds || rounds.length === 0) {
      return false;
    }

    const finalRoundContent = this.getFinalRoundRelevantContent(rounds);
    
    return finalRoundContent.length >= this.summaryConfig.threshold;
  }

  /**
   * Extracts proposals and refinements from the final round for summarization.
   * 
   * @param rounds - The debate rounds.
   * @returns Concatenated text of final round's proposals and refinements.
   */
  private getFinalRoundRelevantContent(rounds: DebateRound[]): string {
    if (!rounds || rounds.length === 0) {
      return '';
    }

    const finalRound = rounds[rounds.length - 1];
    if (!finalRound) {
      return '';
    }

    const relevantContributions: string[] = [];

    for (const contribution of finalRound.contributions) {
      if (contribution.type === CONTRIBUTION_TYPES.PROPOSAL || 
          contribution.type === CONTRIBUTION_TYPES.REFINEMENT) {
        relevantContributions.push(`[${contribution.agentRole}] ${contribution.type}:\n${contribution.content}`);
      }
    }

    return relevantContributions.join('\n\n');
  }

  /**
   * Prepares the debate context for synthesis, potentially summarizing it if needed.
   * 
   * This method evaluates whether summarization is necessary using `shouldSummarize()`.
   * If summarization is not needed, returns the original context unchanged.
   * If summarization is needed, generates a concise summary from the judge's perspective
   * and returns a new context with the summary field populated.
   * 
   * On summarization errors, falls back to the final round's proposals and refinements.
   * 
   * @param rounds - The debate rounds to prepare.
   * @param tracingContext - Optional tracing context for adding tracing spans.
   * @returns The context preparation result.
   */
  async prepareContext(rounds: DebateRound[], tracingContext?: TracingContext): Promise<ContextPreparationResult> {
    if (!this.shouldSummarize(rounds)) {
      return { context: { problem: '', history: rounds } };
    }

    const spanName = `judge-prepareContext-${this.config.id}`;

    if (tracingContext) {
      let span: LangfuseSpan | undefined;
      
      try {
        // Create span - if this fails, we'll fall back to non-tracing execution
        span = tracingContext.trace.span({
          name: spanName,
          metadata: {
            judgeName: this.config.name,
            judgeId: this.config.id,
            debateId: tracingContext.trace.id || 'unknown',
          },
        });
      } catch (tracingError: unknown) {
        logWarning(`Langfuse tracing failed for judge prepareContext (span creation): ${getErrorMessage(tracingError)}`);
        // Fallback to non-tracing execution
        return this.executeSummarization(rounds);
      }

      try {
        // Execute summarization with tracing - if this fails due to LLM error, propagate it
        const result = await this.executeSummarizationWithTracing(rounds, span);
        span.end();
        return result;
      } catch (error: unknown) {
        // Error from summarization (could be LLM error) - end span and propagate error (don't retry)
        const errorMessage = getErrorMessage(error);
        try {
          span.end({
            level: SPAN_LEVEL.ERROR,
            statusMessage: errorMessage,
          });
        } catch (tracingError: unknown) {
          // If ending span fails, log but don't mask the original error
          logWarning(`Langfuse tracing failed while ending span: ${getErrorMessage(tracingError)}`);
        }
        throw error;
      }
    }

    // Non-tracing execution (when tracing disabled)
    return this.executeSummarization(rounds);
  }

  /**
   * Executes summarization with tracing support for LLM call.
   */
  private async executeSummarizationWithTracing(
    rounds: DebateRound[],
    parentSpan: LangfuseSpan
  ): Promise<ContextPreparationResult> {
    const contentToSummarize = this.getFinalRoundRelevantContent(rounds);

    if (!this.summarizer) {
      logWarning(`Judge ${this.config.name}: Summarization enabled but no summarizer available. Using final round content.`);
      return { context: { problem: '', history: rounds } };
    }

    const summaryPrompt = DEFAULT_JUDGE_SUMMARY_PROMPT(contentToSummarize, this.summaryConfig.maxLength);

    let generation: LangfuseGeneration | undefined;
    
    try {
      // Create generation - if this fails, we'll fall back to non-tracing execution
      generation = parentSpan.generation({
        name: 'llm-generation-0',
        input: {
          systemPrompt: this.resolvedSystemPrompt,
          userPrompt: summaryPrompt,
          model: this.config.model,
          temperature: this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE,
        },
        metadata: {
          model: this.config.model,
          temperature: this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE,
          provider: this.config.provider,
        },
      });
    } catch (tracingError: unknown) {
      logWarning(`Langfuse tracing failed for judge prepareContext (generation creation): ${getErrorMessage(tracingError)}`);
      // Fallback to non-tracing execution
      return this.executeSummarization(rounds);
    }

    // Execute summarization - if this fails, we should NOT retry, just propagate the error
    try {
      const result = await this.summarizer.summarize(
        contentToSummarize,
        this.config.role,
        this.summaryConfig,
        this.resolvedSystemPrompt,
        summaryPrompt
      );

      // Convert usage to langfuse format
      const langfuseUsage = result.metadata.tokensUsed ? {
        input: null,
        output: null,
        total: result.metadata.tokensUsed,
        unit: 'TOKENS' as const,
      } : undefined;

      // generation is guaranteed to be defined here (if it wasn't, we would have returned early)
      generation!.end({
        output: {
          summary: result.summary,
        },
        ...(langfuseUsage && { usage: langfuseUsage }),
      });

      const summary: DebateSummary = {
        agentId: this.config.id,
        agentRole: this.config.role,
        summary: result.summary,
        metadata: result.metadata,
      };

      return { context: { problem: '', history: rounds }, summary };
    } catch (error: unknown) {
      // Summarization LLM call failed - end generation with error and propagate (don't retry)
      // generation is guaranteed to be defined here (if it wasn't, we would have returned early)
      const errorMessage = getErrorMessage(error);
      try {
        generation!.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: errorMessage,
        });
      } catch (tracingError: unknown) {
        // If ending generation fails, log but don't mask the original error
        logWarning(`Langfuse tracing failed while ending generation: ${getErrorMessage(tracingError)}`);
      }
      // Propagate the original error - don't fall back, let the caller handle it
      throw error;
    }
  }

  /**
   * Executes the summarization logic. Extracted to a separate method for reuse with/without tracing.
   */
  private async executeSummarization(rounds: DebateRound[]): Promise<ContextPreparationResult> {
    try {
      const contentToSummarize = this.getFinalRoundRelevantContent(rounds);

      if (!this.summarizer) {
        
        logWarning(`Judge ${this.config.name}: Summarization enabled but no summarizer available. Using final round content.`);
        return { context: { problem: '', history: rounds } };
      }

      
      const summaryPrompt = DEFAULT_JUDGE_SUMMARY_PROMPT(contentToSummarize, this.summaryConfig.maxLength);

      const result = await this.summarizer.summarize(
        contentToSummarize,
        this.config.role,
        this.summaryConfig,
        this.resolvedSystemPrompt,
        summaryPrompt
      );

      
      const summary: DebateSummary = {
        agentId: this.config.id,
        agentRole: this.config.role,
        summary: result.summary,
        metadata: result.metadata,
      };

      
      return { context: { problem: '', history: rounds }, summary };
    } catch (error: unknown) {
      // Log error to stderr and fallback to final round content
      logWarning(
        `Judge ${this.config.name}: Summarization failed with error: ${getErrorMessage(error)}. Falling back to final round content.`
      );
      return { context: { problem: '', history: rounds } };
    }
  }

  /**
   * Builds the synthesis prompt by stitching the problem and the complete debate history
   * into a single, structured instruction for the LLM.
   *
   * @param problem - The problem statement.
   * @param rounds - The debate rounds to summarize for the judge.
   * @returns A complete user prompt string for the judge to synthesize a solution.
   */
  private buildSynthesisPrompt(problem: string, rounds: DebateRound[]): string {
    let text = `Problem: ${problem}\n\n`;

    // Check if we should use summarization
    if (this.shouldSummarize(rounds)) {
      // Use only final round's proposals and refinements
      const finalRoundContent = this.getFinalRoundRelevantContent(rounds);
      if (finalRoundContent) {
        text += `Final Round Key Contributions:\n${finalRoundContent}\n\n`;
      }
    } else {
      // Use full history
      rounds.forEach((round, idx) => {
        text += `Round ${idx + 1}\n`;
        for (const c of round.contributions) {
          text += `[${c.agentRole}] ${c.type}:\n${c.content}\n\n`;
        }
      });
    }

    text += `\nSynthesize the best solution incorporating strongest ideas, addressing concerns, with clear recommendations and a confidence score.`;
    return text;
  }
}
