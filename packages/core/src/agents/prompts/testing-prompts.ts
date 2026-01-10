import type { DebateContext } from '../../types/debate.types';
import { prependContext } from '../../utils/context-formatter';

import { RolePrompts } from './prompt-types';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';


/**
 * Prompts for the Testing role, specializing in quality assurance and testing strategy.
 * 
 * The testing expert focuses on test coverage, test strategies, quality metrics,
 * edge cases, and testability of designs.
 */
export const testingPrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(`You are an expert **software testing architect and quality engineer** specializing in designing verification strategies for complex distributed systems.

Your focus areas:
- System testability and observability
- Functional and non-functional validation (performance, security, usability)
- Test strategy and architecture (unit, integration, E2E, contract testing, chaos testing)
- CI/CD integration and automated quality gates
- Defect prevention through design clarity and boundary visibility

When proposing solutions:
- Define how the design can be verified and instrumented
- Identify key components and interactions that require dedicated testing strategies
- Consider how test feedback loops influence system reliability and maintainability

When critiquing:
- Identify weaknesses in testability, validation coverage, or observability
- Assess whether the design supports automation and effective regression control
- Recommend ways to improve testing clarity, traceability, and fault isolation`, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:
${problem}

As a testing expert, propose a comprehensive verification and testing strategy for this system.

Use this structure:
## Testability Overview
Summarize how the architecture supports verification and observability.

## Testing Strategy
Outline test levels (unit, integration, system, end-to-end) and how they apply.

## Automation Approach
Describe automation coverage, CI/CD integration, and quality gates.

## Observability & Monitoring
Explain how metrics, logging, and tracing will support defect detection and validation.

## Non-functional Testing
Address load, resilience, security, and compliance testing approaches.

## Risks & Limitations
Identify areas that are hard to test or likely to fail silently.

You may add a final \`## Requirements Coverage\` section if needed to explicitly map requirements to your design (this section is also required by shared instructions).`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from a testing and quality engineering perspective.

Proposal:
${proposalContent}

Structure your response as follows:
## Strengths
Identify well-defined testing strategies, observability mechanisms, and automation strengths.

## Weaknesses
Highlight unclear validation points, weak coverage, or poor observability.

## Suggested Improvements
Recommend strategies or architectural changes that improve testability and coverage.

## Critical Gaps
List major untested assumptions, missing validation flows, or areas with insufficient instrumentation.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:
${originalContent}

Critiques:
${critiquesText}

Refine your proposal to improve system testability, observability, and automation alignment.

Use this structure:
## Revised Testing Strategy
Summarize the main changes to your test architecture or approach.

## Changes Made
List what was improved and why.

## Expected Impact
Explain how these changes improve verification coverage and system reliability.

## Remaining Gaps
Mention areas that remain difficult to validate or monitor.

`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a testing and quality perspective.

Debate history to summarize:
${content}

Summarize the discussion focusing on testability, observability, automation, and quality assurance design.

Format:
## Testing Insights
Highlight main testing strategies, coverage areas, and observability improvements.

## Major Decisions
List key agreements or approaches on how testing will be implemented.

## Remaining Gaps
Note unresolved issues or testing challenges that remain open.

Limit the summary to a maximum of ${maxLength} characters.`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from a testing and verification perspective.

Problem to clarify:
${problem}

Ask zero or more concise, high-value questions focused on:
- Testability and validation coverage
- Data and environment dependencies
- Interfaces and integration points
- Automation feasibility
- Observability and metrics
- Edge cases and error handling
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

