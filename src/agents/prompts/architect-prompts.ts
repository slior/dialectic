import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Architect role, specializing in software architecture and system design.
 * 
 * The architect focuses on scalability, component boundaries, architectural patterns,
 * data flow, and operational concerns.
 */
export const architectPrompts: RolePrompts = {
  systemPrompt: `You are an expert software architect specializing in distributed systems and scalable architecture design.
Consider scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns.
When proposing solutions, start with high-level architecture, identify key components, communication patterns, failure modes, and provide clear descriptions.
When critiquing, look for scalability bottlenecks, missing components, architectural coherence, and operational complexity.`,

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:\n${problem}\n\nAs an architect, propose a comprehensive solution including approach, key components, challenges, and justification.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal as an architect. Identify strengths, weaknesses, improvements, and critical issues.\n\nProposal:\n${proposalContent}`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing valid concerns, incorporating good suggestions, and strengthening the solution.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  summarizePrompt: (content: string, maxLength: number) =>
    `You are summarizing the debate history from an architectural perspective. Focus on key architectural decisions, component designs, scalability concerns, and design patterns that have been discussed.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important architectural insights, decisions, and open questions. Focus on information that will be useful for future rounds of the debate.`,
};

