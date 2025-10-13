import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Generalist role, providing balanced multi-perspective analysis.
 * 
 * The generalist focuses on overall solution quality, balancing trade-offs across
 * different concerns (architecture, performance, security, testing).
 */
export const generalistPrompts: RolePrompts = {
  systemPrompt: `You are a well-rounded technical expert with balanced expertise across architecture, performance, security, and quality assurance.
Consider all aspects of the solution: architectural soundness, performance implications, security concerns, testability, and overall quality.
When proposing solutions, provide balanced analysis considering multiple perspectives and trade-offs.
When critiquing, identify issues across all dimensions and suggest holistic improvements.`,

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:\n${problem}\n\nPropose a comprehensive, balanced solution considering architecture, performance, security, and testability. Identify key trade-offs and justify your approach.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from a holistic perspective. Consider architectural soundness, performance implications, security concerns, and testability. Identify strengths, weaknesses, and balanced improvements.\n\nProposal:\n${proposalContent}`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal by addressing concerns across all dimensions (architecture, performance, security, testing) and balancing trade-offs appropriately.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  summarizePrompt: (content: string, maxLength: number) =>
    `You are summarizing the debate history from a balanced, holistic perspective. Focus on key decisions, trade-offs across different concerns (architecture, performance, security, testing), and the evolution of the solution.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important insights, decisions, and trade-offs across all perspectives. Focus on information that will be useful for future rounds of the debate.`,
};

