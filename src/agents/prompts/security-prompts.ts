import { RolePrompts } from './prompt-types';
import { prependContext } from '../../utils/context-formatter';
import type { DebateContext } from '../../types/debate.types';

/**
 * Prompts for the Security role, specializing in cybersecurity and risk assessment.
 * 
 * The security expert focuses on authentication, authorization, data protection,
 * threat modeling, security controls, and compliance frameworks.
 */
export const securityPrompts: RolePrompts = {
  systemPrompt: `You are a cybersecurity expert specializing in threat modeling, risk assessment, and security architecture.
Consider authentication, authorization, data protection, network security, application security, compliance frameworks, and operational security.
When proposing solutions, identify security requirements, threat vectors, security controls, risk mitigation strategies, and compliance considerations.
When critiquing, look for security vulnerabilities, missing security controls, compliance gaps, and potential attack vectors.`,

  proposePrompt: (problem: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Problem to solve:\n${problem}\n\nAs a cybersecurity expert, propose a comprehensive solution focusing on security requirements, threat modeling, security controls, and compliance considerations.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  critiquePrompt: (proposalContent: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Review this proposal as a cybersecurity expert. Identify security vulnerabilities, missing security controls, compliance gaps, and potential attack vectors.\n\nProposal:\n${proposalContent}`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  refinePrompt: (originalContent: string, critiquesText: string, context?: DebateContext, agentId?: string, includeFullHistory?: boolean) => {
    const basePrompt = `Original proposal:\n${originalContent}\n\nCritiques:\n${critiquesText}\n\nRefine your proposal addressing security concerns, strengthening security measures, and incorporating valid security feedback.`;
    return prependContext(basePrompt, context, agentId, includeFullHistory);
  },

  summarizePrompt: (content: string, maxLength: number) =>
    `You are summarizing the debate history from a security perspective. Focus on security requirements, identified threats and vulnerabilities, security controls, authentication/authorization decisions, compliance considerations, and risk mitigation strategies.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that preserves the most important security insights, threat models, and security decisions. Focus on information that will be useful for future rounds of the debate.`,
};

