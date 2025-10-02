import { AgentConfig } from '../types/agent.types';
import { DebateContext, DebateRound, Solution } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const JUDGE_SYSTEM_PROMPT = `You are an expert technical judge responsible for synthesizing the best solution from multiple agent proposals and debates.
Be objective and evidence-based; combine complementary ideas; address concerns; provide recommendations and a confidence score.`;

export class JudgeAgent {
  constructor(private config: AgentConfig, private provider: LLMProvider) {}

  async synthesize(problem: string, rounds: DebateRound[], _context: DebateContext): Promise<Solution> {
    const prompt = this.buildSynthesisPrompt(problem, rounds);
    const description = await this.provider.complete({
      model: this.config.model,
      temperature: this.config.temperature ?? 0.3,
      systemPrompt: this.config.systemPrompt || JUDGE_SYSTEM_PROMPT,
      userPrompt: prompt,
    });

    return {
      description,
      tradeoffs: [],
      recommendations: [],
      confidence: 75,
      synthesizedBy: this.config.id,
    };
  }

  private buildSynthesisPrompt(problem: string, rounds: DebateRound[]): string {
    let text = `Problem: ${problem}\n\n`;
    rounds.forEach((round, idx) => {
      text += `Round ${idx + 1} (${round.phase})\n`;
      for (const c of round.contributions) {
        text += `[${c.agentRole}] ${c.type}:\n${c.content}\n\n`;
      }
    });
    text += `\nSynthesize the best solution incorporating strongest ideas, addressing concerns, with clear recommendations and a confidence score.`;
    return text;
  }
}
