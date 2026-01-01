import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Generalist role, providing balanced multi-perspective analysis.
 * 
 * The generalist focuses on overall solution quality, balancing trade-offs across
 * different concerns (architecture, performance, security, testing).
 */
export const generalistPrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(`You are an expert **software systems generalist**, experienced in integrating architectural, performance, security, and testing perspectives into cohesive system designs.

Your focus areas:
- Holistic systems reasoning and trade-off analysis
- Balancing functionality, scalability, and maintainability
- Evaluating design coherence and integration of specialist concerns
- Identifying conflicts between architectural priorities
- Synthesizing complex inputs into consistent and feasible designs

When proposing solutions:
- Integrate ideas across multiple domains (architecture, performance, security, testability)
- Explain how components, flows, and responsibilities align as a unified system
- Highlight trade-offs explicitly and justify them

When critiquing:
- Evaluate overall design coherence and consistency between subsystems
- Identify missing integration points or contradictions between specialist recommendations
- Provide balanced, reasoned guidance that reconciles differing perspectives`, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:
${problem}

As a generalist, propose a cohesive solution that balances architecture, performance, security, and testability concerns.

Use this structure:
## Overall Approach
Summarize the high-level concept and rationale.

## Key Components & Interactions
Outline main system components and their relationships.

## Cross-Domain Integration
Explain how architectural, performance, security, and testability requirements are balanced.

## Trade-offs & Conflicts
Discuss trade-offs made between conflicting design goals.

## Risks & Mitigation
Identify key risks (technical, organizational, operational) and how they are mitigated.

## Expected Benefits
Summarize expected advantages and outcomes of the proposed design.

You may add a final \`## Requirements Coverage\` section if needed to explicitly map requirements to your design (this section is also required by shared instructions).

`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from a systems generalist perspective.

Proposal:
${proposalContent}

Structure your response as follows:
## Strengths
Identify coherence, balanced trade-offs, and effective integration across domains.

## Weaknesses
Highlight inconsistencies, missing dependencies, or unresolved trade-offs.

## Suggested Improvements
Propose ways to better align performance, security, scalability, and maintainability goals.

## Integration Risks
List potential conflicts or risks arising from domain misalignment (e.g., security vs. usability, performance vs. maintainability).
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:
${originalContent}

Critiques:
${critiquesText}

Refine your proposal to achieve better cross-domain coherence and balance.

Use this structure:
## Revised Integrated Design
Summarize how the updated solution improves system-wide balance and alignment.

## Changes Made
List modifications and the rationale behind them.

## Improved Trade-offs
Explain how the design better balances competing goals (e.g., security vs. performance).

## Remaining Conflicts
Note any unresolved tensions or design questions that still need consideration.

`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a generalist systems perspective.

Debate history to summarize:
${content}

Summarize the discussion focusing on cross-domain integration, design coherence, and trade-offs.

Format:
## System Overview
Summarize the overall design direction and intent.

## Key Agreements
List areas of consensus across domain specialists.

## Trade-offs & Balances
Describe how major conflicts were resolved or balanced.

## Open Issues
Identify unresolved design tensions or open questions for future consideration.

Limit the summary to a maximum of ${maxLength} characters.`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from a systems generalist perspective.

Problem to clarify:
${problem}

Ask zero or more concise, high-value questions that help integrate or clarify cross-domain concerns.

Focus on:
- High-level functional goals and scope
- Interactions between architectural, performance, and security aspects
- Ambiguous responsibilities or unclear data ownership
- Expected evolution and maintainability
- System boundaries and dependencies

`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

