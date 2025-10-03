import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, ContributionMetadata } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';

const ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect specializing in distributed systems and scalable architecture design.
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
  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * @param config - Agent configuration, including model and optional system prompt.
   * @param provider - LLMProvider instance for LLM interactions.
   */
  private constructor(config: AgentConfig, provider: LLMProvider) {
    super(config, provider);
  }

  /**
   * Factory method to create a new ArchitectAgent instance.
   * @param config - Agent configuration, including model and optional system prompt.
   * @param provider - LLMProvider instance for LLM interactions.
   * @returns A new ArchitectAgent instance.
   */
  static create(config: AgentConfig, provider: LLMProvider): ArchitectAgent {
    return new ArchitectAgent(config, provider);
  }

  /**
   * Generates a comprehensive architectural proposal for the given problem.
   * @param problem - The software design problem to solve.
   * @param _context - Debate context
   * @returns A Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Problem to solve:\n${problem}\n\nAs an architect, propose a comprehensive solution including approach, key components, challenges, and justification.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Critiques a given proposal from an architectural perspective.
   * Identifies strengths, weaknesses, improvements, and critical issues.
   * @param proposal - The proposal to critique.
   * @param _context - Debate context (unused).
   * @returns A Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, _context: DebateContext): Promise<Critique> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Review this proposal as an architect. Identify strengths, weaknesses, improvements, and critical issues.\n\nProposal:\n${proposal.content}`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Refines the original proposal by addressing critiques and incorporating suggestions.
   * Strengthens the solution based on feedback from other agents.
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param _context - Debate context (unused).
   * @returns A new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], _context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = `Original proposal:\n${original.content}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing valid concerns, incorporating good suggestions, and strengthening the solution.`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }
}
