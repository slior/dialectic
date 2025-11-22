import { AgentConfig, PromptSource } from '../types/agent.types';
import { DebateContext, DebateRound, Solution, DebateSummary, ContextPreparationResult, SummarizationConfig, CONTRIBUTION_TYPES } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';
import { ContextSummarizer, LengthBasedSummarizer } from '../utils/context-summarizer';
import { DEFAULT_JUDGE_SUMMARY_PROMPT } from '../agents/prompts/judge-prompts';
import { writeStderr } from '../utils/console';

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
   * @param _context - Additional debate context (unused for now).
   * @returns A synthesized Solution that includes a description and basic metadata.
   */
  async synthesize(problem: string, rounds: DebateRound[], _context: DebateContext): Promise<Solution> {
    const prompt = this.buildSynthesisPrompt(problem, rounds);
    const systemPrompt = this.resolvedSystemPrompt;
    const temperature = this.config.temperature ?? DEFAULT_JUDGE_TEMPERATURE;

    const res = await this.provider.complete({
      model: this.config.model,
      temperature,
      systemPrompt,
      userPrompt: prompt,
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
   * @returns The context preparation result.
   */
  async prepareContext(rounds: DebateRound[]): Promise<ContextPreparationResult> {
    
    if (!this.shouldSummarize(rounds)) {
      return { context: { problem: '', history: rounds } };
    }

    
    try {
      const contentToSummarize = this.getFinalRoundRelevantContent(rounds);

      if (!this.summarizer) {
        
        writeStderr(`Warning: Judge ${this.config.name}: Summarization enabled but no summarizer available. Using final round content.\n`);
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
    } catch (error: any) {
      // Log error to stderr and fallback to final round content
      writeStderr(
        `Warning: Judge ${this.config.name}: Summarization failed with error: ${error.message}. Falling back to final round content.\n`
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
