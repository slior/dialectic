import { AgentConfig, PromptSource } from '../types/agent.types';
import { DebateContext, DebateRound, Solution } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

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
  
  constructor(private config: AgentConfig, private provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource) {
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
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
   * Builds the synthesis prompt by stitching the problem and the complete debate history
   * into a single, structured instruction for the LLM.
   *
   * @param problem - The problem statement.
   * @param rounds - The debate rounds to summarize for the judge.
   * @returns A complete user prompt string for the judge to synthesize a solution.
   */
  private buildSynthesisPrompt(problem: string, rounds: DebateRound[]): string {
    let text = `Problem: ${problem}\n\n`;

    rounds.forEach((round, idx) => {
      text += `Round ${idx + 1}\n`;
      for (const c of round.contributions) {
        text += `[${c.agentRole}] ${c.type}:\n${c.content}\n\n`;
      }
    });

    text += `\nSynthesize the best solution incorporating strongest ideas, addressing concerns, with clear recommendations and a confidence score.`;
    return text;
  }
}
