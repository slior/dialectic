import { StateMachineOrchestrator } from './state-machine-orchestrator';
import { Agent } from '../core/agent';
import { JudgeAgent } from '../core/judge';
import { StateManager } from '../core/state-manager';
import {
  DebateConfig,
  DebateState,
  DEBATE_STATUS,
  EXECUTION_STATUS,
  SUSPEND_REASON,
  type AgentClarifications,
} from '../types/debate.types';
import { NodeResultImpl } from './node';
import { DEBATE_EVENTS, createEvent } from './events';
import { NODE_TYPES, type NodeType } from './types';
import type { DebateNode, NodeContext } from './node';
import type { TracingContext } from '../types/tracing.types';

function createMockState(overrides: Partial<DebateState> = {}): DebateState {
  const state = new DebateState();
  state.id = 'debate-1';
  state.problem = 'Test problem';
  state.status = DEBATE_STATUS.RUNNING;
  state.currentRound = 0;
  state.rounds = [];
  state.createdAt = new Date();
  state.updatedAt = new Date();
  return Object.assign(state, overrides);
}

function createNodeResult(eventType: keyof typeof DEBATE_EVENTS, updatedContext?: Partial<NodeContext>) {
  return NodeResultImpl.createResult(createEvent(eventType), updatedContext);
}

function createMockStateManager(initialState: DebateState): jest.Mocked<StateManager> {
  const store = new Map<string, DebateState>();
  store.set(initialState.id, initialState);
  return {
    createDebate: jest.fn().mockResolvedValue(initialState),
    getDebate: jest.fn().mockImplementation((id: string) => Promise.resolve(store.get(id) ?? null)),
    setClarifications: jest.fn().mockImplementation((_id: string, clarifications: AgentClarifications[]) => {
      const s = store.get(initialState.id);
      if (s) s.clarifications = clarifications;
      return Promise.resolve();
    }),
    setSuspendState: jest.fn().mockImplementation((id: string, node: string | undefined) => {
      const s = store.get(id);
      if (s) {
        if (node !== undefined) {
          s.suspendedAtNode = node;
          s.suspendedAt = new Date();
        } else {
          delete (s as Partial<DebateState>).suspendedAtNode;
          delete (s as Partial<DebateState>).suspendedAt;
        }
      }
      return Promise.resolve();
    }),
    clearSuspendState: jest.fn().mockImplementation((id: string) => {
      const s = store.get(id);
      if (s) {
        delete (s as Partial<DebateState>).suspendedAtNode;
        delete (s as Partial<DebateState>).suspendedAt;
      }
      return Promise.resolve();
    }),
  } as unknown as jest.Mocked<StateManager>;
}

const defaultConfig: DebateConfig = {
  rounds: 3,
  terminationCondition: { type: 'fixed' as const },
  synthesisMethod: 'judge',
  includeFullHistory: false,
  timeoutPerRound: 300000,
};

function createMockNode(executeFn: jest.Mock): DebateNode {
  return {
    nodeType: NODE_TYPES.INITIALIZATION,
    execute: executeFn,
  };
}

describe('StateMachineOrchestrator', () => {
  const mockAgents: Agent[] = [];
  const mockJudge = {} as JudgeAgent;

  describe('constructor', () => {
    it('should create graph and nodes', () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      expect(orchestrator).toBeDefined();
    });

    it('should accept optional tracingContext and contextDirectory', () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const tracingContext = { traceId: 'trace-1' } as unknown as TracingContext;
      const contextDirectory = '/path/to/context';
      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig,
        undefined,
        tracingContext,
        contextDirectory
      );
      expect(orchestrator).toBeDefined();
    });

    it('should accept optional logger', () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const logger = jest.fn();
      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig,
        undefined,
        undefined,
        undefined,
        logger
      );
      expect(orchestrator).toBeDefined();
    });
  });

  describe('runDebate', () => {
    it('should create debate and execute from INITIALIZATION', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);

      const finalState = createMockState({
        id: state.id,
        finalSolution: {
          description: 'Solution',
          tradeoffs: [],
          recommendations: [],
          confidence: 80,
          synthesizedBy: 'judge',
        },
        rounds: [],
      });
      stateManager.getDebate = jest.fn().mockResolvedValue(finalState);

      const result = await orchestrator.runDebate('Problem');

      expect(stateManager.createDebate).toHaveBeenCalledWith('Problem', undefined, undefined);
      expect(result.status).toBe(EXECUTION_STATUS.COMPLETED);
      expect(result.result?.debateId).toBe(state.id);
      expect(result.result?.solution).toEqual(finalState.finalSolution);
    });

    it('should pass context and debateId to createDebate', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const finalState = createMockState({
        id: state.id,
        finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
        rounds: [],
      });
      stateManager.getDebate = jest.fn().mockResolvedValue(finalState);

      await orchestrator.runDebate('Problem', 'Extra context', undefined, 'custom-id');

      expect(stateManager.createDebate).toHaveBeenCalledWith('Problem', 'Extra context', 'custom-id');
    });

    it('should not call setClarifications when clarifications are undefined', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      stateManager.getDebate = jest.fn().mockResolvedValue(
        createMockState({
          id: state.id,
          finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
          rounds: [],
        })
      );

      await orchestrator.runDebate('Problem', undefined, undefined);

      expect(stateManager.setClarifications).not.toHaveBeenCalled();
    });

    it('should not call setClarifications when clarifications is empty array', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      stateManager.getDebate = jest.fn().mockResolvedValue(
        createMockState({
          id: state.id,
          finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
          rounds: [],
        })
      );

      await orchestrator.runDebate('Problem', undefined, []);

      expect(stateManager.setClarifications).not.toHaveBeenCalled();
    });

    it('should not call setClarifications when all clarification items are empty', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      stateManager.getDebate = jest.fn().mockResolvedValue(
        createMockState({
          id: state.id,
          finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
          rounds: [],
        })
      );

      await orchestrator.runDebate('Problem', undefined, [
        { agentId: 'a1', agentName: 'A', role: 'architect', items: [] },
      ]);

      expect(stateManager.setClarifications).not.toHaveBeenCalled();
    });

    it('should call setClarifications when clarifications have items', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      stateManager.getDebate = jest.fn().mockResolvedValue(
        createMockState({
          id: state.id,
          finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
          rounds: [],
        })
      );

      const clarifications: AgentClarifications[] = [
        {
          agentId: 'a1',
          agentName: 'A',
          role: 'architect',
          items: [{ id: 'q1', question: 'Q?', answer: 'A' }],
        },
      ];
      await orchestrator.runDebate('Problem', undefined, clarifications);

      expect(stateManager.setClarifications).toHaveBeenCalledWith(state.id, clarifications);
    });
  });

  describe('executeFromNode (via runDebate)', () => {
    it('should throw when debate not found at start', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      stateManager.getDebate = jest.fn().mockResolvedValue(null);

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );

      await expect(orchestrator.runDebate('Problem')).rejects.toThrow('Debate debate-1 not found');
    });

    it('should throw when node not found', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      stateManager.getDebate = jest.fn().mockResolvedValue(state);

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      const executeFromNode = (orchestrator as unknown as { executeFromNode: (id: string, node: NodeType) => Promise<unknown> }).executeFromNode.bind(orchestrator);

      await expect(executeFromNode(state.id, 'invalid_node' as NodeType)).rejects.toThrow(
        'Node not found: invalid_node'
      );
    });

    it('should return suspended when node emits WAITING_FOR_INPUT', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const clarificationInputExecute = jest
        .fn()
        .mockResolvedValue(createNodeResult('WAITING_FOR_INPUT'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.CLARIFICATION_INPUT, createMockNode(clarificationInputExecute)],
      ]);
      const executeFromNode = (orchestrator as unknown as { executeFromNode: (id: string, node: NodeType) => Promise<unknown> }).executeFromNode.bind(orchestrator);

      const suspendedState = createMockState({
        id: state.id,
        clarifications: [{ agentId: 'a1', agentName: 'A', role: 'architect', items: [] }],
        clarificationIterations: 1,
      });
      stateManager.getDebate = jest.fn().mockResolvedValue(suspendedState);

      const result = await executeFromNode(state.id, NODE_TYPES.CLARIFICATION_INPUT);

      expect(result).toEqual({
        status: EXECUTION_STATUS.SUSPENDED,
        suspendReason: SUSPEND_REASON.WAITING_FOR_INPUT,
        suspendPayload: {
          debateId: state.id,
          questions: suspendedState.clarifications ?? [],
          iteration: suspendedState.clarificationIterations ?? 1,
        },
      });
      expect(stateManager.setSuspendState).toHaveBeenCalledWith(
        state.id,
        NODE_TYPES.CLARIFICATION_INPUT,
        expect.any(Date)
      );
    });

    it('should throw when getDebate returns null after suspend', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const clarificationInputExecute = jest
        .fn()
        .mockResolvedValue(createNodeResult('WAITING_FOR_INPUT'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.CLARIFICATION_INPUT, createMockNode(clarificationInputExecute)],
      ]);
      const executeFromNode = (orchestrator as unknown as { executeFromNode: (id: string, node: NodeType) => Promise<unknown> }).executeFromNode.bind(orchestrator);
      const suspendedState = createMockState({ id: state.id });
      stateManager.getDebate = jest.fn()
        .mockResolvedValueOnce(suspendedState)
        .mockResolvedValueOnce(null);

      await expect(executeFromNode(state.id, NODE_TYPES.CLARIFICATION_INPUT)).rejects.toThrow(
        'Debate debate-1 not found after suspend'
      );
    });

    it('should not update context state when getDebate returns null in loop', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const finalState = createMockState({
        id: state.id,
        finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
        rounds: [],
      });
      let callCount = 0;
      stateManager.getDebate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.resolve(null);
        return Promise.resolve(finalState);
      });

      const result = await orchestrator.runDebate('Problem');
      expect(result.status).toBe(EXECUTION_STATUS.COMPLETED);
    });

    it('should not set state when nextNode is null and terminalState has no finalSolution', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const stateWithoutSolution = createMockState({ id: state.id, rounds: [] });
      let getDebateCalls = 0;
      stateManager.getDebate = jest.fn().mockImplementation((_id: string) => {
        getDebateCalls++;
        if (getDebateCalls <= 4) return Promise.resolve(stateWithoutSolution);
        if (getDebateCalls === 5) return Promise.resolve(null);
        return Promise.resolve(
          createMockState({
            id: state.id,
            finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
            rounds: [],
          })
        );
      });

      const result = await orchestrator.runDebate('Problem');
      expect(result.status).toBe(EXECUTION_STATUS.COMPLETED);
    });

    it('should throw when validateFinalState gets null', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const finalStateWithSolution = createMockState({
        id: state.id,
        finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
        rounds: [],
      });
      let getDebateCallCount = 0;
      stateManager.getDebate = jest.fn().mockImplementation(() => {
        getDebateCallCount++;
        if (getDebateCallCount <= 6) return Promise.resolve(finalStateWithSolution);
        return Promise.resolve(null);
      });

      await expect(orchestrator.runDebate('Problem')).rejects.toThrow(
        'Debate debate-1 not found after completion'
      );
    });

    it('should throw when validateFinalState gets state without finalSolution', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const stateNoSolution = createMockState({ id: state.id, rounds: [] });
      stateManager.getDebate = jest.fn().mockResolvedValue(stateNoSolution);

      await expect(orchestrator.runDebate('Problem')).rejects.toThrow(
        'Debate debate-1 completed without final solution'
      );
    });
  });

  describe('resume', () => {
    it('should throw when debate not found', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      stateManager.getDebate = jest.fn().mockResolvedValue(null);

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );

      await expect(
        orchestrator.resume('debate-1', [
          { agentId: 'a1', agentName: 'A', role: 'architect', items: [] },
        ])
      ).rejects.toThrow('Debate debate-1 not found');
    });

    it('should throw when debate is not suspended', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      stateManager.getDebate = jest.fn().mockResolvedValue(state);

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );

      await expect(
        orchestrator.resume('debate-1', [
          { agentId: 'a1', agentName: 'A', role: 'architect', items: [] },
        ])
      ).rejects.toThrow('Debate debate-1 is not suspended');
    });

    it('should set clarifications, clear suspend state, and execute from suspended node', async () => {
      const state = createMockState({
        suspendedAtNode: NODE_TYPES.CLARIFICATION_INPUT,
        suspendedAt: new Date(),
      });
      const stateManager = createMockStateManager(state);
      const clarificationInputExecute = jest.fn().mockResolvedValue(createNodeResult('ANSWERS_SUBMITTED'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.CLARIFICATION_INPUT, createMockNode(clarificationInputExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const finalState = createMockState({
        id: state.id,
        finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
        rounds: [],
      });
      let getDebateResumeCallCount = 0;
      stateManager.getDebate = jest.fn().mockImplementation(() => {
        getDebateResumeCallCount++;
        if (getDebateResumeCallCount === 1) return Promise.resolve(state);
        return Promise.resolve(finalState);
      });

      const answers: AgentClarifications[] = [
        {
          agentId: 'a1',
          agentName: 'A',
          role: 'architect',
          items: [{ id: 'q1', question: 'Q?', answer: 'A' }],
        },
      ];
      const result = await orchestrator.resume('debate-1', answers);

      expect(stateManager.setClarifications).toHaveBeenCalledWith('debate-1', answers);
      expect(stateManager.clearSuspendState).toHaveBeenCalledWith('debate-1');
      expect(result.status).toBe(EXECUTION_STATUS.COMPLETED);
    });
  });

  describe('createNodeContext (via node execution)', () => {
    it('should include tracingContext and contextDirectory when provided', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const tracingContext = { traceId: 't1' } as unknown as TracingContext;
      const contextDirectory = '/ctx';
      const initExecute = jest.fn().mockImplementation((ctx: NodeContext) => {
        expect(ctx.tracingContext).toEqual(tracingContext);
        expect(ctx.contextDirectory).toBe(contextDirectory);
        return Promise.resolve(createNodeResult('START'));
      });
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig,
        undefined,
        tracingContext,
        contextDirectory
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      stateManager.getDebate = jest.fn().mockResolvedValue(
        createMockState({
          id: state.id,
          finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
          rounds: [],
        })
      );

      await orchestrator.runDebate('Problem');
      expect(initExecute).toHaveBeenCalled();
    });
  });

  describe('completed result metadata', () => {
    it('should return result with rounds and durationMs', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const initExecute = jest.fn().mockResolvedValue(createNodeResult('START'));
      const clarificationExecute = jest.fn().mockResolvedValue(createNodeResult('ALL_CLEAR'));
      const roundManagerExecute = jest.fn().mockResolvedValue(createNodeResult('MAX_ROUNDS_REACHED'));
      const synthesisExecute = jest.fn().mockResolvedValue(createNodeResult('COMPLETE'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.INITIALIZATION, createMockNode(initExecute)],
        [NODE_TYPES.CLARIFICATION, createMockNode(clarificationExecute)],
        [NODE_TYPES.ROUND_MANAGER, createMockNode(roundManagerExecute)],
        [NODE_TYPES.SYNTHESIS, createMockNode(synthesisExecute)],
      ]);
      const rounds = [
        {
          roundNumber: 1,
          contributions: [],
          summary: undefined,
          startTime: new Date(),
          endTime: new Date(),
          timestamp: new Date(),
        },
      ];
      const finalState = createMockState({
        id: state.id,
        finalSolution: { description: 'S', tradeoffs: [], recommendations: [], confidence: 90, synthesizedBy: 'judge' },
        rounds,
      });
      stateManager.getDebate = jest.fn().mockResolvedValue(finalState);

      const result = await orchestrator.runDebate('Problem');

      expect(result.status).toBe(EXECUTION_STATUS.COMPLETED);
      expect(result.result?.rounds).toEqual(rounds);
      expect(result.result?.metadata.totalRounds).toBe(1);
      expect(typeof result.result?.metadata.durationMs).toBe('number');
    });
  });

  describe('suspend payload with undefined clarifications', () => {
    it('should use empty array and iteration 1 when clarifications/clarificationIterations missing', async () => {
      const state = createMockState();
      const stateManager = createMockStateManager(state);
      const clarificationInputExecute = jest
        .fn()
        .mockResolvedValue(createNodeResult('WAITING_FOR_INPUT'));

      const orchestrator = new StateMachineOrchestrator(
        mockAgents,
        mockJudge,
        stateManager,
        defaultConfig
      );
      (orchestrator as unknown as { nodes: Map<NodeType, DebateNode> }).nodes = new Map([
        [NODE_TYPES.CLARIFICATION_INPUT, createMockNode(clarificationInputExecute)],
      ]);
      const executeFromNode = (orchestrator as unknown as { executeFromNode: (id: string, node: NodeType) => Promise<unknown> }).executeFromNode.bind(orchestrator);
      const suspendedState = createMockState({ id: state.id });
      delete (suspendedState as Partial<DebateState>).clarifications;
      delete (suspendedState as Partial<DebateState>).clarificationIterations;
      stateManager.getDebate = jest.fn().mockResolvedValue(suspendedState);

      const result = await executeFromNode(state.id, NODE_TYPES.CLARIFICATION_INPUT);

      expect(result).toMatchObject({
        status: EXECUTION_STATUS.SUSPENDED,
        suspendReason: SUSPEND_REASON.WAITING_FOR_INPUT,
        suspendPayload: {
          debateId: state.id,
          questions: [],
          iteration: 1,
        },
      });
    });
  });
});
