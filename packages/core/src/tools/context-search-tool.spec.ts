
import { DebateContext, DebateRound, Contribution, CONTRIBUTION_TYPES, DebateState, DEBATE_STATUS } from '../types/debate.types';

import { CONTEXT_SEARCH_TOOL_NAME, ContextSearchTool } from './context-search-tool';

// Test constants
const TOOL_NAME_CONTEXT_SEARCH = CONTEXT_SEARCH_TOOL_NAME;
const AGENT_ID_1 = 'agent1';
const AGENT_ID_2 = 'agent2';
const AGENT_ROLE_ARCHITECT = 'architect';
const AGENT_ROLE_PERFORMANCE = 'performance';
const PROBLEM_CACHING_SYSTEM = 'Design a caching system';
const PROBLEM_TEST = 'Test problem';
const PROBLEM_DESIGN_SYSTEM = 'Design a system';
const CONTENT_PROPOSAL_CACHING = 'This is a proposal about caching systems';
const CONTENT_CRITIQUE_OPTIMIZATION = 'The caching approach needs optimization';
const CONTENT_REFINEMENT_CACHING = 'Refined proposal with better caching strategy';
const CONTENT_PROPOSAL_AUTH = 'This proposal mentions authentication systems';
const CONTENT_STATE_ROUNDS_DATABASE = 'State rounds content with database term';
const CONTENT_CONTEXT_HISTORY_CACHING = 'Context history content with caching term';
const SEARCH_TERM_CACHING = 'caching';
const SEARCH_TERM_CACHING_UPPERCASE = 'CACHING';
const SEARCH_TERM_CACH_SUBSTRING = 'cach';
const SEARCH_TERM_NONEXISTENT = 'nonexistentterm12345';
const SEARCH_TERM_TEST = 'test';
const SEARCH_TERM_AUTHENTICATION = 'authentication';
const SEARCH_TERM_DATABASE = 'database';
const SEARCH_TERM_TRUNCATE = 'truncate';
const MAX_CONTENT_SNIPPET_LENGTH = 200;
const ERROR_CONTEXT_REQUIRED = 'Context is required for context search';
const ERROR_TERM_REQUIRED = 'Search term is required and must be a string';
const RESULT_STATUS_SUCCESS = 'success';
const RESULT_STATUS_ERROR = 'error';
const PARAM_TYPE_OBJECT = 'object';
const PARAM_TYPE_STRING = 'string';
const PARAM_NAME_TERM = 'term';
const ROUND_NUMBER_1 = 1;
const ROUND_NUMBER_2 = 2;
const DEBATE_ID_TEST = 'test-debate';
const DEBATE_ID_TEST_DEBATE = 'test-debate';

describe('ContextSearchTool', () => {
  let tool: ContextSearchTool;
  let mockContext: DebateContext;

  beforeEach(() => {
    tool = new ContextSearchTool();
    
    const round1: DebateRound = {
      roundNumber: ROUND_NUMBER_1,
      contributions: [
        {
          agentId: AGENT_ID_1,
          agentRole: AGENT_ROLE_ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: CONTENT_PROPOSAL_CACHING,
          metadata: {},
        } as Contribution,
        {
          agentId: AGENT_ID_2,
          agentRole: AGENT_ROLE_PERFORMANCE,
          type: CONTRIBUTION_TYPES.CRITIQUE,
          content: CONTENT_CRITIQUE_OPTIMIZATION,
          metadata: {},
        } as Contribution,
      ],
      timestamp: new Date(),
    };

    const round2: DebateRound = {
      roundNumber: ROUND_NUMBER_2,
      contributions: [
        {
          agentId: AGENT_ID_1,
          agentRole: AGENT_ROLE_ARCHITECT,
          type: CONTRIBUTION_TYPES.REFINEMENT,
          content: CONTENT_REFINEMENT_CACHING,
          metadata: {},
        } as Contribution,
      ],
      timestamp: new Date(),
    };

    mockContext = {
      problem: PROBLEM_CACHING_SYSTEM,
      history: [round1, round2],
    };
  });

  describe('Tool Schema', () => {
    it('should match OpenAI function calling format', () => {
      const schema = tool.schema;
      expect(schema.name).toBe(TOOL_NAME_CONTEXT_SEARCH);
      expect(schema.description).toContain('Search');
      expect(schema.parameters.type).toBe(PARAM_TYPE_OBJECT);
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_TERM]).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_TERM]?.type).toBe(PARAM_TYPE_STRING);
    });
  });

  describe('Tool Execution', () => {
    it('should search for term in debate history (success case)', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.matches).toBeDefined();
      expect(Array.isArray(parsed.result.matches)).toBe(true);
    });

    it('should find multiple matches across rounds', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.result.matches.length).toBeGreaterThan(1);
    });

    it('should return matches with correct metadata', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      const parsed = JSON.parse(result);
      
      const match = parsed.result.matches[0];
      expect(match.roundNumber).toBeDefined();
      expect(match.agentId).toBeDefined();
      expect(match.agentRole).toBeDefined();
      expect(match.type).toBeDefined();
      expect(match.contentSnippet).toBeDefined();
    });

    it('should perform case-insensitive search', () => {
      const result1 = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING_UPPERCASE }, mockContext);
      const result2 = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      
      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);
      
      expect(parsed1.result.matches.length).toBe(parsed2.result.matches.length);
    });

    it('should find substring matches', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACH_SUBSTRING }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.result.matches.length).toBeGreaterThan(0);
    });

    it('should return empty matches when no results found', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_NONEXISTENT }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });
  });

  describe('Error Cases', () => {
    it('should handle missing context gracefully', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, undefined);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_CONTEXT_REQUIRED);
    });

    it('should handle context without history', () => {
      const contextWithoutHistory: DebateContext = {
        problem: PROBLEM_TEST,
      };
      
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, contextWithoutHistory);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });

    it('should return empty matches when context.history is empty array', () => {
      const contextWithEmptyHistory: DebateContext = {
        problem: PROBLEM_TEST,
        history: [],
      };
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, contextWithEmptyHistory);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });

    it('should handle invalid arguments', () => {
      // Test with invalid arguments (missing required 'term' property)
      const invalidArgs: Record<string, unknown> = { invalid: 'arg' };
      const result = tool.execute(invalidArgs as { term?: string }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_TERM_REQUIRED);
    });

    it('should reject empty string as search term', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: '' }, mockContext);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_TERM_REQUIRED);
    });

    it('should reject non-string search term', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: 123 } as unknown as { term?: string }, mockContext);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_TERM_REQUIRED);
    });

  });

  describe('Round and contribution edge cases', () => {
    it('should skip rounds with undefined or missing contributions', () => {
      const roundNoContributions = {
        roundNumber: ROUND_NUMBER_1,
        timestamp: new Date(),
      } as DebateRound;
      const contextWithRoundNoContrib: DebateContext = {
        problem: PROBLEM_TEST,
        history: [roundNoContributions],
      };
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, contextWithRoundNoContrib);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });

    it('should truncate content snippets longer than max length with ellipsis', () => {
      const longContent =
        'a'.repeat(MAX_CONTENT_SNIPPET_LENGTH - SEARCH_TERM_TRUNCATE.length) + SEARCH_TERM_TRUNCATE + 'z'.repeat(50);
      const round: DebateRound = {
        roundNumber: ROUND_NUMBER_1,
        contributions: [
          {
            agentId: AGENT_ID_1,
            agentRole: AGENT_ROLE_ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: longContent,
            metadata: {},
          } as Contribution,
        ],
        timestamp: new Date(),
      };
      const ctx: DebateContext = { problem: PROBLEM_TEST, history: [round] };
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TRUNCATE }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toHaveLength(1);
      expect(parsed.result.matches[0].contentSnippet.endsWith('...')).toBe(true);
      expect(parsed.result.matches[0].contentSnippet.length).toBe(MAX_CONTENT_SNIPPET_LENGTH + 3);
    });

    it('should not add ellipsis when content is exactly max length', () => {
      const exactContent = 'x'.repeat(MAX_CONTENT_SNIPPET_LENGTH - SEARCH_TERM_CACHING.length) + SEARCH_TERM_CACHING;
      const round: DebateRound = {
        roundNumber: ROUND_NUMBER_1,
        contributions: [
          {
            agentId: AGENT_ID_1,
            agentRole: AGENT_ROLE_ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: exactContent,
            metadata: {},
          } as Contribution,
        ],
        timestamp: new Date(),
      };
      const ctx: DebateContext = { problem: PROBLEM_TEST, history: [round] };
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches[0].contentSnippet.endsWith('...')).toBe(false);
    });
  });

  describe('Result Formatting', () => {
    it('should return JSON string with status and result', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('result');
    });

    it('should include content snippets in matches', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      const parsed = JSON.parse(result);
      
      if (parsed.result.matches.length > 0) {
        expect(parsed.result.matches[0].contentSnippet).toBeDefined();
        expect(typeof parsed.result.matches[0].contentSnippet).toBe('string');
      }
    });
  });

  describe('DebateState Support', () => {
    it('should search state.rounds when DebateState is provided', () => {
      const mockState = new DebateState();
      mockState.id = DEBATE_ID_TEST;
      mockState.problem = PROBLEM_DESIGN_SYSTEM;
      mockState.status = DEBATE_STATUS.RUNNING;
      mockState.currentRound = ROUND_NUMBER_2;
      mockState.rounds = [
        {
          roundNumber: ROUND_NUMBER_1,
          contributions: [
            {
              agentId: AGENT_ID_1,
              agentRole: AGENT_ROLE_ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: CONTENT_PROPOSAL_AUTH,
              metadata: {},
            } as Contribution,
          ],
          timestamp: new Date(),
        },
      ];
      mockState.createdAt = new Date();
      mockState.updatedAt = new Date();

      const contextWithoutHistory: DebateContext = {
        problem: PROBLEM_DESIGN_SYSTEM,
      };

      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_AUTHENTICATION }, contextWithoutHistory, mockState);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain(SEARCH_TERM_AUTHENTICATION);
    });

    it('should prefer state.rounds over context.history when both provided', () => {
      const mockState = new DebateState();
      mockState.id = DEBATE_ID_TEST_DEBATE;
      mockState.problem = PROBLEM_DESIGN_SYSTEM;
      mockState.status = DEBATE_STATUS.RUNNING;
      mockState.currentRound = ROUND_NUMBER_1;
      mockState.rounds = [
        {
          roundNumber: ROUND_NUMBER_1,
          contributions: [
            {
              agentId: AGENT_ID_1,
              agentRole: AGENT_ROLE_ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: CONTENT_STATE_ROUNDS_DATABASE,
              metadata: {},
            } as Contribution,
          ],
          timestamp: new Date(),
        },
      ];
      mockState.createdAt = new Date();
      mockState.updatedAt = new Date();

      const contextWithDifferentHistory: DebateContext = {
        problem: PROBLEM_DESIGN_SYSTEM,
        history: [
          {
            roundNumber: ROUND_NUMBER_1,
            contributions: [
              {
                agentId: AGENT_ID_2,
                agentRole: AGENT_ROLE_PERFORMANCE,
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: CONTENT_CONTEXT_HISTORY_CACHING,
                metadata: {},
              } as Contribution,
            ],
            timestamp: new Date(),
          },
        ],
      };

      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_DATABASE }, contextWithDifferentHistory, mockState);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain(SEARCH_TERM_DATABASE);
      expect(parsed.result.matches[0].contentSnippet).not.toContain(SEARCH_TERM_CACHING);
    });

    it('should fall back to context.history when state not provided (backward compatibility)', () => {
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_CACHING }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain(SEARCH_TERM_CACHING);
    });

    it('should return empty matches when neither state.rounds nor context.history available', () => {
      const contextWithoutHistory: DebateContext = {
        problem: PROBLEM_TEST,
      };

      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, contextWithoutHistory);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });

    it('should return empty matches when state.rounds is empty array', () => {
      const mockState = new DebateState();
      mockState.id = DEBATE_ID_TEST;
      mockState.problem = PROBLEM_DESIGN_SYSTEM;
      mockState.status = DEBATE_STATUS.RUNNING;
      mockState.currentRound = 0;
      mockState.rounds = [];
      mockState.createdAt = new Date();
      mockState.updatedAt = new Date();
      const contextWithoutHistory: DebateContext = { problem: PROBLEM_TEST };
      const result = tool.execute({ [PARAM_NAME_TERM]: SEARCH_TERM_TEST }, contextWithoutHistory, mockState);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.matches).toEqual([]);
    });
  });
});

