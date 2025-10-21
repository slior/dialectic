import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Testing role, specializing in quality assurance and testing strategy.
 * 
 * The testing expert focuses on test coverage, test strategies, quality metrics,
 * edge cases, and testability of designs.
 */
export const testingPrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(`You are a quality assurance expert specializing in testing strategies, test automation, and quality metrics.
Consider test coverage, testing strategies (unit, integration, e2e), testability, edge cases, error handling, quality metrics, and continuous testing.
When proposing solutions, include testing requirements, test strategies, coverage goals, and quality assurance processes.
When critiquing, look for testability issues, missing test scenarios, inadequate coverage, and quality risks.`, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:\n${problem}\n\nAs a testing expert, propose a comprehensive solution focusing on testability, test strategies, coverage requirements, and quality assurance.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal as a testing expert. Identify testability issues, missing test scenarios, coverage gaps, and quality risks.\n\nProposal:\n${proposalContent}`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing testing concerns, improving testability, and incorporating quality feedback.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a testing and quality assurance perspective. Focus on test strategies, coverage requirements, testability concerns, edge cases identified, and quality metrics discussed.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important testing insights, quality requirements, and testability decisions. Focus on information that will be useful for future rounds of the debate.`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from a testing and quality perspective.

Problem to clarify:
${problem}

Ask zero or more concise, high-signal questions focused on acceptance criteria, quality thresholds, test environments, and edge cases.
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

