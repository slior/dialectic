import type { DebateContext } from '../../types/debate.types';

import { securityPrompts } from './security-prompts';
import { createMockDebateContext, createMockDebateContextWithFullHistory, createMockDebateContextWithSummary, createMockDebateContextWithClarifications } from './test-utils';

// Test constants
const TEST_PROBLEM = 'Design a secure authentication system';
const TEST_PROPOSAL_CONTENT = 'Here is my proposal for the authentication system...';
const TEST_ORIGINAL_CONTENT = 'Original proposal content';
const TEST_CRITIQUES_TEXT = 'Critique 1: Missing encryption\nCritique 2: Authorization concerns';
const TEST_CONTENT = 'Debate history content to summarize';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_500 = 500;
const MAX_LENGTH_500_STRING = '500';
const TEST_AGENT_ID = 'agent-security-1';
const EMPTY_CONTENT = '';
const SHORT_CONTENT = 'Short';
const LONG_CONTENT = 'Very long content '.repeat(100);

// Helper functions for creating mock DebateContext objects


function createMockDebateContextWithMultipleRounds(): DebateContext {
  return {
    problem: TEST_PROBLEM,
    history: [
      {
        roundNumber: 1,
        contributions: [
          {
            agentId: 'agent-1',
            agentRole: 'architect',
            type: 'proposal',
            content: 'Round 1 proposal',
            metadata: {},
          },
        ],
        summaries: {},
        timestamp: new Date(),
      },
      {
        roundNumber: 2,
        contributions: [
          {
            agentId: 'agent-1',
            agentRole: 'architect',
            type: 'proposal',
            content: 'Round 2 proposal',
            metadata: {},
          },
        ],
        summaries: {
          [TEST_AGENT_ID]: {
            agentId: TEST_AGENT_ID,
            agentRole: 'security',
            summary: 'Summary from round 2',
            metadata: {
              beforeChars: 2000,
              afterChars: 800,
              method: 'length-based',
              timestamp: new Date(),
            },
          },
        },
        timestamp: new Date(),
      },
    ],
  };
}

describe('Security Prompts', () => {
  describe('systemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = securityPrompts.systemPrompt;

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent value across multiple calls', () => {
      const prompt1 = securityPrompts.systemPrompt;
      const prompt2 = securityPrompts.systemPrompt;

      expect(prompt1).toBe(prompt2);
    });

    it('should include security architecture focus areas', () => {
      const prompt = securityPrompts.systemPrompt;

      expect(prompt).toContain('security architect');
      expect(prompt).toContain('Threat modeling');
      expect(prompt).toContain('Authentication');
      expect(prompt).toContain('authorization');
      expect(prompt).toContain('encryption');
      expect(prompt).toContain('data protection');
    });

    it('should include security design principles', () => {
      const prompt = securityPrompts.systemPrompt;

      expect(prompt).toContain('least privilege');
      expect(prompt).toContain('defense in depth');
      expect(prompt).toContain('zero trust');
    });

    it('should include compliance and regulatory concerns', () => {
      const prompt = securityPrompts.systemPrompt;

      expect(prompt).toContain('compliance');
      expect(prompt).toContain('GDPR');
      expect(prompt).toContain('SOC 2');
    });

    it('should include operational security topics', () => {
      const prompt = securityPrompts.systemPrompt;

      expect(prompt).toContain('secrets management');
      expect(prompt).toContain('operational security');
      expect(prompt).toContain('denial-of-service');
      expect(prompt).toContain('privilege escalation');
      expect(prompt).toContain('data leakage');
    });
  });

  describe('proposePrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'Security Architect',
        'security',
        'What is the data sensitivity level?',
        'Highly sensitive - PII and financial data',
        TEST_PROBLEM
      );
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the data sensitivity level?');
      expect(prompt).toContain('Highly sensitive - PII and financial data');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = securityPrompts.proposePrompt(TEST_PROBLEM);
      const prompt2 = securityPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt1 = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include security-specific structure sections', () => {
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('Security Objectives');
      expect(prompt).toContain('Threat Model');
      expect(prompt).toContain('Core Security Mechanisms');
      expect(prompt).toContain('Data Protection & Privacy');
      expect(prompt).toContain('Compliance & Operational Security');
      expect(prompt).toContain('Trade-offs & Justifications');
      expect(prompt).toContain('Requirements Coverage');
    });

    it('should handle empty problem string', () => {
      const prompt = securityPrompts.proposePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should use most recent summary when multiple rounds exist', () => {
      const context = createMockDebateContextWithMultipleRounds();
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Summary from round 2');
      expect(prompt).not.toContain('Round 1 proposal');
    });

    it('should include security specialist perspective in instructions', () => {
      const prompt = securityPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('security specialist');
      expect(prompt).toContain('secure by architecture and by operation');
    });
  });

  describe('critiquePrompt', () => {
    it('should return a non-empty prompt with proposal content', () => {
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'Security Architect',
        'security',
        'What is the data sensitivity level?',
        'Highly sensitive - PII and financial data',
        TEST_PROBLEM
      );
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the data sensitivity level?');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);
      const prompt2 = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt1 = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);
      const prompt2 = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include security-specific critique structure sections', () => {
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('Strengths');
      expect(prompt).toContain('Weaknesses');
      expect(prompt).toContain('Suggested Improvements');
      expect(prompt).toContain('Critical Risks');
    });

    it('should handle empty proposal content', () => {
      const prompt = securityPrompts.critiquePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include security engineering perspective in critique instructions', () => {
      const prompt = securityPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('security engineering perspective');
      expect(prompt).toContain('vulnerabilities');
      expect(prompt).toContain('missing controls');
      expect(prompt).toContain('unprotected data flows');
      expect(prompt).toContain('data breaches');
      expect(prompt).toContain('privilege escalation');
      expect(prompt).toContain('service disruption');
    });
  });

  describe('refinePrompt', () => {
    it('should return a non-empty prompt with original content and critiques', () => {
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'Security Architect',
        'security',
        'What is the data sensitivity level?',
        'Highly sensitive - PII and financial data',
        TEST_PROBLEM
      );
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the data sensitivity level?');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);
      const prompt2 = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt1 = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);
      const prompt2 = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include security-specific refinement structure sections', () => {
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('Revised Security Architecture');
      expect(prompt).toContain('Changes Made');
      expect(prompt).toContain('Expected Impact');
      expect(prompt).toContain('Remaining Risks');
    });

    it('should handle empty original content', () => {
      const prompt = securityPrompts.refinePrompt('', TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle empty critiques text', () => {
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, '');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
    });

    it('should include security-focused refinement instructions', () => {
      const prompt = securityPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('address security concerns');
      expect(prompt).toContain('improve resilience');
      expect(prompt).toContain('strengthen the protection');
      expect(prompt).toContain('mitigate risks');
      expect(prompt).toContain('enhance compliance');
    });
  });

  describe('summarizePrompt', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);
      const prompt3 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt3).toContain(MAX_LENGTH_500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
      expect(prompt3).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should return different prompts for different content', () => {
      const prompt1 = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = securityPrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const prompt1 = securityPrompts.summarizePrompt(SHORT_CONTENT, MAX_LENGTH_1000);
      const prompt2 = securityPrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toContain(SHORT_CONTENT);
      expect(prompt2).toContain(LONG_CONTENT);
      expect(prompt1.length).toBeLessThan(prompt2.length);
    });

    it('should handle empty content string', () => {
      const prompt = securityPrompts.summarizePrompt(EMPTY_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should handle zero maxLength', () => {
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, 0);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('0');
    });

    it('should handle very large maxLength values', () => {
      const largeMaxLength = 1000000;
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, largeMaxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('1000000');
    });

    it('should include security-specific summary structure sections', () => {
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Security Insights');
      expect(prompt).toContain('Major Decisions');
      expect(prompt).toContain('Remaining Risks');
    });

    it('should include security perspective in summary instructions', () => {
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('security perspective');
      expect(prompt).toContain('threat modeling');
      expect(prompt).toContain('security controls');
      expect(prompt).toContain('risk mitigation');
      expect(prompt).toContain('attack surfaces');
      expect(prompt).toContain('data protection');
      expect(prompt).toContain('authentication mechanisms');
    });

    it('should include character limit instruction', () => {
      const prompt = securityPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('maximum of');
      expect(prompt).toContain('characters');
    });
  });

  describe('clarifyPrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'Security Architect',
        'security',
        'What is the data sensitivity level?',
        'Highly sensitive - PII and financial data',
        TEST_PROBLEM
      );
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the data sensitivity level?');
    });

    it('should handle empty problem string', () => {
      const prompt = securityPrompts.clarifyPrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = securityPrompts.clarifyPrompt(TEST_PROBLEM);
      const prompt2 = securityPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'security', TEST_PROBLEM);
      const prompt1 = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = securityPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include security architecture perspective in clarification instructions', () => {
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('security architecture perspective');
      expect(prompt).toContain('security');
      expect(prompt).toContain('privacy');
      expect(prompt).toContain('compliance');
      expect(prompt).toContain('trust boundaries');
    });

    it('should include security-focused clarification priorities', () => {
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('Authentication and authorization requirements');
      expect(prompt).toContain('Data sensitivity and classification');
      expect(prompt).toContain('Communication channels and encryption needs');
      expect(prompt).toContain('Access control and operational security expectations');
      expect(prompt).toContain('Compliance or regulatory constraints');
    });

    it('should allow zero or more questions', () => {
      const prompt = securityPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('zero or more');
      expect(prompt).toContain('concise');
      expect(prompt).toContain('high-value');
    });
  });
});
