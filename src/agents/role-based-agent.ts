import { Agent } from '../core/agent';
import { AgentConfig, Proposal, Critique, PromptSource, AgentRole } from '../types/agent.types';
import { DebateContext, DebateSummary, ContextPreparationResult, CONTRIBUTION_TYPES } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';
import { getPromptsForRole, RolePrompts } from './prompts';
import { ContextSummarizer, LengthBasedSummarizer } from '../utils/context-summarizer';
import { writeStderr } from '../cli/index';
import type { SummarizationConfig } from '../types/config.types';


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
 * - Manages context summarization to handle large debate histories
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
  
  // Summarization-related fields
  private readonly summarizer?: ContextSummarizer;
  private readonly summaryConfig: SummarizationConfig;
  public readonly summaryPromptSource?: PromptSource;

  /**
   * Private constructor to prevent direct instantiation and extension.
   * Use the static `create` method instead.
   * 
   * @param config - Agent configuration, including role and model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @param summaryConfig - Summarization configuration for this agent.
   * @param summaryPromptSource - Optional provenance metadata for summary prompt.
   */
  private constructor(  config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string,
                        promptSource: PromptSource | undefined, summaryConfig: SummarizationConfig,
                        summaryPromptSource?: PromptSource )
  {
    super(config, provider);
    this.resolvedSystemPrompt = resolvedSystemPrompt;
    this.rolePrompts = getPromptsForRole(config.role);
    this.summaryConfig = summaryConfig;
    
    if (promptSource !== undefined) {
      this.promptSource = promptSource;
    }

    if (summaryPromptSource !== undefined) {
      this.summaryPromptSource = summaryPromptSource;
    }
    
    // Initialize summarizer if summarization is enabled
    if (summaryConfig.enabled) {
      this.summarizer = new LengthBasedSummarizer(provider);
    }
  }

  /**
   * Factory method to create a new RoleBasedAgent instance.
   * 
   * @param config - Agent configuration, including role and model.
   * @param provider - LLMProvider instance for LLM interactions.
   * @param resolvedSystemPrompt - The final system prompt text this agent will use.
   * @param promptSource - Optional provenance metadata for verbose/persistence.
   * @param summaryConfig - Summarization configuration for this agent.
   * @param summaryPromptSource - Optional provenance metadata for summary prompt.
   * @returns A new RoleBasedAgent instance configured for the specified role.
   */
  static create(  config: AgentConfig, provider: LLMProvider, resolvedSystemPrompt: string,
                  promptSource: PromptSource | undefined, summaryConfig: SummarizationConfig,
                  summaryPromptSource?: PromptSource ): RoleBasedAgent
  {
    return new RoleBasedAgent(  config, provider, resolvedSystemPrompt,
                                promptSource, summaryConfig, summaryPromptSource );
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
   * Returns the default summary prompt for a given role.
   * 
   * This method allows callers to retrieve the built-in summary prompt for any role
   * without instantiating an agent. Used during prompt resolution to provide fallback
   * prompts when custom summary prompt files are not available.
   * 
   * @param role - The agent role to get the default summary prompt for.
   * @param content - The content to summarize.
   * @param maxLength - Maximum length for the summary.
   * @returns The default summary prompt text for the specified role.
   */
  static defaultSummaryPrompt(role: AgentRole, content: string, maxLength: number): string {
    const prompts = getPromptsForRole(role);
    return prompts.summarizePrompt(content, maxLength);
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
    const user = this.rolePrompts.proposePrompt(problem, context, this.config.id, context.includeFullHistory);
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
    const user = this.rolePrompts.critiquePrompt(proposal.content, context, this.config.id, context.includeFullHistory);
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
    const user = this.rolePrompts.refinePrompt(original.content, critiquesText, context, this.config.id, context.includeFullHistory);
    return this.refineImpl(original, critiques, context, system, user);
  }

  
  /**
   * Iterates over all contributions in the debate history that are relevant to the agent
   * (i.e., the agent's own proposals and refinements),
   * applies a callback to each, and reduces the results.
   *
   * The notion of relevance includes:
   *   - Proposals and refinements made by this agent
   *
   * @template T The type accumulated and returned by the reduction.
   * @param context DebateContext containing the full history of rounds and contributions.
   * @param callback Function to apply to each relevant contribution. Takes (contribution, roundNumber) and returns T.
   * @param initialValue The initial value passed to the reducer.
   * @param reducer Function combining accumulator and current callback result into new accumulator value.
   * @returns The final reduction value from processing all relevant contributions.
   */
  private processRelevantContributions<T>(
    context: DebateContext,
    callback: (contribution: any, roundNumber: number) => T,
    initialValue: T,
    reducer: (accumulator: T, current: T) => T
  ): T {
    if (!context.history || context.history.length === 0) {
      return initialValue;
    }

    const agentId = this.config.id;
    let result = initialValue;

    for (const round of context.history) {
      for (const contribution of round.contributions) {
        // Include agent's own proposals and refinements
        if (
          contribution.agentId === agentId &&
          (contribution.type === CONTRIBUTION_TYPES.PROPOSAL ||
            contribution.type === CONTRIBUTION_TYPES.REFINEMENT)
        ) {
          result = reducer(result, callback(contribution, round.roundNumber));
        }
        // // Include critiques received by this agent
        // if (
        //   contribution.type === CONTRIBUTION_TYPES.CRITIQUE &&
        //   contribution.targetAgentId === agentId
        // ) {
        //   result = reducer(result, callback(contribution, round.roundNumber));
        // }
      }
    }

    return result;
  }

  /**
   * Determines if context summarization should occur based on configuration and history size.
   * 
   * Summarization is triggered when:
   * 1. Summarization is enabled in configuration
   * 2. Debate history exists
   * 3. Character count of agent's relevant history exceeds threshold
   * 
   * The character count includes:
   * - Agent's own proposals
   * - Critiques received by this agent
   * - Agent's own refinements
   * 
   * @param context - The debate context to evaluate.
   * @returns True if summarization should occur, false otherwise.
   */
  shouldSummarize(context: DebateContext): boolean {
    // Check if summarization is enabled
    if (!this.summaryConfig.enabled) {
      return false;
    }

    // Check if history exists
    if (!context.history || context.history.length === 0) {
      return false;
    }

    // Calculate character count of agent's relevant history
    const totalChars = this.processRelevantContributions( context, 
                                                          (contribution) => contribution.content.length, 
                                                          0, (sum, length) => sum + length
    );

    // Return true if total exceeds threshold
    return totalChars >= this.summaryConfig.threshold;
  }

  /**
   * Prepares the debate context, potentially summarizing it if needed.
   * 
   * This method evaluates whether summarization is necessary using `shouldSummarize()`.
   * If summarization is not needed, returns the original context unchanged.
   * If summarization is needed, generates a concise summary from the agent's perspective
   * and returns a new context with the summary field populated.
   * 
   * On summarization errors, falls back to the original context with a warning.
   * 
   * @param context - The current debate context.
   * @param roundNumber - The current round number (1-indexed).
   * @returns The context preparation result.
   */
  async prepareContext(context: DebateContext, _roundNumber: number): Promise<ContextPreparationResult>
  {
    // Check if summarization is needed
    if (!this.shouldSummarize(context)) {
      return { context };
    }

    // Summarization is needed - filter history to agent's perspective
    try {
      if (!context.history) {
        return { context };
      }

      // Collect relevant contributions using the helper function
      const relevantContributions = this.processRelevantContributions(
        context,
        (contribution, roundNumber) => {
          if (contribution.type === CONTRIBUTION_TYPES.CRITIQUE) {
            return [`Round ${roundNumber} - Critique from ${contribution.agentRole}:\n${contribution.content}`];
          } else {
            return [`Round ${roundNumber} - ${contribution.type}:\n${contribution.content}`];
          }
        },
        [] as string[],
        (acc, contribution) => [...acc, ...contribution]
      );

      // Convert filtered history to text
      const contentToSummarize = relevantContributions.join('\n\n---\n\n');

      // Call summarizer
      if (!this.summarizer) {
        // Summarization is enabled but no summarizer (shouldn't happen, but handle gracefully)
        // This is an internal error that should be logged to stderr
        writeStderr(`Warning: Agent ${this.config.name}: Summarization enabled but no summarizer available. Using full history.\n`);
        return { context };
      }

      // Construct the summary prompt with the content
      const summaryPrompt = this.rolePrompts.summarizePrompt(contentToSummarize, this.summaryConfig.maxLength);

      const result = await this.summarizer.summarize(
        contentToSummarize,
        this.config.role,
        this.summaryConfig,
        this.resolvedSystemPrompt,
        summaryPrompt
      );

      // Build DebateSummary object
      const summary: DebateSummary = {
        agentId: this.config.id,
        agentRole: this.config.role,
        summary: result.summary,
        metadata: result.metadata,
      };

      // Return original context and summary for persistence
      // Summary will be looked up from rounds when formatting prompts
      return { context, summary };
    } catch (error: any) {
      // Log error to stderr and fallback to full history
      writeStderr(
        `Warning: Agent ${this.config.name}: Summarization failed with error: ${error.message}. Falling back to full history.\n`
      );
      return { context };
    }
  }
}

