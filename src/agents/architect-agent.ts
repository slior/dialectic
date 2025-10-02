import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect specializing in distributed systems and scalable architecture design.
Consider scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns.
When proposing solutions, start with high-level architecture, identify key components, communication patterns, failure modes, and provide clear descriptions.
When critiquing, look for scalability bottlenecks, missing components, architectural coherence, and operational complexity.`;

export class ArchitectAgent extends Agent {
  constructor(config: AgentConfig, provider: LLMProvider) {
    super(config, provider);
  }

  async propose(problem: string, _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Problem to solve:\n${problem}\n\nAs an architect, propose a comprehensive solution including approach, key components, challenges, and justification.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  async critique(proposal: Proposal, _context: DebateContext): Promise<Critique> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Review this proposal as an architect. Identify strengths, weaknesses, improvements, and critical issues.\n\nProposal:\n${proposal.content}`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  async refine(original: Proposal, critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing valid concerns, incorporating good suggestions, and strengthening the solution.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }
}
