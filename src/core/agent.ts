import { AgentConfig, Proposal, Critique, ContributionMetadata } from '../types/agent.types';
import { DebateContext, ContextPreparationResult } from '../types/debate.types';
import { LLMProvider } from '../providers/llm-provider';
import { CompletionResponse, CompletionUsage } from '../providers/llm-provider';



/**
 * Abstract base class representing an AI agent in the multi-agent debate system.
 *
 * Agents are responsible for generating proposals, critiquing other agents' proposals,
 * and refining their own proposals based on received critiques. Each agent is configured
 * with a specific role, LLM model, and provider, and interacts with an LLMProvider to
 * generate its outputs.
 *
 * Additionally, agents manage context summarization to handle large debate histories.
 *
 * Subclasses must implement the core debate methods:
 *  - propose: Generate a solution proposal for a given problem.
 *  - critique: Critique another agent's proposal.
 *  - refine: Refine an original proposal by incorporating critiques.
 *  - shouldSummarize: Determine if context summarization is needed.
 *  - prepareContext: Prepare and potentially summarize the debate context.
 *
 * The base class provides a utility method, callLLM, to standardize LLM interactions,
 * capturing latency and usage metadata.
 *
 * @template Proposal - The type representing a proposal response.
 * @template Critique - The type representing a critique response.
 */
export abstract class Agent {
  /**
   * Constructs an Agent.
   * @param config - The agent's configuration, including model, role, and prompts.
   * @param provider - The LLMProvider instance used for LLM interactions.
   */
  constructor(public config: AgentConfig, protected provider: LLMProvider) {}

  /**
   * Generates a proposal for the given problem.
   * @param problem - The software design problem to solve.
   * @param context - The current debate context, including history and state.
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  abstract propose(problem: string, context: DebateContext): Promise<Proposal>;

  /**
   * Critiques a given proposal from another agent.
   * @param proposal - The proposal to critique.
   * @param context - The current debate context.
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  abstract critique(proposal: Proposal, context: DebateContext): Promise<Critique>;

  /**
   * Refines the agent's original proposal by addressing critiques and incorporating suggestions.
   * @param originalProposal - The original proposal to refine.
   * @param critiques - Array of critiques to address.
   * @param context - The current debate context.
   * @returns A Promise resolving to a new Proposal object with the refined solution and metadata.
   */
  abstract refine(originalProposal: Proposal, critiques: Critique[], context: DebateContext): Promise<Proposal>;

  /**
   * Determines whether the debate context should be summarized based on configured thresholds.
   * 
   * @param context - The current debate context to evaluate.
   * @returns True if summarization should occur, false otherwise.
   */
  abstract shouldSummarize(context: DebateContext): boolean;

  /**
   * Prepares the debate context for the agent, potentially summarizing it if needed.
   * 
   * This method evaluates whether summarization is necessary and, if so, generates
   * a concise summary of the debate history from the agent's perspective.
   * 
   * @param context - The current debate context.
   * @param roundNumber - The current round number (1-indexed).
   * @returns A promise resolving to the context preparation result.
   */
  abstract prepareContext( context: DebateContext, roundNumber: number ): Promise<ContextPreparationResult>;

  /**
   * Template method for generating proposals.
   * Subclasses should call this method from their `propose` implementation after preparing prompts.
   *
   * @final
   * @param _context - The current debate context (unused in base implementation).
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM.
   * @returns A Promise resolving to a Proposal object containing the agent's solution and metadata.
   */
  protected async proposeImpl(

    _context: DebateContext,
    systemPrompt: string,
    userPrompt: string
  ): Promise<Proposal> {
    const { text, usage, latencyMs } = await this.callLLM(systemPrompt, userPrompt);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Template method for generating critiques.
   * Subclasses should call this method from their `critique` implementation after preparing prompts.
   *
   * @final
   * @param _proposal - The proposal to critique.
   * @param _context - The current debate context.
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM.
   * @returns A Promise resolving to a Critique object containing the agent's review and metadata.
   */
  protected async critiqueImpl(
    _proposal: Proposal,
    _context: DebateContext,
    systemPrompt: string,
    userPrompt: string
  ): Promise<Critique> {
    const { text, usage, latencyMs } = await this.callLLM(systemPrompt, userPrompt);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Template method for refining proposals.
   * Subclasses should call this method from their `refine` implementation after preparing prompts.
   *
   * @final
   * @param _originalProposal - The original proposal to refine.
   * @param _critiques - Array of critiques to address.
   * @param _context - The current debate context.
   * @param systemPrompt - The system prompt to use for the LLM.
   * @param userPrompt - The user prompt to use for the LLM.
   * @returns A Promise resolving to a refined Proposal object with updated content and metadata.
   */
  protected async refineImpl(
    _originalProposal: Proposal,
    _critiques: Critique[],
    _context: DebateContext,
    systemPrompt: string,
    userPrompt: string
  ): Promise<Proposal> {
    const { text, usage, latencyMs } = await this.callLLM(systemPrompt, userPrompt);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }

  /**
   * Helper method to call the underlying LLM provider with the specified prompts.
   * Measures latency and returns the generated text, usage statistics, and latency.
   *
   * @param systemPrompt - The system prompt to prime the LLM.
   * @param userPrompt - The user prompt representing the agent's request.
   * @returns A Promise resolving to an AgentLLMResponse containing text, usage metadata, and latency.
   */
  protected async callLLM(systemPrompt: string, userPrompt: string): Promise<AgentLLMResponse> {
    const started = Date.now();
    const res : CompletionResponse = await this.provider.complete({
      model: this.config.model,
      temperature: this.config.temperature,
      systemPrompt,
      userPrompt,
    });
    const latencyMs = Date.now() - started;
    const response: AgentLLMResponse = { text: res.text, latencyMs };
    if (res.usage) response.usage = res.usage;
    return response;
  }
}


/**
 * Represents the response from an LLM call made by an agent.
 *
 * @property text - The main textual output generated by the LLM.
 * @property usage - (Optional) Token usage statistics for the LLM call.
 * @property latencyMs - The time taken (in milliseconds) to complete the LLM call.
 */
export interface AgentLLMResponse {
  text: string;
  usage?: CompletionUsage;
  latencyMs: number;
}