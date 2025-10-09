import { RolePrompts } from './prompt-types';

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

  proposePrompt: (problem: string) => 
    `Problem to solve:\n${problem}\n\nAs an architect, propose a comprehensive solution including approach, key components, challenges, and justification.`,

  critiquePrompt: (proposalContent: string) => 
    `Review this proposal as an architect. Identify strengths, weaknesses, improvements, and critical issues.\n\nProposal:\n${proposalContent}`,

  refinePrompt: (originalContent: string, critiquesText: string) => 
    `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing valid concerns, incorporating good suggestions, and strengthening the solution.`,
};

