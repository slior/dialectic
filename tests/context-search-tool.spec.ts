import { ContextSearchTool } from '../src/tools/context-search-tool';
import { DebateContext, DebateRound, Contribution, CONTRIBUTION_TYPES, DebateState, DEBATE_STATUS } from '../src/types/debate.types';

describe('ContextSearchTool', () => {
  let tool: ContextSearchTool;
  let mockContext: DebateContext;

  beforeEach(() => {
    tool = new ContextSearchTool();
    
    const round1: DebateRound = {
      roundNumber: 1,
      contributions: [
        {
          agentId: 'agent1',
          agentRole: 'architect',
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'This is a proposal about caching systems',
          metadata: {},
        } as Contribution,
        {
          agentId: 'agent2',
          agentRole: 'performance',
          type: CONTRIBUTION_TYPES.CRITIQUE,
          content: 'The caching approach needs optimization',
          metadata: {},
        } as Contribution,
      ],
      timestamp: new Date(),
    };

    const round2: DebateRound = {
      roundNumber: 2,
      contributions: [
        {
          agentId: 'agent1',
          agentRole: 'architect',
          type: CONTRIBUTION_TYPES.REFINEMENT,
          content: 'Refined proposal with better caching strategy',
          metadata: {},
        } as Contribution,
      ],
      timestamp: new Date(),
    };

    mockContext = {
      problem: 'Design a caching system',
      history: [round1, round2],
    };
  });

  describe('Tool Schema', () => {
    it('should match OpenAI function calling format', () => {
      const schema = tool.schema;
      expect(schema.name).toBe('context_search');
      expect(schema.description).toContain('Search');
      expect(schema.parameters.type).toBe('object');
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.properties?.term).toBeDefined();
      expect(schema.parameters.properties?.term?.type).toBe('string');
    });
  });

  describe('Tool Execution', () => {
    it('should search for term in debate history (success case)', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result).toBeDefined();
      expect(parsed.result.matches).toBeDefined();
      expect(Array.isArray(parsed.result.matches)).toBe(true);
    });

    it('should find multiple matches across rounds', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.result.matches.length).toBeGreaterThan(1);
    });

    it('should return matches with correct metadata', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      const parsed = JSON.parse(result);
      
      const match = parsed.result.matches[0];
      expect(match.roundNumber).toBeDefined();
      expect(match.agentId).toBeDefined();
      expect(match.agentRole).toBeDefined();
      expect(match.type).toBeDefined();
      expect(match.contentSnippet).toBeDefined();
    });

    it('should perform case-insensitive search', () => {
      const result1 = tool.execute({ term: 'CACHING' }, mockContext);
      const result2 = tool.execute({ term: 'caching' }, mockContext);
      
      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);
      
      expect(parsed1.result.matches.length).toBe(parsed2.result.matches.length);
    });

    it('should find substring matches', () => {
      const result = tool.execute({ term: 'cach' }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.result.matches.length).toBeGreaterThan(0);
    });

    it('should return empty matches when no results found', () => {
      const result = tool.execute({ term: 'nonexistentterm12345' }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches).toEqual([]);
    });
  });

  describe('Error Cases', () => {
    it('should handle missing context gracefully', () => {
      const result = tool.execute({ term: 'test' }, undefined);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('error');
      expect(parsed.error).toBeDefined();
    });

    it('should handle context without history', () => {
      const contextWithoutHistory: DebateContext = {
        problem: 'Test problem',
      };
      
      const result = tool.execute({ term: 'test' }, contextWithoutHistory);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches).toEqual([]);
    });

    it('should handle invalid arguments', () => {
      const result = tool.execute({ invalid: 'arg' } as any, mockContext);
      const parsed = JSON.parse(result);
      
      // Should either error or return empty results
      expect(parsed.status).toBeDefined();
    });
  });

  describe('Result Formatting', () => {
    it('should return JSON string with status and result', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('result');
    });

    it('should include content snippets in matches', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      const parsed = JSON.parse(result);
      
      if (parsed.result.matches.length > 0) {
        expect(parsed.result.matches[0].contentSnippet).toBeDefined();
        expect(typeof parsed.result.matches[0].contentSnippet).toBe('string');
      }
    });
  });

  describe('DebateState Support', () => {
    it('should search state.rounds when DebateState is provided', () => {
      const mockState: DebateState = {
        id: 'test-debate',
        problem: 'Design a system',
        status: DEBATE_STATUS.RUNNING,
        currentRound: 2,
        rounds: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'This proposal mentions authentication systems',
                metadata: {},
              } as Contribution,
            ],
            timestamp: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const contextWithoutHistory: DebateContext = {
        problem: 'Design a system',
      };

      const result = tool.execute({ term: 'authentication' }, contextWithoutHistory, mockState);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain('authentication');
    });

    it('should prefer state.rounds over context.history when both provided', () => {
      const mockState: DebateState = {
        id: 'test-debate',
        problem: 'Design a system',
        status: DEBATE_STATUS.RUNNING,
        currentRound: 1,
        rounds: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent1',
                agentRole: 'architect',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'State rounds content with database term',
                metadata: {},
              } as Contribution,
            ],
            timestamp: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const contextWithDifferentHistory: DebateContext = {
        problem: 'Design a system',
        history: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: 'agent2',
                agentRole: 'performance',
                type: CONTRIBUTION_TYPES.PROPOSAL,
                content: 'Context history content with caching term',
                metadata: {},
              } as Contribution,
            ],
            timestamp: new Date(),
          },
        ],
      };

      const result = tool.execute({ term: 'database' }, contextWithDifferentHistory, mockState);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain('database');
      expect(parsed.result.matches[0].contentSnippet).not.toContain('caching');
    });

    it('should fall back to context.history when state not provided (backward compatibility)', () => {
      const result = tool.execute({ term: 'caching' }, mockContext);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches.length).toBeGreaterThan(0);
      expect(parsed.result.matches[0].contentSnippet).toContain('caching');
    });

    it('should return empty matches when neither state.rounds nor context.history available', () => {
      const contextWithoutHistory: DebateContext = {
        problem: 'Test problem',
      };

      const result = tool.execute({ term: 'test' }, contextWithoutHistory);
      const parsed = JSON.parse(result);
      
      expect(parsed.status).toBe('success');
      expect(parsed.result.matches).toEqual([]);
    });
  });
});

