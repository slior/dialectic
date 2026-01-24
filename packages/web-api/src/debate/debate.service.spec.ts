// Mock dialectic-core dependencies
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    logWarning: jest.fn(),
    StateManager: jest.fn(),
    DebateOrchestrator: jest.fn(),
    JudgeAgent: jest.fn(),
    RoleBasedAgent: {
      defaultSystemPrompt: jest.fn(),
      create: jest.fn(),
    },
    collectClarifications: jest.fn(),
    createProvider: jest.fn(),
    resolvePrompt: jest.fn(),
    buildToolRegistry: jest.fn(),
  };
});

import {
  StateManager,
  DebateOrchestrator,
  JudgeAgent,
  RoleBasedAgent,
  AgentConfig,
  DebateResult,
  AgentClarifications,
  Agent,
  AGENT_ROLES,
  LLM_PROVIDERS,
  TERMINATION_TYPES,
  SYNTHESIS_METHODS,
  PROMPT_SOURCES,
  createProvider,
  collectClarifications,
  resolvePrompt,
  buildToolRegistry,
  logWarning,
  LLMProvider,
} from 'dialectic-core';

import { DebateService } from './debate.service';

// Test constants
const DEFAULT_ROUNDS = 3;
const DEFAULT_LLM_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_AGENT_TEMPERATURE = 0.5;
const DEFAULT_JUDGE_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_PER_ROUND = 300000;
const DEFAULT_MAX_CLARIFICATIONS_PER_AGENT = 5;
const TEST_PROBLEM = 'Design a caching system';
const TEST_DEBATE_ID = 'deb-test-123';
const TEST_ROUNDS_OVERRIDE = 5;
const TEST_AGENT_ID_ARCHITECT = 'agent-architect';
const TEST_AGENT_ID_PERFORMANCE = 'agent-performance';
const TEST_AGENT_ID_KISS = 'agent-kiss';
const TEST_JUDGE_ID = 'judge-main';
const TEST_AGENT_NAME_ARCHITECT = 'System Architect';
const TEST_AGENT_NAME_PERFORMANCE = 'Performance Engineer';
const TEST_AGENT_NAME_KISS = 'Simplicity Advocate';
const TEST_JUDGE_NAME = 'Technical Judge';
const MOCK_SYSTEM_PROMPT = 'Mock system prompt';
const MOCK_PROVIDER = {} as unknown as LLMProvider;

/**
 * Creates mock agent configurations for testing.
 */
function createMockAgentConfigs(): AgentConfig[] {
  return [
    {
      id: TEST_AGENT_ID_ARCHITECT,
      name: TEST_AGENT_NAME_ARCHITECT,
      role: AGENT_ROLES.ARCHITECT,
      model: DEFAULT_LLM_MODEL,
      provider: LLM_PROVIDERS.OPENROUTER,
      temperature: DEFAULT_AGENT_TEMPERATURE,
      enabled: true,
    },
    {
      id: TEST_AGENT_ID_PERFORMANCE,
      name: TEST_AGENT_NAME_PERFORMANCE,
      role: AGENT_ROLES.PERFORMANCE,
      model: DEFAULT_LLM_MODEL,
      provider: LLM_PROVIDERS.OPENROUTER,
      temperature: DEFAULT_AGENT_TEMPERATURE,
      enabled: true,
    },
  ];
}

/**
 * Creates a mock StateManager instance.
 */
function createMockStateManager(): jest.Mocked<StateManager> {
  return {
    createDebate: jest.fn(),
    beginRound: jest.fn(),
    addContribution: jest.fn(),
    completeDebate: jest.fn(),
    getState: jest.fn(),
  } as unknown as jest.Mocked<StateManager>;
}

/**
 * Creates a mock DebateOrchestrator instance.
 */
function createMockDebateOrchestrator(): jest.Mocked<DebateOrchestrator> {
  const mockResult: DebateResult = {
    debateId: TEST_DEBATE_ID,
    solution: {
      description: 'Test solution',
      tradeoffs: [],
      recommendations: [],
      confidence: 80,
      synthesizedBy: TEST_JUDGE_ID,
    },
    rounds: [],
    metadata: {
      totalRounds: DEFAULT_ROUNDS,
      durationMs: 1000,
    },
  };

  return {
    runDebate: jest.fn().mockResolvedValue(mockResult),
  } as unknown as jest.Mocked<DebateOrchestrator>;
}

/**
 * Creates a mock Agent instance.
 */
function createMockAgent(id: string, role: string, name: string): Agent {
  return {
    config: { id, role, name, model: DEFAULT_LLM_MODEL },
    propose: jest.fn(),
    critique: jest.fn(),
    refine: jest.fn(),
    shouldSummarize: jest.fn(),
    prepareContext: jest.fn(),
    askClarifyingQuestions: jest.fn(),
  } as unknown as Agent;
}

/**
 * Creates a mock AgentClarifications array.
 */
function createMockAgentClarifications(): AgentClarifications[] {
  return [
    {
      agentId: TEST_AGENT_ID_ARCHITECT,
      agentName: TEST_AGENT_NAME_ARCHITECT,
      role: AGENT_ROLES.ARCHITECT,
      items: [
        {
          id: 'q1',
          question: 'What is the expected load?',
          answer: '',
        },
      ],
    },
  ];
}

/**
 * Creates a mock DebateResult.
 */
function createMockDebateResult(): DebateResult {
  return {
    debateId: TEST_DEBATE_ID,
    solution: {
      description: 'Test solution description',
      tradeoffs: ['Tradeoff 1'],
      recommendations: ['Recommendation 1'],
      confidence: 85,
      synthesizedBy: TEST_JUDGE_ID,
    },
    rounds: [],
    metadata: {
      totalRounds: DEFAULT_ROUNDS,
      durationMs: 2000,
    },
  };
}

describe('DebateService', () => {
  let service: DebateService;
  let mockStateManager: jest.Mocked<StateManager>;
  let mockOrchestrator: jest.Mocked<DebateOrchestrator>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup StateManager mock
    mockStateManager = createMockStateManager();
    (StateManager as jest.Mock).mockImplementation(() => mockStateManager);

    // Setup DebateOrchestrator mock
    mockOrchestrator = createMockDebateOrchestrator();
    (DebateOrchestrator as jest.Mock).mockImplementation(() => mockOrchestrator);

    // Setup RoleBasedAgent mocks
    (RoleBasedAgent.defaultSystemPrompt as jest.Mock).mockReturnValue(MOCK_SYSTEM_PROMPT);
    (RoleBasedAgent.create as jest.Mock).mockImplementation((config: AgentConfig) => {
      return createMockAgent(config.id, config.role, config.name);
    });

    // Setup JudgeAgent mock
    (JudgeAgent as unknown as jest.Mock).mockImplementation(() => ({
      synthesize: jest.fn(),
      prepareContext: jest.fn(),
    }));
    // Mock static method
    (JudgeAgent.defaultSystemPrompt as jest.Mock) = jest.fn().mockReturnValue(MOCK_SYSTEM_PROMPT);

    // Setup utility mocks
    (createProvider as jest.Mock).mockReturnValue(MOCK_PROVIDER);
    (resolvePrompt as jest.Mock).mockReturnValue({
      text: MOCK_SYSTEM_PROMPT,
      source: PROMPT_SOURCES.BUILT_IN,
    });
    (buildToolRegistry as jest.Mock).mockReturnValue({});

    service = new DebateService();
  });

  describe('getDefaultConfig', () => {
    it('should return correct default configuration structure', () => {
      const config = service.getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.agents).toHaveLength(3);
      expect(config.judge).toBeDefined();
      expect(config.debate).toBeDefined();
    });

    it('should return architect agent with correct properties', () => {
      const config = service.getDefaultConfig();
      const architect = config.agents.find(a => a.id === TEST_AGENT_ID_ARCHITECT);

      expect(architect).toBeDefined();
      expect(architect?.id).toBe(TEST_AGENT_ID_ARCHITECT);
      expect(architect?.name).toBe(TEST_AGENT_NAME_ARCHITECT);
      expect(architect?.role).toBe(AGENT_ROLES.ARCHITECT);
      expect(architect?.model).toBe(DEFAULT_LLM_MODEL);
      expect(architect?.provider).toBe(LLM_PROVIDERS.OPENROUTER);
      expect(architect?.temperature).toBe(DEFAULT_AGENT_TEMPERATURE);
      expect(architect?.enabled).toBe(true);
    });

    it('should return performance agent with correct properties', () => {
      const config = service.getDefaultConfig();
      const performance = config.agents.find(a => a.id === TEST_AGENT_ID_PERFORMANCE);

      expect(performance).toBeDefined();
      expect(performance?.id).toBe(TEST_AGENT_ID_PERFORMANCE);
      expect(performance?.name).toBe(TEST_AGENT_NAME_PERFORMANCE);
      expect(performance?.role).toBe(AGENT_ROLES.PERFORMANCE);
    });

    it('should return kiss agent with correct properties', () => {
      const config = service.getDefaultConfig();
      const kiss = config.agents.find(a => a.id === TEST_AGENT_ID_KISS);

      expect(kiss).toBeDefined();
      expect(kiss?.id).toBe(TEST_AGENT_ID_KISS);
      expect(kiss?.name).toBe(TEST_AGENT_NAME_KISS);
      expect(kiss?.role).toBe(AGENT_ROLES.KISS);
    });

    it('should return judge with correct properties', () => {
      const config = service.getDefaultConfig();

      expect(config.judge.id).toBe(TEST_JUDGE_ID);
      expect(config.judge.name).toBe(TEST_JUDGE_NAME);
      expect(config.judge.role).toBe(AGENT_ROLES.GENERALIST);
      expect(config.judge.model).toBe(DEFAULT_LLM_MODEL);
      expect(config.judge.provider).toBe(LLM_PROVIDERS.OPENROUTER);
      expect(config.judge.temperature).toBe(DEFAULT_JUDGE_TEMPERATURE);
    });

    it('should return debate config with correct properties', () => {
      const config = service.getDefaultConfig();

      expect(config.debate.rounds).toBe(DEFAULT_ROUNDS);
      expect(config.debate.terminationCondition.type).toBe(TERMINATION_TYPES.FIXED);
      expect(config.debate.synthesisMethod).toBe(SYNTHESIS_METHODS.JUDGE);
      expect(config.debate.includeFullHistory).toBe(true);
      expect(config.debate.timeoutPerRound).toBe(DEFAULT_TIMEOUT_PER_ROUND);
      expect(config.debate.summarization).toBeDefined();
      expect(config.debate.summarization?.enabled).toBe(true);
      expect(config.debate.summarization?.threshold).toBe(5000);
      expect(config.debate.summarization?.maxLength).toBe(2500);
      expect(config.debate.summarization?.method).toBe('length-based');
    });
  });

  describe('collectClarifications', () => {
    it('should successfully collect clarifications', async () => {
      const mockClarifications = createMockAgentClarifications();
      const mockAgents = createMockAgentConfigs();
      (collectClarifications as jest.Mock).mockResolvedValue(mockClarifications);

      const result = await service.collectClarifications(TEST_PROBLEM, mockAgents);

      expect(collectClarifications).toHaveBeenCalledWith(
        TEST_PROBLEM,
        expect.any(Array),
        DEFAULT_MAX_CLARIFICATIONS_PER_AGENT,
        expect.any(Function)
      );
      expect(result).toEqual(mockClarifications);
    });

    it('should handle errors when collecting clarifications', async () => {
      const errorMessage = 'Failed to collect clarifications';
      const mockAgents = createMockAgentConfigs();
      (collectClarifications as jest.Mock).mockRejectedValue(new Error(errorMessage));

      await expect(service.collectClarifications(TEST_PROBLEM, mockAgents)).rejects.toThrow(errorMessage);
    });

    it('should build agents correctly before collecting clarifications', async () => {
      const mockClarifications = createMockAgentClarifications();
      const mockAgents = createMockAgentConfigs();
      (collectClarifications as jest.Mock).mockResolvedValue(mockClarifications);

      await service.collectClarifications(TEST_PROBLEM, mockAgents);

      expect(RoleBasedAgent.defaultSystemPrompt).toHaveBeenCalled();
      expect(createProvider).toHaveBeenCalled();
      expect(resolvePrompt).toHaveBeenCalled();
      expect(buildToolRegistry).toHaveBeenCalled();
    });

    it('should throw error when no agents provided', async () => {
      await expect(service.collectClarifications(TEST_PROBLEM, [])).rejects.toThrow('No agents configured');
    });

    it('should throw error when agents is null', async () => {
      await expect(
        service.collectClarifications(TEST_PROBLEM, null as unknown as AgentConfig[])
      ).rejects.toThrow('No agents configured');
    });

    it('should throw when summarization is not configured', async () => {
      const config = service.getDefaultConfig();
      const { summarization: _s, ...debateRest } = config.debate;
      jest.spyOn(service, 'getDefaultConfig').mockReturnValue({
        ...config,
        debate: { ...debateRest },
      });
      await expect(
        service.collectClarifications(TEST_PROBLEM, createMockAgentConfigs())
      ).rejects.toThrow('Summarization configuration is required');
    });

    it('should pass logWarning callback that is invoked by collectClarifications', async () => {
      const mockAgents = createMockAgentConfigs();
      (collectClarifications as jest.Mock).mockImplementation(
        async (_problem: string, _agents: unknown, _max: number, warn: (msg: string) => void) => {
          if (typeof warn === 'function') warn('test warning');
          return createMockAgentClarifications();
        }
      );
      await service.collectClarifications(TEST_PROBLEM, mockAgents);
      expect(logWarning).toHaveBeenCalledWith('test warning');
    });
  });

  describe('runDebate', () => {
    it('should run debate successfully without hooks or clarifications', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      const result = await service.runDebate(TEST_PROBLEM, undefined, undefined, undefined, mockAgents);

      expect(DebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.anything(),
        mockStateManager,
        expect.objectContaining({
          rounds: DEFAULT_ROUNDS,
        }),
        undefined
      );
      expect(mockOrchestrator.runDebate).toHaveBeenCalledWith(TEST_PROBLEM, undefined, undefined);
      expect(result).toEqual(mockResult);
    });

    it('should run debate with hooks', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      const hooks = {
        onRoundStart: jest.fn(),
        onPhaseStart: jest.fn(),
      };
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      const result = await service.runDebate(TEST_PROBLEM, hooks, undefined, undefined, mockAgents);

      expect(DebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.anything(),
        mockStateManager,
        expect.any(Object),
        hooks
      );
      expect(result).toEqual(mockResult);
    });

    it('should run debate with clarifications', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      const clarifications = createMockAgentClarifications();
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      const result = await service.runDebate(TEST_PROBLEM, undefined, clarifications, undefined, mockAgents);

      expect(mockOrchestrator.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM,
        undefined,
        clarifications
      );
      expect(result).toEqual(mockResult);
    });

    it('should override rounds when provided', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      await service.runDebate(TEST_PROBLEM, undefined, undefined, TEST_ROUNDS_OVERRIDE, mockAgents);

      expect(DebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.anything(),
        mockStateManager,
        expect.objectContaining({
          rounds: TEST_ROUNDS_OVERRIDE,
        }),
        undefined
      );
    });

    it('should use default rounds when rounds not provided', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      await service.runDebate(TEST_PROBLEM, undefined, undefined, undefined, mockAgents);

      expect(DebateOrchestrator).toHaveBeenCalledWith(
        expect.any(Array),
        expect.anything(),
        mockStateManager,
        expect.objectContaining({
          rounds: DEFAULT_ROUNDS,
        }),
        undefined
      );
    });

    it('should handle debate failures', async () => {
      const errorMessage = 'Debate orchestration failed';
      const mockAgents = createMockAgentConfigs();
      mockOrchestrator.runDebate.mockRejectedValue(new Error(errorMessage));

      await expect(service.runDebate(TEST_PROBLEM, undefined, undefined, undefined, mockAgents)).rejects.toThrow(errorMessage);
    });

    it('should build agents and judge correctly', async () => {
      const mockResult = createMockDebateResult();
      const mockAgents = createMockAgentConfigs();
      mockOrchestrator.runDebate.mockResolvedValue(mockResult);

      await service.runDebate(TEST_PROBLEM, undefined, undefined, undefined, mockAgents);

      expect(RoleBasedAgent.defaultSystemPrompt).toHaveBeenCalled();
      expect(createProvider).toHaveBeenCalled();
      expect(resolvePrompt).toHaveBeenCalled();
      expect(buildToolRegistry).toHaveBeenCalled();
      expect(JudgeAgent).toHaveBeenCalled();
    });

    it('should throw when agents is omitted and defaults to empty', async () => {
      await expect(service.runDebate(TEST_PROBLEM)).rejects.toThrow('No agents configured');
    });

    it('should throw when agents is null', async () => {
      await expect(
        service.runDebate(TEST_PROBLEM, undefined, undefined, undefined, null as unknown as AgentConfig[])
      ).rejects.toThrow('No agents configured');
    });
  });

  describe('getAgentConfigs', () => {
    it('should return agent configurations', () => {
      const configs = service.getAgentConfigs();

      expect(configs).toHaveLength(3);
      expect(configs[0]!.id).toBe(TEST_AGENT_ID_ARCHITECT);
      expect(configs[1]!.id).toBe(TEST_AGENT_ID_PERFORMANCE);
      expect(configs[2]!.id).toBe(TEST_AGENT_ID_KISS);
    });

    it('should return same configs as getDefaultConfig', () => {
      const defaultConfig = service.getDefaultConfig();
      const agentConfigs = service.getAgentConfigs();

      expect(agentConfigs).toEqual(defaultConfig.agents);
    });
  });

  describe('getJudgeConfig', () => {
    it('should return judge configuration', () => {
      const config = service.getJudgeConfig();

      expect(config.id).toBe(TEST_JUDGE_ID);
      expect(config.name).toBe(TEST_JUDGE_NAME);
      expect(config.role).toBe(AGENT_ROLES.GENERALIST);
    });

    it('should return same config as getDefaultConfig', () => {
      const defaultConfig = service.getDefaultConfig();
      const judgeConfig = service.getJudgeConfig();

      expect(judgeConfig).toEqual(defaultConfig.judge);
    });
  });
});

