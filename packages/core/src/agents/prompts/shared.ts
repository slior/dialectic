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
 * Title of the agent-authored section that maps major requirements to proposal content.
 *
 * Agents are instructed to include a section with this title in their proposal output.
 * CLI tooling may use this as a best-effort anchor when extracting requirement traceability.
 */
export const REQUIREMENTS_COVERAGE_SECTION_TITLE = 'Requirements Coverage' as const;

/**
 * Returns shared system-level instructions for all agents.
 * 
 * @returns Formatted string containing shared system instructions
 */
export function getSharedSystemInstructions(): string {
  return `## General Guidelines

- Avoid code snippets unless essential to illustrate a complex technical point
- Prioritize conceptual clarity over implementation details
- Use clear, direct, and simple language
- Be concise but complete — cover reasoning without unnecessary exposition

## Requirements-First Approach

Your primary objective is to ensure all **major requirements** inferred from the problem statement (and any clarifications) are explicitly covered and fulfilled. Clarifications provided during the debate are authoritative and must be incorporated into your analysis.

- **Major requirements** are those expressed with strong language: "must", "shall", "required", "needs to", "critical", "essential"
- **Minor requirements** are preferences or nice-to-haves: "should", "preferably", "ideally", "if possible"
- Always distinguish between major and minor requirements in your analysis
`
}

/**
 * Returns shared instructions for the proposal phase.
 * 
 * @returns Formatted string containing shared proposal instructions
 */
export function getSharedProposalInstructions(): string {
  return `\n\n## Response Guidelines

- Avoid code unless critical for explaining a subtle technical aspect
- Focus on main components, data flows, and key decisions
- Clearly justify architectural choices and trade-offs
- Organize content under clear section headers (Overview, Components, Flow, Trade-offs)
- Keep explanations structured and readable

## ${REQUIREMENTS_COVERAGE_SECTION_TITLE} (Required Section)

You MUST include a **Requirements Coverage** section at the end of your proposal that:
1. **Lists major requirements** inferred from the problem statement (and clarifications if provided)
2. **Maps each major requirement** to specific components, mechanisms, or design decisions in your proposal that fulfill it
3. **Lists assumptions** you made about requirements that were ambiguous or unspecified
4. **Explicitly confirms** that all major requirements are addressed, or identifies any that cannot be fulfilled with the given constraints

This section ensures traceability between requirements and your proposed solution.
`
}

/**
 * Returns shared instructions for the critique phase.
 * 
 * @returns Formatted string containing shared critique instructions
 */
export function getSharedCritiqueInstructions(): string {
  return `\n\n## Critique Guidelines

- Critique from your specialized perspective
- Avoid code unless absolutely necessary for clarification
- Focus on key architectural reasoning, not implementation details
- Identify strengths, weaknesses, and improvement opportunities
- Provide actionable, evidence-based feedback with clear reasoning

## Requirements Check (Required First Step)

Before providing your critique, you MUST:
1. **Review the proposal's Requirements Coverage section** (if present) or infer major requirements from the problem statement
2. **Verify that major requirements are addressed** in the proposal
3. **Identify any major requirements that are missing or inadequately covered**

**Critical Rule**: You MUST NOT suggest changes or accept simplifications that would violate or leave unfulfilled any major requirements. If a critique suggests removing or weakening a component that fulfills a major requirement, explicitly reject that suggestion and explain why the requirement must be preserved.
`
}

/**
 * Returns shared instructions for the refinement phase.
 * 
 * @returns Formatted string containing shared refinement instructions
 */
export function getSharedRefinementInstructions(): string {
  return `\n\n## Refinement Guidelines

- Avoid code snippets
- Address key concerns raised in critiques directly
- Strengthen the solution based on valid feedback
- Preserve your specialized focus while improving coherence and clarity
- Explicitly explain how each major concern was resolved

## Requirements Preservation (Critical)

When refining your proposal:
1. **Review each critique** against the major requirements identified in your original proposal
2. **REJECT any critique suggestions** that would violate or leave unfulfilled major requirements, even if they seem appealing from other perspectives (e.g., simplicity, performance)
3. **Explicitly state** which critiques you accepted, which you rejected, and why
4. **Update your Requirements Coverage section** to reflect any changes while ensuring all major requirements remain fulfilled
5. **If a critique reveals a missing major requirement**, acknowledge it and update your proposal to address it

**Remember**: Major requirements are non-negotiable. A simpler solution that fails to meet major requirements is not acceptable.
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
