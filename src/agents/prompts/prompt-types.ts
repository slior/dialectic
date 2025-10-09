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
   * @returns A formatted prompt instructing the agent to propose a solution.
   */
  proposePrompt: (problem: string) => string;

  /**
   * Generates a user prompt for the critique phase.
   * @param proposalContent - The content of the proposal to critique.
   * @returns A formatted prompt instructing the agent to critique the proposal.
   */
  critiquePrompt: (proposalContent: string) => string;

  /**
   * Generates a user prompt for the refinement phase.
   * @param originalContent - The content of the original proposal.
   * @param critiquesText - The concatenated text of all critiques received.
   * @returns A formatted prompt instructing the agent to refine their proposal.
   */
  refinePrompt: (originalContent: string, critiquesText: string) => string;
}

