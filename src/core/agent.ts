import { AgentConfig, Proposal, Critique } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

export abstract class Agent {
  constructor(protected config: AgentConfig, protected provider: LLMProvider) {}

  abstract propose(problem: string, context: DebateContext): Promise<Proposal>;
  abstract critique(proposal: Proposal, context: DebateContext): Promise<Critique>;
  abstract refine(originalProposal: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal>;

  protected async callLLM(systemPrompt: string, userPrompt: string) {
    const started = Date.now();
    const content = await this.provider.complete({
      model: this.config.model,
      temperature: this.config.temperature,
      systemPrompt,
      userPrompt,
    });
    const latencyMs = Date.now() - started;
    return { content, latencyMs };
  }
}
