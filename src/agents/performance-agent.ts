import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, PromptSource } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const DEFAULT_PERFORMANCE_SYSTEM_PROMPT = `You are a performance engineer specializing in system optimization, profiling, and resource management.
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
  private readonly resolvedSystemPrompt: string;
  public readonly promptSource?: PromptSource;
  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * @param config - The agent's configuration, including model, role.
   * @param provider - The LLMProvider instance used for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   */
  private constructor(config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource) {
    super(config, provider);
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
    }
  }

  /**
   * Factory method to create a new PerformanceAgent instance.
   * @param config - The agent's configuration, including model, role.
   * @param provider - The LLMProvider instance used for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @returns A new PerformanceAgent instance.
   */
  static create(config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource): PerformanceAgent {
    return new PerformanceAgent(config, provider, resolvedSystemPrompt, promptSource);
  }

  /**
   * Expose the default system prompt text for performance agent.
   */
  static defaultSystemPrompt(): string { return DEFAULT_PERFORMANCE_SYSTEM_PROMPT; }

  /**
   * Generates a performance-focused proposal for the given problem.
   * @param problem - The software/system design problem to solve.
   * @param context - The current debate context.
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const user = `Problem to solve:\n${problem}\n\nAs a performance engineer, propose a comprehensive solution focusing on latency/throughput, caching, and resource efficiency.`;
    return this.proposeImpl(context, system, user);
  }

  /**
   * Critiques a given proposal from a performance engineering perspective.
   * Identifies strengths, bottlenecks, and suggests concrete improvements.
   * @param proposal - The proposal to critique.
   * @param context - The current debate context.
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, context: DebateContext): Promise<Critique> {
    const system = this.resolvedSystemPrompt;
    const user = `Review this proposal as a performance engineer. Identify strengths, bottlenecks, and concrete improvements.\n\nProposal:\n${proposal.content}`;
    return this.critiqueImpl(proposal, context, system, user);
  }

  /**
   * Refines the agent's original proposal by addressing critiques and strengthening performance aspects.
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - The current debate context.
   * @returns A Promise resolving to a new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing performance concerns and strengthening the solution.`;
    return this.refineImpl(original, critiques, context, system, user);
  }
}
