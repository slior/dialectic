import { performancePrompts } from './performance-prompts';
import type { DebateContext } from '../../types/debate.types';

// Test constants
const TEST_PROBLEM = 'Design a high-performance caching system';
const TEST_PROPOSAL_CONTENT = 'Here is my proposal for the caching system...';
const TEST_ORIGINAL_CONTENT = 'Original proposal content';
const TEST_CRITIQUES_TEXT = 'Critique 1: Missing cache invalidation\nCritique 2: Latency concerns';
const TEST_CONTENT = 'Debate history content to summarize';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_500 = 500;
const MAX_LENGTH_500_STRING = '500';
const TEST_AGENT_ID = 'agent-performance-1';
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
            agentRole: 'performance',
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
        agentName: 'Performance Engineer',
        role: 'performance',
        items: [
          {
            id: 'q1',
            question: 'What is the expected request rate?',
            answer: '10K requests/sec',
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

describe('Performance Prompts', () => {
  describe('systemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = performancePrompts.systemPrompt;

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent value across multiple calls', () => {
      const prompt1 = performancePrompts.systemPrompt;
      const prompt2 = performancePrompts.systemPrompt;

      expect(prompt1).toBe(prompt2);
    });

    it('should include performance engineering focus areas', () => {
      const prompt = performancePrompts.systemPrompt;

      expect(prompt).toContain('performance engineer');
      expect(prompt).toContain('optimizing');
      expect(prompt).toContain('latency');
      expect(prompt).toContain('throughput');
      expect(prompt).toContain('scalability');
    });
  });

  describe('proposePrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected request rate?');
      expect(prompt).toContain('10K requests/sec');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = performancePrompts.proposePrompt(TEST_PROBLEM);
      const prompt2 = performancePrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = performancePrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include performance-specific structure sections', () => {
      const prompt = performancePrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('Performance Overview');
      expect(prompt).toContain('Key Bottlenecks & Risks');
      expect(prompt).toContain('Optimization Strategies');
      expect(prompt).toContain('Resource Utilization Plan');
      expect(prompt).toContain('Observability & Testing');
      expect(prompt).toContain('Trade-offs & Justifications');
    });

    it('should handle empty problem string', () => {
      const prompt = performancePrompts.proposePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('critiquePrompt', () => {
    it('should return a non-empty prompt with proposal content', () => {
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);
      const prompt2 = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);
      const prompt2 = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include performance-specific critique structure sections', () => {
      const prompt = performancePrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('Strengths');
      expect(prompt).toContain('Weaknesses');
      expect(prompt).toContain('Suggested Improvements');
      expect(prompt).toContain('Critical Risks');
    });

    it('should handle empty proposal content', () => {
      const prompt = performancePrompts.critiquePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('refinePrompt', () => {
    it('should return a non-empty prompt with original content and critiques', () => {
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);
      const prompt2 = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);
      const prompt2 = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include performance-specific refinement structure sections', () => {
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('Revised Performance Strategy');
      expect(prompt).toContain('Changes Made');
      expect(prompt).toContain('Expected Impact');
      expect(prompt).toContain('Remaining Risks');
    });

    it('should handle empty original content', () => {
      const prompt = performancePrompts.refinePrompt('', TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle empty critiques text', () => {
      const prompt = performancePrompts.refinePrompt(TEST_ORIGINAL_CONTENT, '');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
    });
  });

  describe('summarizePrompt', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);
      const prompt3 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt3).toContain(MAX_LENGTH_500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
      expect(prompt3).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should return different prompts for different content', () => {
      const prompt1 = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = performancePrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const prompt1 = performancePrompts.summarizePrompt(SHORT_CONTENT, MAX_LENGTH_1000);
      const prompt2 = performancePrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toContain(SHORT_CONTENT);
      expect(prompt2).toContain(LONG_CONTENT);
      expect(prompt1.length).toBeLessThan(prompt2.length);
    });

    it('should handle empty content string', () => {
      const prompt = performancePrompts.summarizePrompt(EMPTY_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should handle zero maxLength', () => {
      const prompt = performancePrompts.summarizePrompt(TEST_CONTENT, 0);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('0');
    });

    it('should handle very large maxLength values', () => {
      const largeMaxLength = 1000000;
      const prompt = performancePrompts.summarizePrompt(TEST_CONTENT, largeMaxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('1000000');
    });

    it('should include performance-specific summary structure sections', () => {
      const prompt = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Performance Insights');
      expect(prompt).toContain('Major Decisions');
      expect(prompt).toContain('Remaining Challenges');
    });

    it('should include performance engineering perspective in summary instructions', () => {
      const prompt = performancePrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('performance engineering perspective');
      expect(prompt).toContain('performance goals');
      expect(prompt).toContain('bottlenecks');
      expect(prompt).toContain('optimization strategies');
    });
  });

  describe('clarifyPrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected request rate?');
    });

    it('should handle empty problem string', () => {
      const prompt = performancePrompts.clarifyPrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = performancePrompts.clarifyPrompt(TEST_PROBLEM);
      const prompt2 = performancePrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = performancePrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include performance engineering perspective in clarification instructions', () => {
      const prompt = performancePrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('performance engineering perspective');
      expect(prompt).toContain('runtime efficiency');
      expect(prompt).toContain('scalability');
      expect(prompt).toContain('load characteristics');
      expect(prompt).toContain('concurrency');
      expect(prompt).toContain('caching');
      expect(prompt).toContain('observability');
    });
  });
});

