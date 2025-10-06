import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, PromptSource } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const DEFAULT_ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect specializing in distributed systems and scalable architecture design.
Consider scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns.
When proposing solutions, start with high-level architecture, identify key components, communication patterns, failure modes, and provide clear descriptions.
When critiquing, look for scalability bottlenecks, missing components, architectural coherence, and operational complexity.`;

/**
 * ArchitectAgent is an AI agent specializing in software architecture within the multi-agent debate system.
 * 
 * Responsibilities:
 * - Proposes high-level architectural solutions to software design problems.
 * - Critiques proposals from other agents, focusing on architectural soundness, scalability, and operational concerns.
 * - Refines its own proposals by incorporating feedback and critiques from other agents.
 * 
 * The agent leverages an LLM provider to generate its outputs, using a system prompt tailored for architectural reasoning.
 * 
 * Methods:
 * - propose: Generates a comprehensive architectural solution for a given problem.
 * - critique: Reviews and critiques a given proposal from an architectural perspective.
 * - refine: Refines an original proposal by addressing critiques and strengthening the solution.
 *
 * Note: This class cannot be extended. Use the static `create` factory method to instantiate.
 */
export class ArchitectAgent extends Agent {
  private readonly resolvedSystemPrompt: string;
  public readonly promptSource?: PromptSource;
  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * @param config - Agent configuration, including model.
   * @param provider - LLMProvider instance for LLM interactions.
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
   * Factory method to create a new ArchitectAgent instance.
   * @param config - Agent configuration, including model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @returns A new ArchitectAgent instance.
   */
  static create(config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string, promptSource?: PromptSource): ArchitectAgent {
    return new ArchitectAgent(config, provider, resolvedSystemPrompt, promptSource);
  }

  /**
   * Expose the default system prompt text.
   */
  static defaultSystemPrompt(): string { return DEFAULT_ARCHITECT_SYSTEM_PROMPT; }

  /**
   * Generates a comprehensive architectural proposal for the given problem.
   * @param problem - The software design problem to solve.
   * @param context - Debate context
   * @returns A Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const user = `Problem to solve:\n${problem}\n\nAs an architect, propose a comprehensive solution including approach, key components, challenges, and justification.`;
    return this.proposeImpl(context, system, user);
  }

  /**
   * Critiques a given proposal from an architectural perspective.
   * Identifies strengths, weaknesses, improvements, and critical issues.
   * @param proposal - The proposal to critique.
   * @param context - Debate context.
   * @returns A Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, context: DebateContext): Promise<Critique> {
    const system = this.resolvedSystemPrompt;
    const user = `Review this proposal as an architect. Identify strengths, weaknesses, improvements, and critical issues.\n\nProposal:\n${proposal.content}`;
    return this.critiqueImpl(proposal, context, system, user);
  }

  /**
   * Refines the original proposal by addressing critiques and incorporating suggestions.
   * Strengthens the solution based on feedback from other agents.
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - Debate context.
   * @returns A new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing valid concerns, incorporating good suggestions, and strengthening the solution.`;
    return this.refineImpl(original, critiques, context, system, user);
  }
}
