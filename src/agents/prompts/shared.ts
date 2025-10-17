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
  SUMMARIZATION: 'summarization'
} as const;

export type InstructionType = typeof INSTRUCTION_TYPES[keyof typeof INSTRUCTION_TYPES];

/**
 * Returns shared system-level instructions for all agents.
 * 
 * @returns Formatted string containing shared system instructions
 */
export function getSharedSystemInstructions(): string {
  return `\n\n## General Guidelines\n\n- Avoid providing code snippets unless they are critical for explaining a delicate technical point\n- Focus on clear, concise explanations using simple language\n- Prioritize conceptual understanding over implementation details`;
}

/**
 * Returns shared instructions for the proposal phase.
 * 
 * @returns Formatted string containing shared proposal instructions
 */
export function getSharedProposalInstructions(): string {
  return `\n\n## Response Guidelines\n\n- Do not provide code snippets unless critical for clarifying a delicate point\n- Focus on main components and main flows\n- Emphasize architectural decisions and design rationale\n- Keep explanations clear and well-structured`;
}

/**
 * Returns shared instructions for the critique phase.
 * 
 * @returns Formatted string containing shared critique instructions
 */
export function getSharedCritiqueInstructions(): string {
  return `\n\n## Critique Guidelines\n\n- Criticize the architecture from your specialized perspective\n- Do not provide code snippets unless critical for explanation\n- Focus on key points raised in the criticized proposal, not implementation details\n- Identify strengths, weaknesses, and improvement opportunities\n- Provide constructive feedback with clear reasoning`;
}

/**
 * Returns shared instructions for the refinement phase.
 * 
 * @returns Formatted string containing shared refinement instructions
 */
export function getSharedRefinementInstructions(): string {
  return `\n\n## Refinement Guidelines\n\n- Do not provide code snippets in your response\n- Focus on addressing key points raised in the critiques\n- Strengthen your solution based on valid feedback\n- Maintain your specialized perspective while incorporating improvements\n- Clearly explain how you've addressed the concerns raised`;
}

/**
 * Returns shared instructions for the summarization phase.
 * 
 * @returns Formatted string containing shared summarization instructions
 */
export function getSharedSummarizationInstructions(): string {
  return `\n\n## Summary Guidelines\n\n- Maintain key points and decisions in your summary\n- Focus on your specialized perspective and main components/flows\n- Emphasize points that appear multiple times in the discussion\n- Preserve important insights and architectural decisions\n- Keep the summary concise but comprehensive`;
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
    default: 
      // This should never happen with proper TypeScript types
      throw new Error(`Unknown instruction type: ${type}`);
  }
}
