import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import { appendSharedInstructions, INSTRUCTION_TYPES } from './shared';
import type { DebateContext } from '../../types/debate.types';


const BASE_SYSTEM_PROMPT = `You are an expert software architect specializing in distributed systems and scalable architecture design.

Your focus: scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns.

When proposing solutions:
- Begin with the high-level architecture and rationale
- Identify main components and their responsibilities
- Describe communication and data flow
- Highlight scalability, reliability, and observability considerations

When critiquing:
- Identify architectural bottlenecks or weaknesses
- Assess clarity of component boundaries and data ownership
- Examine scalability, fault tolerance, and operational complexity
- Suggest concrete, principle-based improvements
`;

/**
 * Prompts for the Architect role, specializing in software architecture and system design.
 * 
 * The architect focuses on scalability, component boundaries, architectural patterns,
 * data flow, and operational concerns.
 */
export const architectPrompts: RolePrompts = {
  systemPrompt: appendSharedInstructions(BASE_SYSTEM_PROMPT, INSTRUCTION_TYPES.SYSTEM),

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:
${problem}

As an architect, propose a comprehensive solution including approach, key components, challenges, and justification.

Use the following Markdown structure in your response:
### Architecture Overview
(Provide a 3–5 sentence summary of the overall architecture, guiding principles, and key design intent.)

### Key Components and Responsibilities
(List major components/services and describe each one’s main role.)

### Data Flow and Interactions
(Describe how data and control flow between components. Mention APIs, events, or message flows if relevant.)

### Architectural Patterns and Rationale
(State which design or architectural patterns are used — e.g., microservices, CQRS, event-driven — and justify why they fit this problem.)

### Non-Functional Considerations
#### Scalability and Performance
(Discuss scaling strategy, bottleneck mitigation, and performance aspects.)
#### Security
(Outline authentication, authorization, and data protection strategies.)
#### Maintainability and Evolvability
(Describe modularity, extensibility, and how the design supports change.)
#### Operational Concerns
(Deployment, monitoring, resilience, observability.)
#### Regulatory/Compliance (if applicable)
(Discuss awareness of relevant compliance concerns, or note "Not applicable.")

### Key Challenges and Trade-offs
(Identify main architectural trade-offs, risks, or limitations.)

### Optional: Technology Choices
(If specific technologies clarify the design intent, list them briefly here.)

---

Respond **only** in this structured format.
Avoid generalities — make concrete architectural claims and reasoning.

You may add a final \`## Requirements Coverage\` section if needed to explicitly map requirements to your design (this section is also required by shared instructions).
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.PROPOSAL);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal from an architectural perspective.

Proposal:
${proposalContent}

Use the following Markdown structure for your critique:

### Architectural Strengths
(List the strongest aspects — e.g., clear component boundaries, good scalability strategy, sound data design.)

### Weaknesses and Risks
(Identify architectural issues: missing components, unclear data ownership, poor fault tolerance, coupling issues, etc.)

### Improvement Suggestions
(Suggest specific, actionable architectural changes or refinements.)

### Critical Issues
(Highlight any major flaws that could cause operational, performance, or correctness problems if not addressed.)

### Overall Assessment
(Brief summary judgment: Is the design sound overall? Why or why not?)

---

Your tone should be professional and evidence-based.  
Avoid vague comments — reason from architectural principles.
`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CRITIQUE);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:
${originalContent}

Critiques:
${critiquesText}

Refine your proposal by addressing valid concerns, incorporating good suggestions, and strengthening the solution.

Refine the original design using the following Markdown structure in your response:

### Updated Architecture Overview
(Summarize how the design has evolved, referencing key feedback addressed.)

### Revised Components and Changes
(Describe specific improvements or restructuring made to components.)

### Addressed Issues
(List the critiques or concerns that have been directly resolved.)

### Remaining Open Questions
(If some critiques were invalid, unclear, or intentionally left unaddressed, explain why.)

### Final Architectural Summary
(Provide the improved architecture in concise form, integrating new insights while maintaining coherence.)

---

The goal is to produce a **stronger, more defensible design** — not just edits.
Be explicit about what changed and why.
`
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.REFINEMENT);
  },

  summarizePrompt: (content: string, maxLength: number) => {
    const basePrompt = `You are summarizing the debate history from an architectural perspective. Focus on key architectural decisions, component designs, scalability concerns, and design patterns that have been discussed.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important architectural insights, decisions, and open questions. Focus on information that will be useful for future rounds of the debate.

### Key Architectural Decisions
(List the most significant decisions made so far — component structure, communication patterns, technology direction.)

### Major Trade-offs Discussed
(Summarize debates around scalability, consistency, or performance vs. complexity.)

### Unresolved Questions or Conflicts
(Identify points that remain debated or need further exploration.)

### Emerging Consensus
(Briefly describe what the participants seem to agree upon.)

### Lessons Learned or Insights
(Capture meta-level architectural reasoning or patterns discovered.)

---

Keep it concise, factual, and focused on architectural reasoning.
`;
    return appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);
  },

  clarifyPrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `You are preparing clarifying questions from an **architectural perspective**.

Problem to clarify:
${problem}

Your goal is to identify missing, ambiguous, or underspecified information that would significantly influence architectural decisions. 
Focus on questions that would meaningfully improve the quality of a future software architecture proposal.

When thinking about what to ask, consider:
- Scalability (e.g., expected load, traffic patterns, horizontal vs. vertical scaling)
- Performance (latency, throughput, resource constraints)
- Component boundaries and interfaces (APIs, responsibilities, integrations)
- Architectural patterns and styles (event-driven, layered, microservices, etc.)
- Data flow and state management (data ownership, consistency model, persistence)
- Operational and deployment concerns (availability, fault tolerance, monitoring)
- Security or compliance constraints (authentication, data protection, privacy)

Guidelines:
- Prefer **high-signal, clarifying questions** that would directly impact architectural direction.
- Avoid trivial or redundant questions (e.g., restating information already in the problem).
- If the problem is already well-specified, you may return no questions.
- Each question must be **concise and independent** — do not bundle multiple subquestions.`;
    const promptWithContext = prependContext(basePrompt, context, agentId, includeFullHistory);
    return appendSharedInstructions(promptWithContext, INSTRUCTION_TYPES.CLARIFICATION);
  },
};

