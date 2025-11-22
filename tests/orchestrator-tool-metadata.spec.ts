import { DebateOrchestrator } from '../src/core/orchestrator';
import { DebateConfig, DebateRound, DebateState, CONTRIBUTION_TYPES } from '../src/types/debate.types';
import { Agent } from '../src/core/agent';
import { ToolCall, ToolResult } from '../src/types/tool.types';

function createMockAgent(id: string, role: any, toolCalls?: ToolCall[], toolResults?: ToolResult[], iterations?: number): Agent {
  return {
    config: { id, role, model: 'gpt-4', name: `${role} agent` },
    propose: async () => ({
      content: `${role} proposal`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
    critique: async () => ({
      content: `${role} critique`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
    refine: async () => ({
      content: `${role} refined`,
      metadata: {
        toolCalls,
        toolResults,
        toolCallIterations: iterations,
      },
    }),
    shouldSummarize: () => false,
    prepareContext: async (context: any) => ({ context }),
    askClarifyingQuestions: async () => ({ questions: [] }),
  } as any;
}

const mockJudge = {
  synthesize: async (_problem: string, _rounds: DebateRound[]) => ({
    description: 'final',
    tradeoffs: [],
    recommendations: [],
    confidence: 80,
    synthesizedBy: 'judge',
  }),
  prepareContext: async (_rounds: DebateRound[]) => ({ context: { problem: '', history: [] } }),
} as any;

function createMockStateManager() {
  const state: DebateState = {
    id: 'deb-test',
    problem: 'Test problem',
    status: 'running',
    currentRound: 0,
    rounds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  return {
    createDebate: async (problem: string) => ({ ...state, problem }),
    beginRound: async (_id: string) => {
      const round = { roundNumber: state.rounds.length + 1, contributions: [], timestamp: new Date() } as DebateRound;
      state.rounds.push(round);
      state.currentRound = round.roundNumber;
      state.updatedAt = new Date();
      return round;
    },
    addContribution: async (_id: string, contrib: any) => {
      const round = state.rounds[state.currentRound - 1];
      if (!round) throw new Error('No active round');
      round.contributions.push(contrib);
      state.updatedAt = new Date();
    },
    addSummary: async (_id: string, _summary: any) => {
      const round = state.rounds[state.currentRound - 1];
      if (!round) throw new Error('No active round');
      if (!round.summaries) round.summaries = {};
      state.updatedAt = new Date();
    },
    addJudgeSummary: async (_id: string, _summary: any) => {
      state.updatedAt = new Date();
    },
    completeDebate: async (_id: string, _solution: any) => {
      state.status = 'completed';
      state.updatedAt = new Date();
    },
    getDebate: async (_id: string) => state,
  } as any;
}

describe('Orchestrator Tool Metadata', () => {
  let orchestrator: DebateOrchestrator;
  let stateManager: any;

  beforeEach(() => {
    stateManager = createMockStateManager();
  });

  describe('Tool Calls Extraction', () => {
    it('should extract tool calls from agent response', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];

      const agents = [createMockAgent('agent1', 'architect', toolCalls)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      const result = await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate(result.debateId);
      const contribution = debate.rounds[0]?.contributions[0];

      expect(contribution).toBeDefined();
      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolCalls).toEqual(toolCalls);
    });
  });

  describe('Tool Calls Storage', () => {
    it('should store tool calls in contribution metadata', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'context_search',
          arguments: '{"term":"test"}',
        },
      ];

      const agents = [createMockAgent('agent1', 'architect', toolCalls)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolCalls[0].name).toBe('context_search');
    });
  });

  describe('Tool Results Storage', () => {
    it('should store tool results in contribution metadata', async () => {
      const toolResults: ToolResult[] = [
        {
          tool_call_id: 'call_1',
          role: 'tool',
          content: '{"status":"success","result":{}}',
        },
      ];

      const agents = [createMockAgent('agent1', 'architect', undefined, toolResults)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolResults).toBeDefined();
      expect(contribution.metadata.toolResults[0].tool_call_id).toBe('call_1');
    });
  });

  describe('Tool Call Iterations Storage', () => {
    it('should store tool call iterations in contribution metadata', async () => {
      const agents = [createMockAgent('agent1', 'architect', undefined, undefined, 3)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const contribution = debate.rounds[0]?.contributions.find(
        (c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL
      );

      expect(contribution.metadata.toolCallIterations).toBe(3);
    });
  });

  describe('Tool Metadata Persistence', () => {
    it('should persist tool metadata in debate state', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];
      const toolResults: ToolResult[] = [
        {
          tool_call_id: 'call_1',
          role: 'tool',
          content: '{"status":"success"}',
        },
      ];

      const agents = [createMockAgent('agent1', 'architect', toolCalls, toolResults, 1)];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      const result = await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate(result.debateId);
      const contribution = debate.rounds[0]?.contributions[0];

      expect(contribution.metadata.toolCalls).toBeDefined();
      expect(contribution.metadata.toolResults).toBeDefined();
      expect(contribution.metadata.toolCallIterations).toBe(1);
    });

    it('should persist tool metadata across all phases', async () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'test_tool',
          arguments: '{}',
        },
      ];

      // Use multiple agents so critiques and refinements are generated
      const agents = [
        createMockAgent('agent1', 'architect', toolCalls),
        createMockAgent('agent2', 'performance', toolCalls),
      ];
      const cfg: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };

      orchestrator = new DebateOrchestrator(agents, mockJudge, stateManager, cfg);
      await orchestrator.runDebate('Test problem');

      const debate = await stateManager.getDebate('deb-test');
      const proposal = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.PROPOSAL);
      const critique = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.CRITIQUE);
      const refinement = debate.rounds[0]?.contributions.find((c: any) => c.type === CONTRIBUTION_TYPES.REFINEMENT);

      // All phases should have tool metadata if agent used tools
      expect(proposal?.metadata.toolCalls).toBeDefined();
      expect(critique?.metadata.toolCalls).toBeDefined();
      expect(refinement?.metadata.toolCalls).toBeDefined();
    });
  });
});

