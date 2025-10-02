import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const PERFORMANCE_SYSTEM_PROMPT = `You are a performance engineer specializing in system optimization, profiling, and resource management.
Consider latency, throughput, resource utilization, caching strategies, algorithmic complexity, and performance testing.
When proposing solutions, include performance requirements, optimization strategies, caching, and metrics.
When critiquing, look for bottlenecks, inefficient algorithms/data structures, resource usage, and scalability limits.`;

export class PerformanceAgent extends Agent {
  constructor(config: AgentConfig, provider: LLMProvider) {
    super(config, provider);
  }

  async propose(problem: string, _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const user = `Problem to solve:\n${problem}\n\nAs a performance engineer, propose a comprehensive solution focusing on latency/throughput, caching, and resource efficiency.`;
    const { content, latencyMs } = await this.callLLM(system, user);
    return { content, metadata: { latencyMs, model: this.config.model } };
  }

  async critique(proposal: Proposal, _context: DebateContext): Promise<Critique> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const user = `Review this proposal as a performance engineer. Identify strengths, bottlenecks, and concrete improvements.\n\nProposal:\n${proposal.content}`;
    const { content, latencyMs } = await this.callLLM(system, user);
    return { content, metadata: { latencyMs, model: this.config.model } };
  }

  async refine(original: Proposal, critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing performance concerns and strengthening the solution.`;
    const { content, latencyMs } = await this.callLLM(system, user);
    return { content, metadata: { latencyMs, model: this.config.model } };
  }
}
