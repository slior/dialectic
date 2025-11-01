/**
 * Shared prompt instructions for all agent roles.
 * 
 * This module provides consistent, well-formatted instructions that are appended
 * to role-specific prompts to ensure uniform behavior across all agents.
 */

// Instruction type constants to avoid magic strings
export const INSTRUCTION_TYPES = {
  SYSTEM: 'system',
  PROPOSAL: 'proposal', 
  CRITIQUE: 'critique',
  REFINEMENT: 'refinement',
  SUMMARIZATION: 'summarization',
  CLARIFICATION: 'clarification'
} as const;

export type InstructionType = typeof INSTRUCTION_TYPES[keyof typeof INSTRUCTION_TYPES];

/**
 * Returns shared system-level instructions for all agents.
 * 
 * @returns Formatted string containing shared system instructions
 */
export function getSharedSystemInstructions(): string {
  // return `\n\n## General Guidelines\n\n- Avoid providing code snippets unless they are critical for explaining a delicate technical point\n- Focus on clear, concise explanations using simple language\n- Prioritize conceptual understanding over implementation details`;
  return `## General Guidelines

- Avoid code snippets unless essential to illustrate a complex technical point
- Prioritize conceptual clarity over implementation details
- Use clear, direct, and simple language
- Be concise but complete — cover reasoning without unnecessary exposition
`
}

/**
 * Returns shared instructions for the proposal phase.
 * 
 * @returns Formatted string containing shared proposal instructions
 */
export function getSharedProposalInstructions(): string {
  // return `\n\n## Response Guidelines\n\n- Do not provide code snippets unless critical for clarifying a delicate point\n- Focus on main components and main flows\n- Emphasize architectural decisions and design rationale\n- Keep explanations clear and well-structured`;
  return `\n\n## Response Guidelines

- Avoid code unless critical for explaining a subtle technical aspect
- Focus on main components, data flows, and key decisions
- Clearly justify architectural choices and trade-offs
- Organize content under clear section headers (Overview, Components, Flow, Trade-offs)
- Keep explanations structured and readable
`
}

/**
 * Returns shared instructions for the critique phase.
 * 
 * @returns Formatted string containing shared critique instructions
 */
export function getSharedCritiqueInstructions(): string {
  // return `\n\n## Critique Guidelines\n\n- Criticize the architecture from your specialized perspective\n- Do not provide code snippets unless critical for explanation\n- Focus on key points raised in the criticized proposal, not implementation details\n- Identify strengths, weaknesses, and improvement opportunities\n- Provide constructive feedback with clear reasoning`;
  return `\n\n## Critique Guidelines

- Critique from your specialized perspective
- Avoid code unless absolutely necessary for clarification
- Focus on key architectural reasoning, not implementation details
- Identify strengths, weaknesses, and improvement opportunities
- Provide actionable, evidence-based feedback with clear reasoning
`
}

/**
 * Returns shared instructions for the refinement phase.
 * 
 * @returns Formatted string containing shared refinement instructions
 */
export function getSharedRefinementInstructions(): string {
  // return `\n\n## Refinement Guidelines\n\n- Do not provide code snippets in your response\n- Focus on addressing key points raised in the critiques\n- Strengthen your solution based on valid feedback\n- Maintain your specialized perspective while incorporating improvements\n- Clearly explain how you've addressed the concerns raised`;
  return `\n\n## Refinement Guidelines

- Avoid code snippets
- Address key concerns raised in critiques directly
- Strengthen the solution based on valid feedback
- Preserve your specialized focus while improving coherence and clarity
- Explicitly explain how each major concern was resolved
`
}

/**
 * Returns shared instructions for the summarization phase.
 * 
 * @returns Formatted string containing shared summarization instructions
 */
export function getSharedSummarizationInstructions(): string {
  // return `\n\n## Summary Guidelines\n\n- Maintain key points and decisions in your summary\n- Focus on your specialized perspective and main components/flows\n- Emphasize points that appear multiple times in the discussion\n- Preserve important insights and architectural decisions\n- Keep the summary concise but comprehensive`;
  return `\n\n## Summary Guidelines

- Preserve key architectural decisions, rationale, and recurring insights
- Focus on your specialized perspective and major component interactions
- Highlight patterns or trade-offs that appeared multiple times
- Keep summaries concise but include all critical reasoning threads
`
}

/**
 * Returns shared instructions for the clarification phase.
 * Ensures agents return only the expected JSON schema and provides
 * consistent guidance across roles.
 * 
 * @returns Formatted string containing shared clarification instructions
 */
export function getSharedClarificationInstructions(): string {
  return `\n\n## Clarification Guidelines\n\nRespond with ONLY JSON using this exact schema (no prose):\n{"questions":[{"text":"..."}]}\n\nIf none are needed, return {"questions":[]}.\n Prioritize questions that are most likely to improve the overall solution quality`;
}

/**
 * Helper function to append appropriate shared instructions to a prompt.
 * 
 * @param prompt - The base prompt to append instructions to
 * @param instructionType - The type of shared instructions to append
 * @returns The prompt with shared instructions appended
 */
export function appendSharedInstructions(prompt: string, instructionType: InstructionType): string {
  const sharedInstructions = getSharedInstructionsByType(instructionType);
  return prompt + sharedInstructions;
}

/**
 * Internal helper function to get shared instructions by type.
 * 
 * @param type - The instruction type
 * @returns The appropriate shared instructions string
 */
function getSharedInstructionsByType(type: InstructionType): string {
  switch (type) {
    case INSTRUCTION_TYPES.SYSTEM: return getSharedSystemInstructions();
    case INSTRUCTION_TYPES.PROPOSAL: return getSharedProposalInstructions();
    case INSTRUCTION_TYPES.CRITIQUE: return getSharedCritiqueInstructions();
    case INSTRUCTION_TYPES.REFINEMENT: return getSharedRefinementInstructions();
    case INSTRUCTION_TYPES.SUMMARIZATION: return getSharedSummarizationInstructions();
    case INSTRUCTION_TYPES.CLARIFICATION: return getSharedClarificationInstructions();
    default: 
      // This should never happen with proper TypeScript types
      throw new Error(`Unknown instruction type: ${type}`);
  }
}
