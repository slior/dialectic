import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, PromptSource, AgentRole } from '../types/agent.types';
import { DebateContext } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';
import { getPromptsForRole, RolePrompts } from './prompts';


/**
 * RoleBasedAgent is a unified AI agent implementation that supports multiple roles
 * through a prompt-based configuration system.
 * 
 * Unlike the previous implementation with separate classes per role (ArchitectAgent,
 * PerformanceAgent, SecurityAgent), this class uses a registry of role-specific prompts
 * to guide behavior, eliminating code duplication while maintaining role-specific expertise.
 * 
 * Responsibilities:
 * - Proposes solutions tailored to the agent's role (architect, performance, security, etc.)
 * - Critiques proposals from other agents using role-specific perspectives
 * - Refines its own proposals by incorporating feedback from other agents
 * 
 * The agent leverages an LLM provider to generate outputs, with prompts dynamically
 * selected based on the agent's configured role.
 * 
 * Note: This class cannot be extended. Use the static `create` factory method to instantiate.
 */
export class RoleBasedAgent extends Agent {
  private readonly resolvedSystemPrompt: string;
  private readonly rolePrompts: RolePrompts;
  public readonly promptSource?: PromptSource;

  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * 
   * @param config - Agent configuration, including role and model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   */
  private constructor(
    config: AgentConfig,
    provider: LLMProvider,
    resolvedSystemPrompt: string,
    promptSource?: PromptSource
  ) {
    super(config, provider);
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    this.rolePrompts = getPromptsForRole(config.role);
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
    }
  }

  /**
   * Factory method to create a new RoleBasedAgent instance.
   * 
   * @param config - Agent configuration, including role and model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @returns A new RoleBasedAgent instance configured for the specified role.
   */
  static create(
    config: AgentConfig,
    provider: LLMProvider,
    resolvedSystemPrompt: string,
    promptSource?: PromptSource
  ): RoleBasedAgent {
    return new RoleBasedAgent(config, provider, resolvedSystemPrompt, promptSource);
  }

  /**
   * Returns the default system prompt for a given role.
   * 
   * This method allows callers to retrieve the built-in system prompt for any role
   * without instantiating an agent. Used during prompt resolution to provide fallback
   * prompts when custom prompt files are not available.
   * 
   * @param role - The agent role to get the default prompt for.
   * @returns The default system prompt text for the specified role.
   */
  static defaultSystemPrompt(role: AgentRole): string {
    const prompts = getPromptsForRole(role);
    return prompts.systemPrompt;
  }

  /**
   * Generates a comprehensive proposal for the given problem.
   * 
   * The proposal is tailored to the agent's role (e.g., architectural design for architects,
   * performance optimization for performance engineers, security analysis for security experts).
   * 
   * @param problem - The software design problem to solve.
   * @param context - Debate context containing history and state.
   * @returns A Proposal object containing the agent's solution and metadata.
   */
  async propose(problem: string, context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const user = this.rolePrompts.proposePrompt(problem);
    return this.proposeImpl(context, system, user);
  }

  /**
   * Critiques a given proposal from the agent's role-specific perspective.
   * 
   * Identifies strengths, weaknesses, improvements, and issues relevant to the agent's
   * area of expertise (architecture, performance, security, etc.).
   * 
   * @param proposal - The proposal to critique.
   * @param context - Debate context.
   * @returns A Critique object containing the agent's review and metadata.
   */
  async critique(proposal: Proposal, context: DebateContext): Promise<Critique> {
    const system = this.resolvedSystemPrompt;
    const user = this.rolePrompts.critiquePrompt(proposal.content);
    return this.critiqueImpl(proposal, context, system, user);
  }

  /**
   * Refines the original proposal by addressing critiques and incorporating suggestions.
   * 
   * Strengthens the solution based on feedback from other agents while maintaining
   * the agent's role-specific focus and expertise.
   * 
   * @param original - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - Debate context.
   * @returns A new Proposal object with the refined solution and metadata.
   */
  async refine(original: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal> {
    const system = this.resolvedSystemPrompt;
    const critiquesText = critiques.map((c, i) => `Critique ${i + 1}:\n${c.content}`).join('\n\n');
    const user = this.rolePrompts.refinePrompt(original.content, critiquesText);
    return this.refineImpl(original, critiques, context, system, user);
  }
}

