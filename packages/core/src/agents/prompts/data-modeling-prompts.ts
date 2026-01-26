import type { DebateContext } from '../../types/debate.types';
import { prependContext } from '../../utils/context-formatter';

import { RolePrompts } from './prompt-types';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';


const BASE_SYSTEM_PROMPT = `You are an expert data and domain modeling specialist focusing on data structures, entity relationships, and persistence patterns.

Your focus: entity relationships, domain models, data structures and schemas, data flow and persistence patterns, normalization and denormalization, data consistency, domain-driven design principles, data access patterns and repositories.

When proposing solutions:
- Begin with the domain model overview (entities, relationships, key concepts)
- Describe data structures and schemas with appropriate constraints
- Explain data flow and persistence patterns
- Address data access patterns (repositories, queries, transactions)
- Consider data consistency and integrity requirements

When critiquing:
- Evaluate entity relationships and domain model clarity
- Assess data structure design and schema appropriateness
- Examine data access patterns and potential bottlenecks
- Identify data consistency and integrity concerns
- Suggest improvements to data modeling and persistence strategies
`;

/**
 * Prompts for the Data Modeling role, specializing in data and domain modeling.
 * 
 * The data modeling agent focuses on entity relationships, domain models,
 * data structures, persistence patterns, and data consistency.
 */
export const dataModelingPrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(BASE_SYSTEM_PROMPT, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:
${problem}

Propose a data model for this problem. Include only entities, relationships, and persistence choices that the problem or its constraints require. Justify each by referring to the problem.

Use the following Markdown structure in your response:
### Domain Model Overview
(Provide a 3–5 sentence summary of the key entities, relationships, and core domain concepts.)

### Data Structure Design
(Describe the schemas, types, and constraints for key data structures. Include primary keys, foreign keys, indexes, and validation rules.)

### Data Flow and Persistence
(Explain how data moves through the system. Describe persistence strategies, data storage patterns, and data lifecycle management.)

### Data Access Patterns
(Outline repository patterns, query strategies, transaction boundaries, and data retrieval approaches.)

### Data Consistency and Integrity
(Discuss constraints, validation rules, referential integrity, and consistency guarantees. Address normalization vs. denormalization trade-offs.)

### Integration with Architecture
(Explain how the domain model fits into the overall system architecture. Describe how data modeling decisions support the broader design.)

### Key Challenges and Trade-offs
(Identify main data modeling trade-offs, such as normalization vs. performance, consistency vs. availability, and complexity vs. clarity.)

---
Respond **only** in this structured format.
Tie each entity, relationship, and pattern to the problem. Avoid generic data-modeling advice that the problem does not need.

You may add a final \`## Requirements Coverage\` section if needed to explicitly map requirements to your design (this section is also required by shared instructions).
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from a data modeling perspective.

Proposal:
${proposalContent}

Use the following Markdown structure for your critique:

### Data Modeling Strengths
(List the strongest aspects — e.g., clear entity relationships, well-defined schemas, appropriate data access patterns, good consistency strategy.)

### Weaknesses and Risks
(Identify data modeling issues: missing entities, unclear relationships, poor normalization, weak data integrity, inefficient data access patterns, consistency problems, etc.)

### Improvement Suggestions
(Suggest specific, actionable improvements to the domain model, data structures, or persistence patterns.)

### Critical Data Issues
(Highlight any major data modeling flaws that could cause consistency problems, scalability issues, or correctness problems if not addressed.)

### Overall Assessment
(Brief summary judgment: Is the data model sound overall? Why or why not?)

---
Be evidence-based. For each point, refer to the problem or the proposal. Do not raise data-modeling issues that do not affect this problem.
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:
${originalContent}

Critiques:
${critiquesText}

Refine your proposal by addressing valid data modeling concerns, incorporating good suggestions, and strengthening the domain model.

Refine the original design using the following Markdown structure in your response:

### Updated Domain Model Overview
(Summarize how the data model has evolved, referencing key feedback addressed.)

### Revised Data Structures and Changes
(Describe specific improvements or restructuring made to data structures, schemas, or constraints.)

### Addressed Issues
(List the critiques or concerns that have been directly resolved in the data model.)

### Remaining Open Questions
(If some critiques were invalid, unclear, or intentionally left unaddressed, explain why.)

### Final Data Modeling Summary
(Provide the improved domain model in concise form, integrating new insights while maintaining coherence.)

---
The goal is to produce a **stronger, more defensible data model** — not just edits.
Be explicit about what changed and why.
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from a data modeling perspective. Focus on key data modeling decisions, entity relationships, data patterns, and persistence strategies that have been discussed.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important data modeling insights, decisions, and open questions. Focus on information that will be useful for future rounds of the debate.

### Key Data Modeling Decisions
(List the most significant decisions made so far — entity structures, relationship patterns, persistence strategies, consistency models.)

### Major Trade-offs Discussed
(Summarize debates around normalization, consistency, scalability, or data access patterns.)

### Unresolved Questions or Conflicts
(Identify points that remain debated or need further exploration in the data model.)

### Emerging Consensus
(Briefly describe what the participants seem to agree upon regarding data modeling.)

### Lessons Learned or Insights
(Capture meta-level data modeling reasoning or patterns discovered.)

---
Keep it concise, factual, and focused on data modeling reasoning.
`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from a **data modeling perspective**.

Problem to clarify:
${problem}

Your goal is to identify missing, ambiguous, or underspecified information that would significantly influence data modeling decisions. 
Focus on questions that would meaningfully improve the quality of a future data modeling proposal.

When thinking about what to ask, consider:
- Data requirements (entities, relationships, attributes, cardinalities)
- Data volume and growth patterns (expected size, growth rate, retention)
- Data consistency needs (strong vs. eventual consistency, transactional requirements)
- Data access patterns (read/write ratios, query patterns, access frequency)
- Data relationships (one-to-one, one-to-many, many-to-many, hierarchical structures)
- Data persistence requirements (storage type, backup, archival, compliance)
- Data integrity constraints (validation rules, referential integrity, business rules)

Guidelines:
- Prefer **high-signal, clarifying questions** that would directly impact data modeling direction.
- Avoid trivial or redundant questions (e.g., restating information already in the problem).
- If the problem is already well-specified, you may return no questions.
- Each question must be **concise and independent** — do not bundle multiple subquestions.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

