import { Agent } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, ORCHESTRATOR_TYPES, TERMINATION_TYPES, SYNTHESIS_METHODS } from '../types/debate.types';
import { AgentRole, AGENT_ROLES } from '../types/agent.types';
import { TracingContext } from '../types/tracing.types';
import { OrchestratorHooks } from './orchestrator';
import { DebateOrchestrator } from './orchestrator';
import { StateMachineOrchestrator } from '../state-machine/state-machine-orchestrator';
import { createOrchestrator, OrchestratorFactoryParams } from './orchestrator-factory';

// Mock the orchestrator classes
jest.mock('./orchestrator');
jest.mock('../state-machine/state-machine-orchestrator');
jest.mock('../utils/console', () => ({ writeStderr: jest.fn() }));

// Test constants
const DEFAULT_TIMEOUT_MS = 300000;

// Mock implementations
const MockDebateOrchestrator = DebateOrchestrator as jest.MockedClass<typeof DebateOrchestrator>;
const MockStateMachineOrchestrator = StateMachineOrchestrator as jest.MockedClass<typeof StateMachineOrchestrator>;

function createMockAgent(id: string, role: AgentRole): Agent {
  return {
    config: { id, role, model: 'gpt-4', name: `${role} agent` },
    propose: async () => ({ content: `${role} proposal`, metadata: {} }),
    critique: async () => ({ content: `${role} critique`, metadata: {} }),
    refine: async () => ({ content: `${role} refined`, metadata: {} }),
    shouldSummarize: () => false,
    prepareContext: async () => ({ context: { problem: '', history: [] } }),
    askClarifyingQuestions: async () => ({ questions: [] }),
  } as unknown as Agent;
}

function createMockJudge(): JudgeAgent {
  return {
    synthesize: async () => ({
      description: 'final',
      tradeoffs: [],
      recommendations: [],
      confidence: 80,
      synthesizedBy: 'judge',
    }),
    prepareContext: async () => ({ context: { problem: '', history: [] } }),
  } as unknown as JudgeAgent;
}

function createMockStateManager(): StateManager {
  return {
    createDebate: jest.fn(),
    getDebate: jest.fn(),
    setClarifications: jest.fn(),
  } as unknown as StateManager;
}

function createDefaultConfig(overrides?: Partial<DebateConfig>): DebateConfig {
  return {
    rounds: 3,
    terminationCondition: { type: TERMINATION_TYPES.FIXED },
    synthesisMethod: SYNTHESIS_METHODS.JUDGE,
    includeFullHistory: true,
    timeoutPerRound: DEFAULT_TIMEOUT_MS,
    ...overrides,
  };
}

function createFactoryParams(overrides?: Partial<OrchestratorFactoryParams>): OrchestratorFactoryParams {
  return {
    agents: [createMockAgent('agent-1', AGENT_ROLES.ARCHITECT)],
    judge: createMockJudge(),
    stateManager: createMockStateManager(),
    config: createDefaultConfig(),
    ...overrides,
  };
}

describe('createOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockDebateOrchestrator.mockImplementation(() => ({} as DebateOrchestrator));
    MockStateMachineOrchestrator.mockImplementation(() => ({} as StateMachineOrchestrator));
  });

  describe('Orchestrator Type Selection', () => {
    it('should return DebateOrchestrator when orchestratorType is classic', () => {
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
      });

      const result = createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledTimes(1);
      expect(MockStateMachineOrchestrator).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(Object);
    });

    it('should return StateMachineOrchestrator when orchestratorType is state-machine', () => {
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
      });

      const result = createOrchestrator(params);

      expect(MockStateMachineOrchestrator).toHaveBeenCalledTimes(1);
      expect(MockDebateOrchestrator).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(Object);
    });

    it('should return DebateOrchestrator when orchestratorType is undefined (defaults to classic)', () => {
      const params = createFactoryParams({
        config: createDefaultConfig(),
      });

      const result = createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledTimes(1);
      expect(MockStateMachineOrchestrator).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(Object);
    });

    it('should emit orchestrator type to stderr when creating orchestrator', () => {
      const { writeStderr } = require('../utils/console');
      (writeStderr as jest.Mock).mockClear();
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
      });

      createOrchestrator(params);

      expect(writeStderr).toHaveBeenCalledWith('Orchestrator type: state-machine\n');
    });
  });

  describe('Factory Function Parameters', () => {
    it('should create DebateOrchestrator with all required parameters', () => {
      const agents = [createMockAgent('agent-1', AGENT_ROLES.ARCHITECT)];
      const judge = createMockJudge();
      const stateManager = createMockStateManager();
      const config = createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC });

      createOrchestrator({ agents, judge, stateManager, config });

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        agents,
        judge,
        stateManager,
        config,
        undefined,
        undefined,
        undefined
      );
    });

    it('should create StateMachineOrchestrator with all required parameters', () => {
      const agents = [createMockAgent('agent-1', AGENT_ROLES.ARCHITECT)];
      const judge = createMockJudge();
      const stateManager = createMockStateManager();
      const config = createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE });

      createOrchestrator({ agents, judge, stateManager, config });

      expect(MockStateMachineOrchestrator).toHaveBeenCalledWith(
        agents,
        judge,
        stateManager,
        config,
        undefined,
        undefined,
        undefined,
        undefined
      );
    });

    it('should pass optional hooks parameter correctly to DebateOrchestrator', () => {
      const hooks: OrchestratorHooks = {
        onRoundStart: jest.fn(),
        onPhaseComplete: jest.fn(),
      };
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
        hooks,
      });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        hooks,
        undefined,
        undefined
      );
    });

    it('should pass optional hooks parameter correctly to StateMachineOrchestrator', () => {
      const hooks: OrchestratorHooks = {
        onRoundStart: jest.fn(),
        onPhaseComplete: jest.fn(),
      };
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
        hooks,
      });

      createOrchestrator(params);

      expect(MockStateMachineOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        hooks,
        undefined,
        undefined,
        undefined
      );
    });

    it('should pass optional tracingContext parameter correctly to DebateOrchestrator', () => {
      const tracingContext: TracingContext = {
        langfuse: {} as any,
        trace: {} as any,
        currentSpans: new Map(),
      };
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
        tracingContext,
      });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        undefined,
        tracingContext,
        undefined
      );
    });

    it('should pass optional tracingContext parameter correctly to StateMachineOrchestrator', () => {
      const tracingContext: TracingContext = {
        langfuse: {} as any,
        trace: {} as any,
        currentSpans: new Map(),
      };
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
        tracingContext,
      });

      createOrchestrator(params);

      expect(MockStateMachineOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        undefined,
        tracingContext,
        undefined,
        undefined
      );
    });

    it('should pass optional contextDirectory parameter correctly to DebateOrchestrator', () => {
      const contextDirectory = '/path/to/context';
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
        contextDirectory,
      });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        undefined,
        undefined,
        contextDirectory
      );
    });

    it('should pass optional contextDirectory parameter correctly to StateMachineOrchestrator', () => {
      const contextDirectory = '/path/to/context';
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
        contextDirectory,
      });

      createOrchestrator(params);

      expect(MockStateMachineOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        undefined,
        undefined,
        contextDirectory,
        undefined
      );
    });

    it('should create orchestrator with minimal required parameters (no optional params)', () => {
      const agents = [createMockAgent('agent-1', AGENT_ROLES.ARCHITECT)];
      const judge = createMockJudge();
      const stateManager = createMockStateManager();
      const config = createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC });

      createOrchestrator({ agents, judge, stateManager, config });

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        agents,
        judge,
        stateManager,
        config,
        undefined,
        undefined,
        undefined
      );
    });

    it('should pass all optional parameters correctly to DebateOrchestrator', () => {
      const hooks: OrchestratorHooks = { onRoundStart: jest.fn() };
      const tracingContext: TracingContext = { langfuse: {} as any, trace: {} as any, currentSpans: new Map() };
      const contextDirectory = '/path/to/context';
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
        hooks,
        tracingContext,
        contextDirectory,
      });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        hooks,
        tracingContext,
        contextDirectory
      );
    });

    it('should pass all optional parameters correctly to StateMachineOrchestrator', () => {
      const hooks: OrchestratorHooks = { onRoundStart: jest.fn() };
      const tracingContext: TracingContext = { langfuse: {} as any, trace: {} as any, currentSpans: new Map() };
      const contextDirectory = '/path/to/context';
      const params = createFactoryParams({
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.STATE_MACHINE }),
        hooks,
        tracingContext,
        contextDirectory,
      });

      createOrchestrator(params);

      expect(MockStateMachineOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        hooks,
        tracingContext,
        contextDirectory,
        undefined
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty agents array (validation happens in orchestrator itself)', () => {
      const params = createFactoryParams({
        agents: [],
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
      });

      // Should not throw - validation happens in orchestrator
      expect(() => createOrchestrator(params)).not.toThrow();
      expect(MockDebateOrchestrator).toHaveBeenCalled();
    });

    it('should handle config with only required fields', () => {
      const config: DebateConfig = {
        rounds: 1,
        terminationCondition: { type: TERMINATION_TYPES.FIXED },
        synthesisMethod: SYNTHESIS_METHODS.JUDGE,
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
      };
      const params = createFactoryParams({ config });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalled();
    });

    it('should handle config with all optional fields set', () => {
      const config = createDefaultConfig({
        orchestratorType: ORCHESTRATOR_TYPES.CLASSIC,
        clarificationsMaxPerAgent: 5,
        clarificationsMaxIterations: 3,
        summarization: {
          enabled: true,
          threshold: 5000,
          maxLength: 2500,
          method: 'length-based',
        },
      });
      const params = createFactoryParams({ config });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
        config,
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle multiple agents', () => {
      const agents = [
        createMockAgent('agent-1', AGENT_ROLES.ARCHITECT),
        createMockAgent('agent-2', AGENT_ROLES.PERFORMANCE),
        createMockAgent('agent-3', AGENT_ROLES.SECURITY),
      ];
      const params = createFactoryParams({
        agents,
        config: createDefaultConfig({ orchestratorType: ORCHESTRATOR_TYPES.CLASSIC }),
      });

      createOrchestrator(params);

      expect(MockDebateOrchestrator).toHaveBeenCalledWith(
        agents,
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        undefined,
        undefined,
        undefined
      );
    });
  });
});
