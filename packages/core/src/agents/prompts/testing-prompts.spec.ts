import type { DebateContext } from '../../types/debate.types';

import { testingPrompts } from './testing-prompts';

// Test constants
const TEST_PROBLEM = 'Design a comprehensive testing strategy for a distributed system';
const TEST_PROPOSAL_CONTENT = 'Here is my proposal for the testing strategy...';
const TEST_ORIGINAL_CONTENT = 'Original proposal content';
const TEST_CRITIQUES_TEXT = 'Critique 1: Missing integration tests\nCritique 2: Insufficient observability';
const TEST_CONTENT = 'Debate history content to summarize';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_500 = 500;
const MAX_LENGTH_500_STRING = '500';
const TEST_AGENT_ID = 'agent-testing-1';
const EMPTY_CONTENT = '';
const SHORT_CONTENT = 'Short';
const LONG_CONTENT = 'Very long content '.repeat(100);

// Helper functions for creating mock DebateContext objects
function createMockDebateContext(): DebateContext {
  return {
    problem: TEST_PROBLEM,
    history: [],
  };
}

function createMockDebateContextWithSummary(agentId: string): DebateContext {
  return {
    problem: TEST_PROBLEM,
    history: [
      {
        roundNumber: 1,
        contributions: [],
        summaries: {
          [agentId]: {
            agentId,
            agentRole: 'testing',
            summary: 'Previous round summary',
            metadata: {
              beforeChars: 1000,
              afterChars: 500,
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

function createMockDebateContextWithClarifications(): DebateContext {
  return {
    problem: TEST_PROBLEM,
    history: [],
    clarifications: [
      {
        agentId: 'agent-1',
        agentName: 'Testing Expert',
        role: 'testing',
        items: [
          {
            id: 'q1',
            question: 'What is the expected test coverage requirement?',
            answer: '80% code coverage',
          },
        ],
      },
    ],
  };
}

function createMockDebateContextWithFullHistory(): DebateContext {
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
            content: 'Previous proposal',
            metadata: {},
          },
        ],
        summaries: {},
        timestamp: new Date(),
      },
    ],
  };
}

describe('Testing Prompts', () => {
  describe('systemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = testingPrompts.systemPrompt;

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent value across multiple calls', () => {
      const prompt1 = testingPrompts.systemPrompt;
      const prompt2 = testingPrompts.systemPrompt;

      expect(prompt1).toBe(prompt2);
    });

    it('should include testing-specific focus areas', () => {
      const prompt = testingPrompts.systemPrompt;

      expect(prompt).toContain('testing');
      expect(prompt).toContain('testability');
      expect(prompt).toContain('observability');
    });

    it('should include system testability and observability', () => {
      const prompt = testingPrompts.systemPrompt;

      expect(prompt).toContain('System testability');
      expect(prompt).toContain('observability');
    });

    it('should include test strategy mentions', () => {
      const prompt = testingPrompts.systemPrompt;

      expect(prompt).toContain('Test strategy');
      expect(prompt).toContain('automation');
    });
  });

  describe('proposePrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected test coverage requirement?');
      expect(prompt).toContain('80% code coverage');
    });

    it('should include testing-specific structure sections', () => {
      const prompt = testingPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('Testability Overview');
      expect(prompt).toContain('Testing Strategy');
      expect(prompt).toContain('Automation Approach');
      expect(prompt).toContain('Observability & Monitoring');
      expect(prompt).toContain('Non-functional Testing');
      expect(prompt).toContain('Risks & Limitations');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = testingPrompts.proposePrompt(TEST_PROBLEM);
      const prompt2 = testingPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = testingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty problem string', () => {
      const prompt = testingPrompts.proposePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('critiquePrompt', () => {
    it('should return a non-empty prompt with proposal content', () => {
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include testing-specific critique structure', () => {
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('Strengths');
      expect(prompt).toContain('Weaknesses');
      expect(prompt).toContain('Suggested Improvements');
      expect(prompt).toContain('Critical Gaps');
    });

    it('should include testing and quality engineering perspective', () => {
      const prompt = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('testing');
      expect(prompt).toContain('quality engineering');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);
      const prompt2 = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);
      const prompt2 = testingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty proposal content', () => {
      const prompt = testingPrompts.critiquePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('refinePrompt', () => {
    it('should return a non-empty prompt with original content and critiques', () => {
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include testing-specific refinement structure', () => {
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('Revised Testing Strategy');
      expect(prompt).toContain('Changes Made');
      expect(prompt).toContain('Expected Impact');
      expect(prompt).toContain('Remaining Gaps');
    });

    it('should mention testability and observability improvements', () => {
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('testability');
      expect(prompt).toContain('observability');
      expect(prompt).toContain('automation alignment');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);
      const prompt2 = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);
      const prompt2 = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty original content', () => {
      const prompt = testingPrompts.refinePrompt('', TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle empty critiques text', () => {
      const prompt = testingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, '');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
    });
  });

  describe('summarizePrompt', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);
      const prompt3 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt3).toContain(MAX_LENGTH_500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
      expect(prompt3).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const prompt1 = testingPrompts.summarizePrompt(SHORT_CONTENT, MAX_LENGTH_1000);
      const prompt2 = testingPrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toContain(SHORT_CONTENT);
      expect(prompt2).toContain(LONG_CONTENT);
      expect(prompt1.length).toBeLessThan(prompt2.length);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should include testing-specific summary structure', () => {
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Testing Insights');
      expect(prompt).toContain('Major Decisions');
      expect(prompt).toContain('Remaining Gaps');
    });

    it('should mention testing and quality perspective', () => {
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('testing');
      expect(prompt).toContain('quality');
    });

    it('should mention testability, observability, and automation', () => {
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('testability');
      expect(prompt).toContain('observability');
      expect(prompt).toContain('automation');
    });

    it('should handle empty content string', () => {
      const prompt = testingPrompts.summarizePrompt(EMPTY_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should handle zero maxLength', () => {
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, 0);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('0');
    });

    it('should handle very large maxLength values', () => {
      const largeMaxLength = 1000000;
      const prompt = testingPrompts.summarizePrompt(TEST_CONTENT, largeMaxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('1000000');
    });
  });

  describe('clarifyPrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected test coverage requirement?');
    });

    it('should include testing-specific clarification focus areas', () => {
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('Testability');
      expect(prompt).toContain('validation coverage');
      expect(prompt).toContain('Automation feasibility');
      expect(prompt).toContain('Observability');
      expect(prompt).toContain('Edge cases');
    });

    it('should mention testing and verification perspective', () => {
      const prompt = testingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('testing');
      expect(prompt).toContain('verification');
    });

    it('should handle empty problem string', () => {
      const prompt = testingPrompts.clarifyPrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = testingPrompts.clarifyPrompt(TEST_PROBLEM);
      const prompt2 = testingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = testingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });
  });
});

