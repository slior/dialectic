import { DEFAULT_JUDGE_SUMMARY_PROMPT } from '../agents/prompts/judge-prompts';
import { LLMProvider, CompletionUsage } from '../providers/llm-provider';
import { AgentConfig, PromptSource } from '../types/agent.types';
import { DebateContext, DebateRound, Solution, DebateSummary, ContextPreparationResult, SummarizationConfig, CONTRIBUTION_TYPES, DebateState, Contribution } from '../types/debate.types';
import { TracingContext, LangfuseSpan, LangfuseGeneration, SPAN_LEVEL } from '../types/tracing.types';
import { getErrorMessage } from '../utils/common';
import { logWarning } from '../utils/console';
import { ContextSummarizer, LengthBasedSummarizer } from '../utils/context-summarizer';

/**
 * Default system instructions for the judge when synthesizing a final solution.
 */
const DEFAULT_JUDGE_SYSTEM_PROMPT = `You are an expert technical judge. Synthesize the best solution from the debate for this problem. Be objective and evidence-based. Combine ideas that directly address the problem. Address only concerns that affect the stated requirements or constraints. Give concrete recommendations that apply to this problem and a confidence score. Avoid generic architecture advice.`;

/**
 * Default temperature used by the judge when no temperature is provided on the config.
 */
const DEFAULT_JUDGE_TEMPERATURE = 0.3;

/**
 * Hard cap for confidence when major requirements are unfulfilled.
 */
const CONFIDENCE_CAP_WHEN_MAJORS_UNMET = 40;

/**
 * Fallback confidence score when JSON parsing fails and we cannot validate requirements.
 */
const FALLBACK_CONFIDENCE_SCORE = 50;

/**
 * Interface for parsed judge synthesis output.
 */
interface JudgeSynthesisOutput {
  solutionMarkdown: string;
  tradeoffs: string[];
  recommendations: string[];
  unfulfilledMajorRequirements: string[];
  openQuestions: string[];
  confidence: number;
}

/**
 * Langfuse usage format for token tracking.
 */
type LangfuseUsage = {
  input: number | null;
  output: number | null;
  total: number | null;
  unit: 'TOKENS';
};

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
   * Parses the raw synthesis output text from the LLM and constructs a Solution object.
   *
   * This method attempts to parse structured information such as tradeoffs, recommendations,
   * confidence scores, and open questions from the provided rawText, applies any necessary
   * adjustments (like capping confidence), and generates a markdown-formatted solution description.
   * If parsing fails, the rawText is returned as the solution description with default/fallback metadata.
   *
   * @param rawText - The raw output string from the synthesis LLM call.
   * @returns A Solution object containing the synthesized description and metadata.
   */
  private buildSolutionFromSynthesisText(rawText: string): Solution {
    const parsed = this.parseJudgeSynthesisOutput(rawText);

    if (parsed) {
      const finalConfidence = this.applyHardCaps(parsed.confidence, parsed.unfulfilledMajorRequirements);
      const description = this.renderFinalSolutionMarkdown(
        parsed.solutionMarkdown,
        finalConfidence,
        parsed.unfulfilledMajorRequirements,
        parsed.openQuestions,
        parsed.recommendations,
        parsed.tradeoffs
      );

      return {
        description,
        tradeoffs: parsed.tradeoffs,
        recommendations: parsed.recommendations,
        confidence: finalConfidence,
        synthesizedBy: this.config.id,
        unfulfilledMajorRequirements: parsed.unfulfilledMajorRequirements,
        openQuestions: parsed.openQuestions,
      };
    }

    // Fallback: treat response as plain markdown
    return {
      description: rawText,
      tradeoffs: [],
      recommendations: [],
      confidence: this.applyHardCaps(FALLBACK_CONFIDENCE_SCORE, []),
      synthesizedBy: this.config.id,
    };
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
   * Creates a Langfuse span with judge metadata.
   * 
   * @param tracingContext - The tracing context for creating the span.
   * @param spanName - Name for the span.
   * @returns The created Langfuse span.
   * @private
   */
  private createJudgeSpan(tracingContext: TracingContext, spanName: string): LangfuseSpan {
    return tracingContext.trace.span({
      name: spanName,
      metadata: {
        judgeName: this.config.name,
        judgeId: this.config.id,
        debateId: tracingContext.trace.id || 'unknown',
      },
    });
  }

  /**
   * Creates a Langfuse generation with judge metadata.
   * 
   * @param span - The parent span to create the generation under.
   * @param systemPrompt - The system prompt for the LLM.
   * @param userPrompt - The user prompt for the LLM.
   * @param temperature - Temperature setting for the LLM.
   * @returns The created Langfuse generation.
   * @private
   */
  private createJudgeGeneration(span: LangfuseSpan, systemPrompt: string, userPrompt: string, temperature: number): LangfuseGeneration {
    return span.generation({
      name: 'llm-generation-0',
      input: { systemPrompt, userPrompt, model: this.config.model, temperature },
      metadata: {
        model: this.config.model,
        temperature,
        provider: this.config.provider,
      },
    });
  }

  /**
   * Converts usage information to Langfuse format.
   * 
   * @param usage - Optional completion usage object with token counts.
   * @returns Langfuse usage object, or undefined if usage is not provided.
   * @private
   */
  private convertUsageToLangfuse(usage?: CompletionUsage): LangfuseUsage | undefined {
    if (!usage) {
      return undefined;
    }
    return {
      input: usage.inputTokens ?? null,
      output: usage.outputTokens ?? null,
      total: usage.totalTokens ?? null,
      unit: 'TOKENS' as const,
    };
  }

  /**
   * Converts a total token count to Langfuse format.
   * 
   * @param totalTokens - Total token count.
   * @returns Langfuse usage object, or undefined if totalTokens is not provided.
   * @private
   */
  private convertTotalTokensToLangfuse(totalTokens?: number): LangfuseUsage | undefined {
    if (totalTokens == null) {
      return undefined;
    }
    return {
      input: null,
      output: null,
      total: totalTokens,
      unit: 'TOKENS' as const,
    };
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
      span = this.createJudgeSpan(tracingContext, spanName);
    } catch (tracingError: unknown) {
      logWarning(`Langfuse tracing failed for judge synthesize (span creation): ${getErrorMessage(tracingError)}`);
      // Fallback to non-tracing execution
      return await this.executeSynthesis(systemPrompt, prompt, temperature);
    }

    try {
      // Create generation - if this fails, we'll end the span and fall back
      // span is guaranteed to be defined here (if it wasn't, we would have returned early)
      generation = this.createJudgeGeneration(span!, systemPrompt, prompt, temperature);
    } catch (tracingError: unknown) {
      const errorMessage = getErrorMessage(tracingError);
      logWarning(`Langfuse tracing failed for judge synthesize (generation creation): ${errorMessage}`);
      // End span and fall back to non-tracing execution
      // span is guaranteed to be defined here (if it wasn't, we would have returned early)
      try {
        span!.end({ level: SPAN_LEVEL.ERROR, statusMessage: errorMessage, });
      } catch (tracingError: unknown) {
        logWarning(`Langfuse tracing failed while ending span: ${getErrorMessage(tracingError)}`);
      }
      return await this.executeSynthesis(systemPrompt, prompt, temperature);
    }

    // Execute LLM call - if this fails, we should NOT retry, just propagate the error
    try {
      const res = await this.provider.complete({ model: this.config.model, temperature, systemPrompt, userPrompt: prompt, });

      const langfuseUsage = this.convertUsageToLangfuse(res.usage);

      // generation and span are guaranteed to be defined here (if they weren't, we would have returned early)
      generation!.end({
        output: {
          text: res.text,
        },
        ...(langfuseUsage && { usage: langfuseUsage }),
      });

      const solution = this.buildSolutionFromSynthesisText(res.text);

      const MAX_METADATA_DESCRIPTION_LENGTH = 200;
      span!.end({
        output: {
          solutionDescription: solution.description.substring(0, MAX_METADATA_DESCRIPTION_LENGTH), // Truncate for metadata
        },
      });

      return solution;
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
  private async executeSynthesis( systemPrompt: string, userPrompt: string, temperature: number ): Promise<Solution>
  {
    const res = await this.provider.complete({ model: this.config.model, temperature, systemPrompt, userPrompt, });
    return this.buildSolutionFromSynthesisText(res.text);
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
        span = this.createJudgeSpan(tracingContext, spanName);
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
    
    try { // Create generation - if this fails, we'll fall back to non-tracing execution
      generation = this.createJudgeGeneration( parentSpan, this.resolvedSystemPrompt, summaryPrompt, this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE );
    } catch (tracingError: unknown) {
      logWarning(`Langfuse tracing failed for judge prepareContext (generation creation): ${getErrorMessage(tracingError)}`);
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
      const langfuseUsage = this.convertTotalTokensToLangfuse(result.metadata.tokensUsed);

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
    } else { // Use full history
      rounds.forEach((round, idx) => {
        text += `Round ${idx + 1}\n`;
        for (const c of round.contributions) {
          text += `[${c.agentRole}] ${c.type}:\n${c.content}\n\n`;
        }
      });
    }

    text += `\n\n## Instructions

You MUST respond with **ONLY valid JSON** (no markdown code blocks, no prose). Use this exact schema:

{
  "solutionMarkdown": "Full solution in Markdown. Be concrete and specific to this problem. Tie each part to the problem, its constraints, and the debate. Avoid generic best-practices that the problem does not require.",
  "tradeoffs": ["List of trade-offs considered", "Each as a separate string"],
  "recommendations": ["Recommendations that apply to this problem and its constraints. Omit generic advice.", "Each as a separate string"],
  "unfulfilledMajorRequirements": ["List any major requirements that are not fulfilled", "Empty array if all are met"],
  "openQuestions": ["List any open questions or ambiguities", "Empty array if none"],
  "confidence": 75
}

### Requirements Analysis

1. **Infer major requirements** from the problem statement and debate history:
   - Look for strong language: "must", "shall", "required", "needs to", "critical", "essential"
   - Review any clarifications provided during the debate (they are authoritative)
   - Review Requirements Coverage sections in proposals if present

2. **Assess fulfillment**: For each major requirement, determine if the synthesized solution addresses it adequately.

3. **Ground the solution**: In solutionMarkdown and recommendations, every element should relate to the problem, its constraints, or the debate. Do not add generic architecture or process advice that the problem does not call for.

4. **Set confidence**:
   - If ANY unfulfilled major requirements exist, set confidence ≤ 40 (the code will enforce this cap)
   - Otherwise, set confidence based on solution quality, completeness, and coherence (0-100)

5. **Always produce solutionMarkdown**: Even if confidence is low or requirements are unmet, provide a complete solution description in Markdown format.

6. **Populate arrays**: Include all relevant trade-offs, recommendations, unfulfilled requirements, and open questions. Use empty arrays if none apply.

Respond with ONLY the JSON object, no other text.`;
    return text;
  }

  /**
   * Extracts the first JSON object from text, handling cases where JSON is wrapped in markdown code blocks.
   * 
   * @param text - The text to extract JSON from.
   * @returns The JSON string, or null if no JSON object found.
   */
  private extractFirstJsonObject(text: string): string | null {
    // Remove markdown code block markers if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    cleaned = cleaned.trim();

    // Find the first complete JSON object
    let braceCount = 0;
    let startIdx = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (startIdx === -1) {
          startIdx = i;
        }
        braceCount++;
      } else if (cleaned[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          return cleaned.substring(startIdx, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * Parses judge synthesis output from text, extracting JSON and validating required fields.
   * 
   * @param text - The raw text response from the LLM.
   * @returns Parsed output, or undefined if parsing fails.
   */
  private parseJudgeSynthesisOutput(text: string): JudgeSynthesisOutput | undefined {
    const jsonStr = this.extractFirstJsonObject(text);
    if (!jsonStr) {
      logWarning(`Judge ${this.config.name}: No JSON object found in judge synthesis response. Falling back to plain markdown.`);
      return undefined;
    }

    try {
      const parsed = JSON.parse(jsonStr) as Partial<JudgeSynthesisOutput>;
      
      // Validate required field
      if (!parsed.solutionMarkdown || typeof parsed.solutionMarkdown !== 'string') {
        logWarning(
          `Judge ${this.config.name}: Invalid judge synthesis JSON (missing/invalid "solutionMarkdown"). Falling back to plain markdown.`
        );
        return undefined;
      }

      // Normalize arrays (ensure they are arrays, default to empty)
      const tradeoffs = Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : [];
      const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const unfulfilledMajorRequirements = Array.isArray(parsed.unfulfilledMajorRequirements)  ? parsed.unfulfilledMajorRequirements  : [];
      const openQuestions = Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [];

      // Normalize confidence (ensure it's a number, clamp to 0-100)
      const confidence = typeof parsed.confidence === 'number'? this.clampConfidence(parsed.confidence) : FALLBACK_CONFIDENCE_SCORE;

      return {
        solutionMarkdown: parsed.solutionMarkdown,
        tradeoffs: tradeoffs.map(String),
        recommendations: recommendations.map(String),
        unfulfilledMajorRequirements: unfulfilledMajorRequirements.map(String),
        openQuestions: openQuestions.map(String),
        confidence,
      };
    } catch (err: unknown) {
      logWarning( `Judge ${this.config.name}: Failed to parse judge synthesis JSON. Falling back to plain markdown. Error: ${getErrorMessage(err)}`);
      return undefined;
    }
  }

  /**
   * Evaluates the confidence level of the current debate state.
   * Analyzes the latest round's refinements to determine consensus.
   * 
   * @param state - The current debate state to evaluate.
   * @param tracingContext - Optional tracing context for observability.
   * @returns A confidence score from 0-100 indicating how much consensus has been reached.
   */
  async evaluateConfidence(state: DebateState, tracingContext?: TracingContext): Promise<number> {
    const latestRound = state.getLatestRound();
    if (!latestRound) 
      return 0;
    

    const refinements = latestRound.contributions.filter( (c) => c.type === CONTRIBUTION_TYPES.REFINEMENT );

    if (refinements.length === 0)
      return 0;

    // Build a prompt asking the judge to evaluate consensus
    const evaluationPrompt = this.buildConfidenceEvaluationPrompt(state.problem, state.rounds, refinements);
    const systemPrompt = this.resolvedSystemPrompt;
    const temperature = this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE;

    if (tracingContext) {
      const spanName = `judge-evaluateConfidence-${this.config.id}`;
      return await this.evaluateConfidenceWithTracing(tracingContext, spanName, systemPrompt, evaluationPrompt, temperature);
    }
    else  return await this.executeConfidenceEvaluation(systemPrompt, evaluationPrompt, temperature);
  }

  /**
   * Builds a prompt for evaluating confidence/consensus in the current debate state.
   */
  private buildConfidenceEvaluationPrompt(problem: string, _rounds: DebateRound[], refinements: Contribution[]): string {
    const refinementsText = refinements
      .map((r) => `[${r.agentRole}] ${r.content}`)
      .join('\n\n');

    return `You are evaluating the current state of a debate to determine if consensus has been reached.

Problem: ${problem}

Latest refinements from all agents:
${refinementsText}
--------------------------------

Instructions:
- Return a JSON object with a single field "confidence" (number 0-100) representing your confidence that consensus has been reached and the solution is ready.
- You MUST respond with **ONLY valid JSON** (no markdown code blocks, no prose). Use this exact schema:
\`\`\`json
{
  "confidence": number 0-100
}
\`\`\`
- Score ranges:
    - 0-40: No consensus has been reached. The solution is not ready. Major conflicts remain or unmet requirements exist.
    - 41-70: Only partial alignment or important gaps exist.
    - 71-89: Mostly aligned, but some non-trivial conflicts or gaps remain.
    - 90-100: Fully aligned, no significant conflicts or gaps remain. The solution is ready.
- Before giving confidence ≥ 90, confirm: 
  - no agents refinement contradicts another on key points;
  - no major requirement is unaddressed;
  - no critical concern from critiques is left unanswered.
  If any of these fail, set confidence below 90.
- Be skeptical. Prefer to score below 50 when in doubt. Only give high scores (>70) when the eviidence for consensus is strong.

Evaluate the level of consensus and confidence in the current solution. Consider:
- How aligned are the different agent perspectives?
- Are there major unresolved conflicts?
- Is the solution well-defined and complete?
- Are there critical concerns that remain unaddressed?
- Are all main requirements met?
- Are there any open questions or ambiguities?
- Are there any trade-offs or compromises that need to be considered?
- Are there any recommendations that need to be made?
- Are there any other concerns that need to be considered?


Example response:
\`\`\`json
{
  "confidence": 85
}
\`\`\``;
  }

  
  /**
   * Executes a confidence evaluation for the current solution with support for Langfuse tracing.
   *
   * This method attempts to create a tracing span and generation for the confidence scoring action.
   * If tracing setup fails at any stage, the operation falls back to non-traced execution.
   *
   * On success, this method records usage, confidence output, and any errors to the associated
   * Langfuse span/generation for observability/auditing. Otherwise, warning logs are emitted.
   *
   * @param tracingContext - The Langfuse tracing context for the debate
   * @param spanName - Name to assign to the Langfuse span for this evaluation
   * @param systemPrompt - The system prompt to send to the judge LLM
   * @param prompt - The user (content) prompt to be evaluated
   * @param temperature - LLM temperature setting for completion
   * @returns The confidence score extracted from the LLM response (0–100)
   * @throws Rethrows on evaluation error (unless tracing setup fails, in which case logs and falls back)
   */
  private async evaluateConfidenceWithTracing(  tracingContext: TracingContext, spanName: string, systemPrompt: string,
                                                prompt: string, temperature: number ): Promise<number> {
    let span: LangfuseSpan | undefined;
    let generation: LangfuseGeneration | undefined;

    try {
      span = this.createJudgeSpan(tracingContext, spanName);
    } catch (tracingError: unknown) {
      logWarning(`Langfuse tracing failed for judge evaluateConfidence (span creation): ${getErrorMessage(tracingError)}`);
      return await this.executeConfidenceEvaluation(systemPrompt, prompt, temperature);
    }

    try {
      generation = this.createJudgeGeneration(span!, systemPrompt, prompt, temperature);
    } catch (tracingError: unknown) {
      const errorMessage = getErrorMessage(tracingError);
      logWarning(`Langfuse tracing failed for judge evaluateConfidence (generation creation): ${errorMessage}`);
      try {
        span!.end({ level: SPAN_LEVEL.ERROR, statusMessage: errorMessage });
      } catch (tracingError: unknown) {
        logWarning(`Langfuse tracing failed while ending span: ${getErrorMessage(tracingError)}`);
      }
      return await this.executeConfidenceEvaluation(systemPrompt, prompt, temperature);
    }

    try {
      const res = await this.provider.complete({ model: this.config.model, temperature, systemPrompt, userPrompt: prompt, });

      const langfuseUsage = this.convertUsageToLangfuse(res.usage);
      const confidence = this.parseConfidenceFromResponse(res.text);

      generation!.end({
        output: { confidence },
        ...(langfuseUsage && { usage: langfuseUsage }),
      });
      span!.end();

      return confidence;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      try {
        generation!.end({
          level: SPAN_LEVEL.ERROR,
          statusMessage: errorMessage,
        });
        span!.end({ level: SPAN_LEVEL.ERROR, statusMessage: errorMessage });
      } catch (tracingError: unknown) {
        logWarning(`Langfuse tracing failed while ending span/generation: ${getErrorMessage(tracingError)}`);
      }
      throw error;
    }
  }

  /**
   * Executes confidence evaluation without tracing.
   */
  private async executeConfidenceEvaluation(systemPrompt: string, prompt: string, temperature: number): Promise<number> {
    const res = await this.provider.complete({ model: this.config.model, temperature, systemPrompt, userPrompt: prompt, });

    return this.parseConfidenceFromResponse(res.text);
  }

  /**
   * Parses confidence score from LLM response.
   */
  private parseConfidenceFromResponse(text: string): number {
    const jsonStr = this.extractFirstJsonObject(text);
    if (!jsonStr) {
      logWarning(`Judge ${this.config.name}: No JSON found in confidence evaluation response. Using fallback score.`);
      return FALLBACK_CONFIDENCE_SCORE;
    }

    try {
      const parsed = JSON.parse(jsonStr) as { confidence?: number };
      if (typeof parsed.confidence === 'number') {
        return this.clampConfidence(parsed.confidence);
      }
      logWarning(`Judge ${this.config.name}: Invalid confidence value in response. Using fallback score.`);
      return FALLBACK_CONFIDENCE_SCORE;
    } catch (err: unknown) {
      logWarning(`Judge ${this.config.name}: Failed to parse confidence evaluation JSON. Using fallback score. Error: ${getErrorMessage(err)}`);
      return FALLBACK_CONFIDENCE_SCORE;
    }
  }

  /**
   * Clamps confidence score to valid range (0-100).
   * 
   * @param n - The confidence score to clamp.
   * @returns Clamped confidence score.
   */
  private clampConfidence(n: number): number {
    const MIN_CONFIDENCE = 0;
    const MAX_CONFIDENCE = 100;
    if (n < MIN_CONFIDENCE) return MIN_CONFIDENCE;
    if (n > MAX_CONFIDENCE) return MAX_CONFIDENCE;
    return n;
  }

  /**
   * Applies hard caps to confidence based on unfulfilled major requirements.
   * 
   * @param confidence - The base confidence score.
   * @param unfulfilledMajor - Array of unfulfilled major requirements.
   * @returns Confidence score with hard caps applied.
   */
  private applyHardCaps(confidence: number, unfulfilledMajor: string[]): number {
    if (unfulfilledMajor.length > 0) {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      return Math.min(confidence, CONFIDENCE_CAP_WHEN_MAJORS_UNMET);
    }
    return confidence;
  }

  /**
   * Renders the final solution markdown by combining solutionMarkdown with a Judge Assessment section.
   * 
   * @param solutionMarkdown - The main solution markdown.
   * @param confidence - The confidence score.
   * @param unfulfilledMajorRequirements - Array of unfulfilled major requirements.
   * @param openQuestions - Array of open questions.
   * @param recommendations - Array of recommendations.
   * @param tradeoffs - Array of trade-offs.
   * @returns Complete markdown string for Solution.description.
   */
  private renderFinalSolutionMarkdown(
    solutionMarkdown: string, confidence: number, unfulfilledMajorRequirements: string[],
    openQuestions: string[], recommendations: string[], tradeoffs: string[] ): string
  {
    let markdown = solutionMarkdown.trim();

    // Append Judge Assessment section
    markdown += '\n\n---\n\n## Judge Assessment\n\n';

    markdown += `**Confidence Score**: ${confidence}/100\n\n`;

    if (unfulfilledMajorRequirements.length > 0) {
      markdown += `### ⚠️ Unfulfilled Major Requirements\n\n`;
      unfulfilledMajorRequirements.forEach(req => {
        markdown += `- ${req}\n`;
      });
      markdown += '\n';
    }

    if (openQuestions.length > 0) {
      markdown += `### Open Questions\n\n`;
      openQuestions.forEach(q => {
        markdown += `- ${q}\n`;
      });
      markdown += '\n';
    }

    if (recommendations.length > 0) {
      markdown += `### Recommendations\n\n`;
      recommendations.forEach(rec => {
        markdown += `- ${rec}\n`;
      });
      markdown += '\n';
    }

    if (tradeoffs.length > 0) {
      markdown += `### Trade-offs\n\n`;
      tradeoffs.forEach(to => {
        markdown += `- ${to}\n`;
      });
      markdown += '\n';
    }

    return markdown;
  }
}
