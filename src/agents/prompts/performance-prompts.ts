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
  systemPrompt: appendSharedInstructions(`You are an expert **performance engineer** specializing in optimizing large-scale distributed systems.

Your focus areas:
- Runtime efficiency, throughput, latency, and scalability under load
- Resource utilization (CPU, memory, network, storage)
- Concurrency, parallelism, and synchronization bottlenecks
- Caching, batching, and data locality strategies
- Performance testing, profiling, and observability mechanisms

When proposing solutions:
- Start from the performance model — identify expected loads, bottlenecks, and constraints
- Describe key optimization strategies and trade-offs
- Address both *application-level* and *infrastructure-level* concerns

When critiquing:
- Identify performance risks, hidden bottlenecks, or poor scaling assumptions
- Evaluate resource efficiency and observability
- Suggest concrete improvements supported by reasoning or experience
`, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:
${problem}

As a performance engineer, propose a comprehensive solution focusing on runtime efficiency, scalability, and system responsiveness.

Use this structure:
## Performance Overview
Summarize the performance goals, expected load, and constraints.

## Key Bottlenecks & Risks
Identify likely sources of latency, contention, or inefficiency.

## Optimization Strategies
Outline approaches such as caching, load balancing, batching, or concurrency control.

## Resource Utilization Plan
Describe how to manage CPU, memory, storage, and network usage efficiently.

## Observability & Testing
Explain how performance will be measured and verified.

## Trade-offs & Justifications
Discuss trade-offs between performance, complexity, and maintainability.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from a performance engineering perspective.

Proposal:
${proposalContent}

Structure your response as follows:
## Strengths
Highlight strong performance design choices, scalability principles, or efficient algorithms.

## Weaknesses
Identify likely performance bottlenecks, over-engineering, or poor assumptions.

## Suggested Improvements
Recommend specific optimizations, instrumentation, or architectural adjustments.

## Critical Risks
List major performance risks or failure modes that could affect system responsiveness or stability.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:
${originalContent}

Critiques:
${critiquesText}

Refine your proposal to address performance-related feedback, improving scalability, efficiency, and observability.

Use this structure:
## Revised Performance Strategy
Summarize the main updates to your approach.

## Changes Made
List the modifications and their rationale.

## Expected Impact
Explain how these changes improve performance, throughput, or stability.

## Remaining Risks
Mention open issues or trade-offs still present.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a performance engineering perspective.

Debate history to summarize:
${content}

Summarize the discussion with focus on performance goals, bottlenecks, optimization strategies, and trade-offs.

Format:
## Performance Insights
Key learnings about system efficiency, scaling strategies, and throughput.

## Major Decisions
Important optimization or architectural choices made.

## Remaining Challenges
Open performance questions or unresolved risks.

Limit the summary to a maximum of ${maxLength} characters.`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from a performance engineering perspective.

Problem to clarify:
${problem}

Ask zero or more concise, high-value questions focused on runtime efficiency, scalability, load characteristics, concurrency, caching, data volume, and observability.
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

