import type { DebateContext } from '../../types/debate.types';

import { dataModelingPrompts } from './data-modeling-prompts';

// Test constants
const TEST_PROBLEM = 'Design a database schema for an e-commerce system';
const TEST_PROPOSAL_CONTENT = 'Here is my proposal for the data model...';
const TEST_ORIGINAL_CONTENT = 'Original proposal content';
const TEST_CRITIQUES_TEXT = 'Critique 1: Missing indexes\nCritique 2: Normalization issues';
const TEST_CONTENT = 'Debate history content to summarize';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const TEST_AGENT_ID = 'agent-data-modeling-1';

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
            agentRole: 'datamodeling',
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
        agentName: 'Data Modeler',
        role: 'datamodeling',
        items: [
          {
            id: 'q1',
            question: 'What is the expected data volume?',
            answer: '1M records',
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

describe('Data Modeling Prompts', () => {
  describe('systemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = dataModelingPrompts.systemPrompt;

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent value across multiple calls', () => {
      const prompt1 = dataModelingPrompts.systemPrompt;
      const prompt2 = dataModelingPrompts.systemPrompt;

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('proposePrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected data volume?');
      expect(prompt).toContain('1M records');
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = dataModelingPrompts.proposePrompt(TEST_PROBLEM);
      const prompt2 = dataModelingPrompts.proposePrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = dataModelingPrompts.proposePrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('critiquePrompt', () => {
    it('should return a non-empty prompt with proposal content', () => {
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROPOSAL_CONTENT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);
      const prompt2 = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);
      const prompt2 = dataModelingPrompts.critiquePrompt(TEST_PROPOSAL_CONTENT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('refinePrompt', () => {
    it('should return a non-empty prompt with original content and critiques', () => {
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_ORIGINAL_CONTENT);
      expect(prompt).toContain(TEST_CRITIQUES_TEXT);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);
      const prompt2 = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);
      const prompt2 = dataModelingPrompts.refinePrompt(TEST_ORIGINAL_CONTENT, TEST_CRITIQUES_TEXT, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('summarizePrompt', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const shortContent = 'Short content';
      const longContent = 'Very long content '.repeat(100);

      const prompt1 = dataModelingPrompts.summarizePrompt(shortContent, MAX_LENGTH_1000);
      const prompt2 = dataModelingPrompts.summarizePrompt(longContent, MAX_LENGTH_1000);

      expect(prompt1).toContain(shortContent);
      expect(prompt2).toContain(longContent);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = dataModelingPrompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });
  });

  describe('clarifyPrompt', () => {
    it('should return a non-empty prompt with problem', () => {
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include context when provided with agentId', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Context');
    });

    it('should include context with full history when includeFullHistory is true', () => {
      const context = createMockDebateContextWithFullHistory();
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, true);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).toContain('Previous Debate Rounds');
    });

    it('should not include context when includeFullHistory is false and no summary exists', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID, false);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
      expect(prompt).not.toContain('Previous Debate Context');
      expect(prompt).not.toContain('Previous Debate Rounds');
    });

    it('should handle undefined context', () => {
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should handle undefined agentId', () => {
      const context = createMockDebateContext();
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, undefined);

      expect(prompt).toBeDefined();
      expect(prompt).toContain(TEST_PROBLEM);
    });

    it('should include clarifications when present in context', () => {
      const context = createMockDebateContextWithClarifications();
      const prompt = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Clarifications');
      expect(prompt).toContain('What is the expected data volume?');
    });

    it('should handle empty problem string', () => {
      const prompt = dataModelingPrompts.clarifyPrompt('');

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM);
      const prompt2 = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM);

      expect(prompt1).toBe(prompt2);
    });

    it('should return consistent results with same context', () => {
      const context = createMockDebateContextWithSummary(TEST_AGENT_ID);
      const prompt1 = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);
      const prompt2 = dataModelingPrompts.clarifyPrompt(TEST_PROBLEM, context, TEST_AGENT_ID);

      expect(prompt1).toBe(prompt2);
    });
  });
});

