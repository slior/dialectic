import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const PERFORMANCE_SYSTEM_PROMPT = `You are a performance engineer specializing in system optimization, profiling, and resource management.
Consider latency, throughput, resource utilization, caching strategies, algorithmic complexity, and performance testing.
When proposing solutions, include performance requirements, optimization strategies, caching, and metrics.
When critiquing, look for bottlenecks, inefficient algorithms/data structures, resource usage, and scalability limits.`;

/**
 * PerformanceAgent is an AI agent specializing in system performance optimization within the multi-agent debate system.
 *
 * This agent focuses on analyzing and improving software/system designs with respect to latency, throughput,
 * resource utilization, caching strategies, algorithmic complexity, and performance testing.
 *
 * Responsibilities:
 *  - Propose: Generates performance-focused solutions to a given problem, emphasizing efficiency and scalability.
 *  - Critique: Reviews proposals from other agents, identifying bottlenecks, inefficiencies, and suggesting improvements.
 *  - Refine: Refines its own proposals by incorporating critiques, further strengthening performance aspects.
 *
 * The agent uses a performance-oriented system prompt by default, but can be customized via its configuration.
 *
 * Note: This class cannot be extended. Use the static `create` factory method to instantiate.
 */
export class PerformanceAgent extends Agent {
  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * @param config - The agent's configuration, including model, role, and optional custom system prompt.
   * @param provider - The LLMProvider instance used for LLM interactions.
   */
  private constructor(config: AgentConfig, provider: LLMProvider) {
    super(config, provider);
  }

  /**
   * Factory method to create a new PerformanceAgent instance.
   * @param config - The agent's configuration, including model, role, and optional custom system prompt.
   * @param provider - The LLMProvider instance used for LLM interactions.
   * @returns A new PerformanceAgent instance.
   */
  static create(config: AgentConfig, provider: LLMProvider): PerformanceAgent {
    return new PerformanceAgent(config, provider);
  }

  /**
   * Generates a performance-focused proposal for the given problem.
   * @param problem - The software/system design problem to solve.
   * @param _context - The current debate context (unused in this implementation).
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const user = `Problem to solve:\n${problem}\n\nAs a performance engineer, propose a comprehensive solution focusing on latency/throughput, caching, and resource efficiency.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Critiques a given proposal from a performance engineering perspective.
   * Identifies strengths, bottlenecks, and suggests concrete improvements.
   * @param proposal - The proposal to critique.
   * @param _context - The current debate context (unused in this implementation).
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, _context: DebateContext): Promise<Critique> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const user = `Review this proposal as a performance engineer. Identify strengths, bottlenecks, and concrete improvements.\n\nProposal:\n${proposal.content}`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Refines the agent's original proposal by addressing critiques and strengthening performance aspects.
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param _context - The current debate context (unused in this implementation).
   * @returns A Promise resolving to a new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || PERFORMANCE_SYSTEM_PROMPT;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing performance concerns and strengthening the solution.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: any = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }
}
