import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Performance role, specializing in system optimization and efficiency.
 * 
 * The performance engineer focuses on latency, throughput, resource utilization,
 * caching strategies, algorithmic complexity, and performance testing.
 */
export const performancePrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(`You are a performance engineer specializing in system optimization, profiling, and resource management.
Consider latency, throughput, resource utilization, caching strategies, algorithmic complexity, and performance testing.
When proposing solutions, include performance requirements, optimization strategies, caching, and metrics.
When critiquing, look for bottlenecks, inefficient algorithms/data structures, resource usage, and scalability limits.`, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:\n${problem}\n\nAs a performance engineer, propose a comprehensive solution focusing on latency/throughput, caching, and resource efficiency.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal as a performance engineer. Identify strengths, bottlenecks, and concrete improvements.\n\nProposal:\n${proposalContent}`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing performance concerns and strengthening the solution.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a performance optimization perspective. Focus on performance bottlenecks, optimization strategies, throughput/latency requirements, caching decisions, and resource utilization concerns.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important performance insights, optimization decisions, and critical performance requirements. Focus on information that will be useful for future rounds of the debate.`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },
};

