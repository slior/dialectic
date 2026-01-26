import { kissPrompts } from './kiss-prompts';
import { createMockDebateContext, createMockDebateContextWithFullHistory, createMockDebateContextWithSummary, createMockDebateContextWithClarifications } from './test-utils';

// Test constants
const TEST_PROBLEM = 'Design a scalable authentication system';
const TEST_PROPOSAL_CONTENT = 'Here is my proposal for the authentication system...';
const TEST_ORIGINAL_CONTENT = 'Original proposal content';
const TEST_CRITIQUES_TEXT = 'Critique 1: Missing rate limiting\nCritique 2: Security concerns';
const TEST_CONTENT = 'Debate history content to summarize';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_500 = 500;
const MAX_LENGTH_500_STRING = '500';
const EMPTY_CONTENT = '';
const SHORT_CONTENT = 'Short';
const LONG_CONTENT = 'Very long content '.repeat(100);
const TEST_AGENT_ID = 'agent-kiss-1';

// Helper functions for creating mock DebateContext objects


describe('KISS Prompts', () => {
  describe('systemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = kissPrompts.systemPrompt;

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include KISS agent role description', () => {
      const prompt = kissPrompts.systemPrompt;

      expect(prompt).toContain('KISS Agent');
      expect(prompt).toContain('simplicity');
      expect(prompt).toContain('minimalism');
    });

    it('should include simplicity principles', () => {
      const prompt = kissPrompts.systemPrompt;

      expect(prompt).toContain('YAGNI');
      expect(prompt).toContain('Keep It Simple');
      expect(prompt).toContain('Minimal Viable Architecture');
    });

    it('should return consistent value across multiple calls', () => {
      const prompt1 = kissPrompts.systemPrompt;
      const prompt2 = kissPrompts.systemPrompt;

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('proposePrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include simplicity-focused instructions', () => {
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('simplest solution');
      expect(prompt).toContain('Minimal Architecture');
      expect(prompt).toContain('YAGNI');
      expect(prompt).toContain('Simplifications');
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'KISS Agent',
        'kiss',
        'What is the expected user volume?',
        '10M users',
        TEST_PROBLEM
      );
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected user volume?');
      expect(prompt).toContain('10M users');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = kissPrompts.proposePrompt(TEST_PROBLEM);
      const prompt2 = kissPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt1 = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = kissPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty problem string', () => {
      const prompt = kissPrompts.proposePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include all required sections in the prompt structure', () => {
      const prompt = kissPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toContain('Core Idea');
      expect(prompt).toContain('Minimal Architecture');
      expect(prompt).toContain('Simplifications');
      expect(prompt).toContain('Phased Path');
      expect(prompt).toContain('Risks of Simplicity');
      expect(prompt).toContain('What We\'re NOT Building');
    });
  });

  describe('critiquePrompt', () => {
    it('should return a non-empty prompt with proposal content', () => {
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include simplicity-focused critique instructions', () => {
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('simplicity bias');
      expect(prompt).toContain('Unnecessary Complexity');
      expect(prompt).toContain('Simplification Opportunities');
      expect(prompt).toContain('YAGNI Violations');
      expect(prompt).toContain('Over-Engineering Concerns');
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);
      const prompt2 = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt1 = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);
      const prompt2 = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty proposal content', () => {
      const prompt = kissPrompts.critiquePrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include all required sections in the critique structure', () => {
      const prompt = kissPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toContain('Unnecessary Complexity');
      expect(prompt).toContain('Simplification Opportunities');
      expect(prompt).toContain('Essential vs. Accidental Complexity');
      expect(prompt).toContain('YAGNI Violations');
      expect(prompt).toContain('Over-Engineering Concerns');
      expect(prompt).toContain('Simpler Alternatives');
      expect(prompt).toContain('Recommended Simplified Direction');
    });
  });

  describe('refinePrompt', () => {
    it('should return a non-empty prompt with original content and critiques', () => {
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include simplicity-focused refinement instructions', () => {
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('simpler');
      expect(prompt).toContain('more direct');
      expect(prompt).toContain('Simplified Design');
      expect(prompt).toContain('Reductions Made');
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);
      const prompt2 = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt1 = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);
      const prompt2 = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle empty original content', () => {
      const prompt = kissPrompts.refinePrompt('', TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle empty critiques text', () => {
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, '');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
    });

    it('should include all required sections in the refinement structure', () => {
      const prompt = kissPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toContain('Simplified Design');
      expect(prompt).toContain('Reductions Made');
      expect(prompt).toContain('Remaining Justifications');
      expect(prompt).toContain('Stepwise Plan');
      expect(prompt).toContain('Expected Outcome');
    });
  });

  describe('summarizePrompt', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should include simplicity-focused summarization instructions', () => {
      const prompt = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('simplicity perspective');
      expect(prompt).toContain('simplicity decisions');
      expect(prompt).toContain('complexity challenges');
      expect(prompt).toContain('Key Simplicity Decisions');
      expect(prompt).toContain('YAGNI Principles Applied');
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);
      const prompt3 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt3).toContain(MAX_LENGTH_500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
      expect(prompt3).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const prompt1 = kissPrompts.summarizePrompt(SHORT_CONTENT, MAX_LENGTH_1000);
      const prompt2 = kissPrompts.summarizePrompt(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toContain(SHORT_CONTENT);
      expect(prompt2).toContain(LONG_CONTENT);
      expect(prompt1.length).toBeLessThan(prompt2.length);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should handle empty content string', () => {
      const prompt = kissPrompts.summarizePrompt(EMPTY_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should handle zero maxLength', () => {
      const prompt = kissPrompts.summarizePrompt(TEST_CONTENT, 0);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('0');
    });

    it('should handle very large maxLength values', () => {
      const largeMaxLength = 1000000;
      const prompt = kissPrompts.summarizePrompt(TEST_CONTENT, largeMaxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('1000000');
    });

    it('should include all required sections in the summarization structure', () => {
      const prompt = kissPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Key Simplicity Decisions');
      expect(prompt).toContain('Complexity Challenges Discussed');
      expect(prompt).toContain('YAGNI Principles Applied');
      expect(prompt).toContain('Simplification Opportunities Identified');
      expect(prompt).toContain('Emerging Simplicity Consensus');
    });
  });

  describe('clarifyPrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include simplicity-focused clarification instructions', () => {
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('simplest possible solution');
      expect(prompt).toContain('minimum viable solution');
      expect(prompt).toContain('over-engineering');
      expect(prompt).toContain('essential');
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory(TEST_PROBLEM);
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext(TEST_PROBLEM);
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications(
        'KISS Agent',
        'kiss',
        'What is the expected user volume?',
        '10M users',
        TEST_PROBLEM
      );
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected user volume?');
    });

    it('should handle empty problem string', () => {
      const prompt = kissPrompts.clarifyPrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = kissPrompts.clarifyPrompt(TEST_PROBLEM);
      const prompt2 = kissPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID, 'kiss', TEST_PROBLEM);
      const prompt1 = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = kissPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });

    it('should include guidance on question focus areas', () => {
      const prompt = kissPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toContain('Core functional need');
      expect(prompt).toContain('Real constraints');
      expect(prompt).toContain('essential for version 1');
      expect(prompt).toContain('simpler alternatives');
    });
  });
});

