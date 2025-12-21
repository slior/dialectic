import type { DebateContext } from '../../types/debate.types';

/**
 * Interface defining the structure of role-based prompts for agents.
 * 
 * Each role (architect, performance, security) provides implementations of these
 * prompt templates to guide agent behavior during debate phases.
 */
export interface RolePrompts {
  /**
   * The system prompt that primes the agent's behavior and perspective.
   * This defines the agent's expertise, focus areas, and approach to problem-solving.
   */
  systemPrompt: string;

  /**
   * Generates a user prompt for the proposal phase.
   * @param problem - The problem statement to solve.
   * @param context - Optional debate context containing history or summaries.
   * @param agentId - Optional agent ID for looking up agent-specific summary.
   * @param includeFullHistory - Whether to fall back to full history when no summary is found.
   * @returns A formatted prompt instructing the agent to propose a solution.
   */
  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => string;

  /**
   * Generates a user prompt for the critique phase.
   * @param proposalContent - The content of the proposal to critique.
   * @param context - Optional debate context containing history or summaries.
   * @param agentId - Optional agent ID for looking up agent-specific summary.
   * @param includeFullHistory - Whether to fall back to full history when no summary is found.
   * @returns A formatted prompt instructing the agent to critique the proposal.
   */
  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => string;

  /**
   * Generates a user prompt for the refinement phase.
   * @param originalContent - The content of the original proposal.
   * @param critiquesText - The concatenated text of all critiques received.
   * @param context - Optional debate context containing history or summaries.
   * @param agentId - Optional agent ID for looking up agent-specific summary.
   * @param includeFullHistory - Whether to fall back to full history when no summary is found.
   * @returns A formatted prompt instructing the agent to refine their proposal.
   */
  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => string;

  /**
   * Generates a user prompt for context summarization.
   * @param content - The full debate history content to summarize.
   * @param maxLength - Maximum length for the summary in characters.
   * @returns A formatted prompt instructing the agent to summarize the content from their perspective.
   */
  summarizePrompt: (content: string, maxLength: number) => string;

  /**
   * Generates a user prompt for the clarifications phase, asking zero or more
   * structured clarifying questions. The LLM must respond with ONLY JSON in the
   * schema: { "questions": [ { "text": string } ] }.
   *
   * @param problem - The problem statement to clarify.
   * @param context - Optional debate context containing history or summaries.
   * @param agentId - Optional agent ID for summary/history context selection.
   * @param includeFullHistory - Whether to fall back to full history when no summary is found.
   * @returns A formatted prompt instructing the agent to produce structured clarifying questions.
   */
  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => string;
}

