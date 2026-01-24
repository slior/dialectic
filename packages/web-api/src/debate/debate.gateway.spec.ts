// Mock dialectic-core dependencies
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    logInfo: jest.fn(),
    logSuccess: jest.fn(),
    logWarning: jest.fn(),
  };
});

import {
  AgentClarifications,
  DebateResult,
  Contribution,
  CONTRIBUTION_TYPES,
  AGENT_ROLES,
  logInfo,
  logSuccess,
  logWarning,
} from 'dialectic-core';
import { Socket } from 'socket.io';

import { DebateGateway, StartDebateDto, AgentConfigInput } from './debate.gateway';
import { DebateService, OrchestratorHooks } from './debate.service';

/**
 * Helper type to access private properties and methods in tests.
 * Uses a separate interface to avoid TypeScript's intersection type reduction issues with private properties.
 */
interface GatewayWithPrivateAccess {
  connectedClients: Set<string>;
  debateInProgress: boolean;
  currentProblem: string;
  getPhaseLabel: (phase: string) => string;
  formatMessageWithRound: (message: string, round: number) => string;
}


// Test constants
const DEFAULT_ROUNDS = 3;
const TEST_PROBLEM = 'Design a caching system';
const TEST_PROBLEM_TRIMMED = 'Design a caching system';
const TEST_PROBLEM_EMPTY = '';
const TEST_PROBLEM_WHITESPACE = '   ';
const TEST_DEBATE_ID = 'deb-test-123';
const TEST_CLIENT_ID = 'client-123';
const TEST_CLIENT_ID_2 = 'client-456';
const TEST_ROUNDS_OVERRIDE = 5;
const TEST_ROUNDS_INVALID = 0;
const TEST_AGENT_ID_ARCHITECT = 'agent-architect';
const TEST_AGENT_NAME_ARCHITECT = 'System Architect';
const TEST_AGENT_ROLE_ARCHITECT = 'architect';
const TEST_JUDGE_ID = 'judge-main';
const TEST_JUDGE_NAME = 'Technical Judge';
const TEST_QUESTION_ID = 'q1';
const TEST_ANSWER = 'Test answer';
const TEST_PHASE_PROPOSAL = CONTRIBUTION_TYPES.PROPOSAL;
const TEST_PHASE_CRITIQUE = CONTRIBUTION_TYPES.CRITIQUE;
const TEST_PHASE_REFINEMENT = CONTRIBUTION_TYPES.REFINEMENT;
const TEST_ACTIVITY_PROPOSING = 'proposing';
const TEST_AGENT_NAME_PERFORMANCE = 'Performance Engineer';
const TEST_BEFORE_CHARS = 10000;
const TEST_AFTER_CHARS = 5000;
const TEST_ROUND_NUMBER = 1;
const TEST_TOTAL_ROUNDS = 3;
const TEST_EXPECTED_COUNT = 3;

/**
 * Creates mock agent configuration inputs for testing.
 */
function createMockAgentConfigInputs(): AgentConfigInput[] {
  return [
    {
      id: TEST_AGENT_ID_ARCHITECT,
      name: TEST_AGENT_NAME_ARCHITECT,
      role: TEST_AGENT_ROLE_ARCHITECT,
      model: 'google/gemini-2.5-flash-lite',
      provider: 'openrouter',
      temperature: 0.5,
    },
    {
      id: 'agent-performance',
      name: TEST_AGENT_NAME_PERFORMANCE,
      role: 'performance',
      model: 'google/gemini-2.5-flash-lite',
      provider: 'openrouter',
      temperature: 0.5,
    },
  ];
}

/**
 * Creates a mock Socket.IO client.
 */
function createMockSocket(id: string = TEST_CLIENT_ID): jest.Mocked<Socket> {
  const emitSpy = jest.fn();
  return {
    id,
    emit: emitSpy,
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  } as unknown as jest.Mocked<Socket>;
}

/**
 * Creates a mock DebateService.
 */
function createMockDebateService(): jest.Mocked<DebateService> {
  const mockAgentConfigs = [
    {
      id: TEST_AGENT_ID_ARCHITECT,
      name: TEST_AGENT_NAME_ARCHITECT,
      role: AGENT_ROLES.ARCHITECT,
    },
    {
      id: 'agent-performance',
      name: TEST_AGENT_NAME_PERFORMANCE,
      role: 'performance',
    },
  ];

  const mockJudgeConfig = {
    id: TEST_JUDGE_ID,
    name: TEST_JUDGE_NAME,
    role: 'generalist',
  };

  return {
    getAgentConfigs: jest.fn().mockReturnValue(mockAgentConfigs),
    getJudgeConfig: jest.fn().mockReturnValue(mockJudgeConfig),
    collectClarifications: jest.fn(),
    runDebate: jest.fn(),
  } as unknown as jest.Mocked<DebateService>;
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
          id: TEST_QUESTION_ID,
          question: 'What is the expected load?',
          answer: '',
        },
      ],
    },
  ];
}

/**
 * Creates a mock AgentClarifications array with empty items.
 */
function createMockAgentClarificationsEmpty(): AgentClarifications[] {
  return [
    {
      agentId: TEST_AGENT_ID_ARCHITECT,
      agentName: TEST_AGENT_NAME_ARCHITECT,
      role: AGENT_ROLES.ARCHITECT,
      items: [],
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
      description: 'Test solution',
      tradeoffs: [],
      recommendations: [],
      confidence: 80,
      synthesizedBy: TEST_JUDGE_ID,
    },
    rounds: [
      {
        roundNumber: 1,
        contributions: [
          {
            agentId: TEST_AGENT_ID_ARCHITECT,
            agentRole: TEST_AGENT_ROLE_ARCHITECT,
            type: TEST_PHASE_PROPOSAL,
            content: 'Test proposal',
            metadata: {},
          } as Contribution,
        ],
        timestamp: new Date(),
      },
    ],
    metadata: {
      totalRounds: DEFAULT_ROUNDS,
      durationMs: 1000,
    },
  };
}

/**
 * Creates a mock DebateResult with a contribution that has targetAgentId set.
 */
function createMockDebateResultWithTargetAgent(): DebateResult {
  return {
    ...createMockDebateResult(),
    rounds: [
      {
        roundNumber: 1,
        contributions: [
          {
            agentId: TEST_AGENT_ID_ARCHITECT,
            agentRole: TEST_AGENT_ROLE_ARCHITECT,
            type: TEST_PHASE_CRITIQUE,
            content: 'Test critique',
            targetAgentId: 'agent-performance',
            metadata: {},
          } as Contribution,
        ],
        timestamp: new Date(),
      },
    ],
  };
}

/**
 * Creates a mock Contribution.
 */
function createMockContribution(): Contribution {
  return {
    agentId: TEST_AGENT_ID_ARCHITECT,
    agentRole: TEST_AGENT_ROLE_ARCHITECT,
    type: TEST_PHASE_PROPOSAL,
    content: 'Test contribution',
    targetAgentId: undefined,
    metadata: {},
  };
}

describe('DebateGateway', () => {
  let gateway: DebateGateway;
  let mockDebateService: jest.Mocked<DebateService>;
  let mockSocket: jest.Mocked<Socket>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDebateService = createMockDebateService();
    mockSocket = createMockSocket();

    gateway = new DebateGateway(mockDebateService);
  });

  describe('handleConnection', () => {
    it('should add client to connected clients set', () => {
      gateway.handleConnection(mockSocket);

      // Access private property via type assertion for testing
      const connectedClients = (gateway as unknown as GatewayWithPrivateAccess).connectedClients;
      expect(connectedClients.has(TEST_CLIENT_ID)).toBe(true);
    });

    it('should emit connectionEstablished with current state', () => {
      gateway.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('connectionEstablished', {
        debateInProgress: false,
        agents: mockDebateService.getAgentConfigs(),
        judge: mockDebateService.getJudgeConfig(),
      });
    });

    it('should emit correct state when debate is in progress', async () => {
      const mockResult = createMockDebateResult();
      // Create a promise that we can control
      let resolveDebate: (value: DebateResult) => void;
      const debatePromise = new Promise<DebateResult>((resolve) => {
        resolveDebate = resolve;
      });
      mockDebateService.runDebate.mockReturnValue(debatePromise);

      // Start a debate (don't await it yet)
      const debatePromiseStarted = gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      // Wait a tick to ensure debateInProgress is set
      await new Promise(resolve => setImmediate(resolve));

      // Create new socket and connect while debate is in progress
      const newSocket = createMockSocket(TEST_CLIENT_ID_2);
      gateway.handleConnection(newSocket);

      expect(newSocket.emit).toHaveBeenCalledWith('connectionEstablished', {
        debateInProgress: true,
        agents: mockDebateService.getAgentConfigs(),
        judge: mockDebateService.getJudgeConfig(),
      });

      // Resolve the debate and await completion
      resolveDebate!(mockResult);
      await debatePromiseStarted;
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client from connected clients set', () => {
      gateway.handleConnection(mockSocket);
      gateway.handleDisconnect(mockSocket);

      const connectedClients = (gateway as unknown as GatewayWithPrivateAccess).connectedClients;
      expect(connectedClients.has(TEST_CLIENT_ID)).toBe(false);
    });

    it('should handle disconnect for non-existent client gracefully', () => {
      const nonExistentSocket = createMockSocket('non-existent');
      expect(() => gateway.handleDisconnect(nonExistentSocket)).not.toThrow();
    });
  });

  describe('handleStartDebate', () => {
    it('should reject when debate is already in progress', async () => {
      const mockResult = createMockDebateResult();
      // Create a promise that we can control
      let resolveDebate: (value: DebateResult) => void;
      const debatePromise = new Promise<DebateResult>((resolve) => {
        resolveDebate = resolve;
      });
      mockDebateService.runDebate.mockReturnValue(debatePromise);

      // Start first debate (don't await it yet)
      const debatePromiseStarted = gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      // Wait a tick to ensure debateInProgress is set
      await new Promise(resolve => setImmediate(resolve));

      // Try to start second debate while first is still running
      const secondSocket = createMockSocket(TEST_CLIENT_ID_2);
      await gateway.handleStartDebate(
        { problem: 'Another problem', clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        secondSocket
      );

      expect(logWarning).toHaveBeenCalledWith('A debate is already in progress');
      expect(secondSocket.emit).toHaveBeenCalledWith('error', {
        message: 'A debate is already in progress',
      });

      // Resolve the first debate and await completion
      resolveDebate!(mockResult);
      await debatePromiseStarted;
    });

    it('should reject empty problem string', async () => {
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM_EMPTY, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('Problem description is required');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Problem description is required',
      });
    });

    it('should reject undefined problem', async () => {
      await gateway.handleStartDebate(
        { problem: undefined as unknown as string, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('Problem description is required');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Problem description is required' });
    });

    it('should reject whitespace-only problem', async () => {
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM_WHITESPACE, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('Problem description is required');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Problem description is required',
      });
    });

    it('should trim problem string', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: `  ${TEST_PROBLEM}  `, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        undefined,
        DEFAULT_ROUNDS,
        expect.any(Array)
      );
    });

    it('should reject invalid rounds (< 1)', async () => {
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, rounds: TEST_ROUNDS_INVALID, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('Number of rounds must be >= 1');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Number of rounds must be >= 1',
      });
    });

    it('should accept valid rounds override', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, rounds: TEST_ROUNDS_OVERRIDE, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        undefined,
        TEST_ROUNDS_OVERRIDE,
        expect.any(Array)
      );
    });

    it('should set debate state and emit debateStarted', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect((gateway as unknown as GatewayWithPrivateAccess).debateInProgress).toBe(false); // Reset after completion
      expect(logInfo).toHaveBeenCalledWith('Debate started');
      expect(mockSocket.emit).toHaveBeenCalledWith('debateStarted', {
        problem: TEST_PROBLEM_TRIMMED,
      });
    });

    it('should collect clarifications when enabled', async () => {
      const mockClarifications = createMockAgentClarifications();
      mockDebateService.collectClarifications.mockResolvedValue(mockClarifications);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('collectingClarifications');
      expect(mockDebateService.collectClarifications).toHaveBeenCalledWith(TEST_PROBLEM_TRIMMED, expect.any(Array));
      expect(mockSocket.emit).toHaveBeenCalledWith('clarificationsRequired', {
        questions: mockClarifications,
      });
    });

    it('should proceed with debate when clarifications enabled but no questions generated', async () => {
      const mockClarifications = createMockAgentClarificationsEmpty();
      const mockResult = createMockDebateResult();
      mockDebateService.collectClarifications.mockResolvedValue(mockClarifications);
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockDebateService.runDebate).toHaveBeenCalled();
    });

    it('should handle clarification collection errors gracefully', async () => {
      const errorMessage = 'Failed to collect clarifications';
      mockDebateService.collectClarifications.mockRejectedValue(new Error(errorMessage));
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(`Failed to collect clarifications: ${errorMessage}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('warning', {
        message: `Failed to collect clarifications: ${errorMessage}`,
      });
      expect(mockDebateService.runDebate).toHaveBeenCalled(); // Should continue with debate
    });

    it('should handle clarification collection non-Error rejection (String error branch)', async () => {
      mockDebateService.collectClarifications.mockRejectedValue('non-Error string');
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('Failed to collect clarifications: non-Error string');
      expect(mockSocket.emit).toHaveBeenCalledWith('warning', {
        message: 'Failed to collect clarifications: non-Error string',
      });
      expect(mockDebateService.runDebate).toHaveBeenCalled();
    });

    it('should run debate without clarifications when disabled', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        undefined,
        DEFAULT_ROUNDS,
        expect.any(Array)
      );
    });

    it('should reject when no agents provided', async () => {
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: [] },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('No agents configured');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'No agents configured',
      });
    });

    it('should reject when agents array is missing', async () => {
      const invalidDto: Partial<StartDebateDto> = {
        problem: TEST_PROBLEM,
        clarificationsEnabled: false,
        // Intentionally omitting 'agents' to test error handling
      };
      await gateway.handleStartDebate(
        invalidDto as StartDebateDto,
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('No agents configured');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'No agents configured',
      });
    });

    it('should reject duplicate agent IDs', async () => {
      const duplicateAgents = [
        ...createMockAgentConfigInputs(),
        {
          id: TEST_AGENT_ID_ARCHITECT, // Duplicate ID
          name: 'Another Agent',
          role: 'security',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: duplicateAgents },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Duplicate agent ID'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Duplicate agent ID'),
      });
    });

    it('should reject duplicate agent names', async () => {
      const duplicateAgents = [
        ...createMockAgentConfigInputs(),
        {
          id: 'agent-security',
          name: TEST_AGENT_NAME_ARCHITECT, // Duplicate name
          role: 'security',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
        },
      ];

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: duplicateAgents },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Duplicate agent name'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Duplicate agent name'),
      });
    });

    it('should reject invalid temperature (< 0.0)', async () => {
      const invalidAgents = [
        {
          ...createMockAgentConfigInputs()[0],
          temperature: -0.1,
        },
      ];

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Temperature must be between'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Temperature must be between'),
      });
    });

    it('should reject invalid temperature (> 1.0)', async () => {
      const invalidAgents = [
        {
          ...createMockAgentConfigInputs()[0],
          temperature: 1.1,
        },
      ];

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Temperature must be between'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Temperature must be between'),
      });
    });

    it('should reject empty agent id', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, id: '' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a non-empty ID');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a non-empty ID' });
    });

    it('should reject whitespace-only agent id', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, id: '   ' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a non-empty ID');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a non-empty ID' });
    });

    it('should reject empty agent name', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, name: '' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a non-empty name');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a non-empty name' });
    });

    it('should reject empty agent model', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, model: '' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a model');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a model' });
    });

    it('should reject missing agent provider', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, provider: '' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a provider');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a provider' });
    });

    it('should reject empty agent role', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, role: '' }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith('All agents must have a role');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'All agents must have a role' });
    });

    it('should reject NaN temperature', async () => {
      const invalidAgents = [{ ...createMockAgentConfigInputs()[0]!, temperature: NaN }];
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: invalidAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Temperature must be between'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Temperature must be between'),
      });
    });

    it('should reject when more than 8 agents', async () => {
      const base = createMockAgentConfigInputs();
      const manyAgents = Array.from({ length: 9 }, (_, i) => ({
        ...base[i % base.length]!,
        id: `agent-${i}`,
        name: `Agent ${i}`,
      }));
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: manyAgents },
        mockSocket
      );
      expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Maximum 8 agents allowed'));
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Maximum 8 agents allowed'),
      });
    });

    it('should emit error when configuredAgents is null in clarifications block', async () => {
      (gateway as unknown as { convertToAgentConfig: () => null }).convertToAgentConfig = (): null => null;
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('collectingClarifications');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'No agents configured' });
      expect(mockDebateService.collectClarifications).not.toHaveBeenCalled();
    });
  });

  describe('handleSubmitClarifications', () => {
    it('should reject when no debate in progress', async () => {
      await gateway.handleSubmitClarifications({ answers: {} }, mockSocket);

      expect(logWarning).toHaveBeenCalledWith('No debate in progress');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'No debate in progress',
      });
    });

    it('should map answers to clarifications and run debate', async () => {
      const mockClarifications = createMockAgentClarifications();
      const mockResult = createMockDebateResult();
      
      // Start debate with clarifications enabled
      mockDebateService.collectClarifications.mockResolvedValue(mockClarifications);
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      // Submit clarifications
      mockDebateService.runDebate.mockResolvedValue(mockResult);
      await gateway.handleSubmitClarifications(
        { answers: { [TEST_QUESTION_ID]: TEST_ANSWER } },
        mockSocket
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('clarificationsSubmitted');
      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                id: TEST_QUESTION_ID,
                answer: TEST_ANSWER,
              }),
            ]),
          }),
        ]),
        DEFAULT_ROUNDS,
        expect.any(Array)
      );
    });

    it('should use NA for missing answers', async () => {
      const mockClarifications = createMockAgentClarifications();
      const mockResult = createMockDebateResult();
      
      mockDebateService.collectClarifications.mockResolvedValue(mockClarifications);
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      mockDebateService.runDebate.mockResolvedValue(mockResult);
      await gateway.handleSubmitClarifications({ answers: {} }, mockSocket);

      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                answer: 'NA',
              }),
            ]),
          }),
        ]),
        DEFAULT_ROUNDS,
        expect.any(Array)
      );
    });

    it('should use configured rounds from startDebate', async () => {
      const mockClarifications = createMockAgentClarifications();
      const mockResult = createMockDebateResult();
      
      mockDebateService.collectClarifications.mockResolvedValue(mockClarifications);
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: true, rounds: TEST_ROUNDS_OVERRIDE, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      mockDebateService.runDebate.mockResolvedValue(mockResult);
      await gateway.handleSubmitClarifications({ answers: {} }, mockSocket);

      expect(mockDebateService.runDebate).toHaveBeenCalledWith(
        TEST_PROBLEM_TRIMMED,
        expect.any(Object),
        expect.any(Array),
        TEST_ROUNDS_OVERRIDE,
        expect.any(Array)
      );
    });
  });

  describe('handleCancelDebate', () => {
    it('should reset state and emit cancellation when debate in progress', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      // Start debate
      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      // Cancel debate (before completion)
      (gateway as unknown as GatewayWithPrivateAccess).debateInProgress = true;
      gateway.handleCancelDebate(mockSocket);

      expect((gateway as unknown as GatewayWithPrivateAccess).debateInProgress).toBe(false);
      expect((gateway as unknown as GatewayWithPrivateAccess).currentProblem).toBe('');
      expect(mockSocket.emit).toHaveBeenCalledWith('debateCancelled');
    });

    it('should do nothing when no debate in progress', () => {
      gateway.handleCancelDebate(mockSocket);

      expect(mockSocket.emit).not.toHaveBeenCalledWith('debateCancelled', expect.anything());
    });
  });

  describe('orchestrator hooks', () => {
    /**
     * Type for hooks with all methods required (gateway always provides all methods).
     */
    type RequiredHooks = Required<OrchestratorHooks>;
    let hooks: RequiredHooks;

    beforeEach(async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockImplementation((_problem, hooksParam) => {
        // Gateway always provides hooks with all methods, so we can safely assert
        hooks = hooksParam as RequiredHooks;
        return Promise.resolve(mockResult);
      });

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );
    });

    it('should emit roundStart event', () => {
      hooks.onRoundStart(TEST_ROUND_NUMBER, TEST_TOTAL_ROUNDS);

      expect(logInfo).toHaveBeenCalledWith(`Round ${TEST_ROUND_NUMBER}/${TEST_TOTAL_ROUNDS} starting`);
      expect(mockSocket.emit).toHaveBeenCalledWith('roundStart', {
        round: TEST_ROUND_NUMBER,
        total: TEST_TOTAL_ROUNDS,
      });
    });

    it('should emit phaseStart event', () => {
      hooks.onPhaseStart(TEST_ROUND_NUMBER, TEST_PHASE_PROPOSAL, TEST_EXPECTED_COUNT);

      expect(logInfo).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('phaseStart', {
        round: TEST_ROUND_NUMBER,
        phase: TEST_PHASE_PROPOSAL,
        expectedCount: TEST_EXPECTED_COUNT,
      });
    });

    it('should emit agentStart event', () => {
      hooks.onAgentStart(TEST_AGENT_NAME_ARCHITECT, TEST_ACTIVITY_PROPOSING);

      expect(logInfo).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('agentStart', {
        agentName: TEST_AGENT_NAME_ARCHITECT,
        activity: TEST_ACTIVITY_PROPOSING,
      });
    });

    it('should emit agentComplete event', () => {
      hooks.onAgentComplete(TEST_AGENT_NAME_ARCHITECT, TEST_ACTIVITY_PROPOSING);

      expect(logSuccess).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('agentComplete', {
        agentName: TEST_AGENT_NAME_ARCHITECT,
        activity: TEST_ACTIVITY_PROPOSING,
      });
    });

    it('should emit phaseComplete event', () => {
      hooks.onPhaseComplete(TEST_ROUND_NUMBER, TEST_PHASE_PROPOSAL);

      expect(logSuccess).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('phaseComplete', {
        round: TEST_ROUND_NUMBER,
        phase: TEST_PHASE_PROPOSAL,
      });
    });

    it('should emit synthesisStart event', () => {
      hooks.onSynthesisStart();

      expect(logInfo).toHaveBeenCalledWith('Synthesis starting');
      expect(mockSocket.emit).toHaveBeenCalledWith('synthesisStart');
    });

    it('should emit synthesisComplete event', () => {
      hooks.onSynthesisComplete();

      expect(logSuccess).toHaveBeenCalledWith('Synthesis completed');
      expect(mockSocket.emit).toHaveBeenCalledWith('synthesisComplete');
    });

    it('should emit summarizationStart event', () => {
      hooks.onSummarizationStart(TEST_AGENT_NAME_ARCHITECT);

      expect(logInfo).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('summarizationStart', {
        agentName: TEST_AGENT_NAME_ARCHITECT,
      });
    });

    it('should emit summarizationComplete event', () => {
      hooks.onSummarizationComplete(TEST_AGENT_NAME_ARCHITECT, TEST_BEFORE_CHARS, TEST_AFTER_CHARS);

      expect(logSuccess).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('summarizationComplete', {
        agentName: TEST_AGENT_NAME_ARCHITECT,
        beforeChars: TEST_BEFORE_CHARS,
        afterChars: TEST_AFTER_CHARS,
      });
    });

    it('should emit summarizationEnd event', () => {
      hooks.onSummarizationEnd(TEST_AGENT_NAME_ARCHITECT);

      expect(logSuccess).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('summarizationEnd', {
        agentName: TEST_AGENT_NAME_ARCHITECT,
      });
    });

    it('should emit contributionCreated event with agent name lookup', () => {
      const contribution = createMockContribution();
      hooks.onContributionCreated(contribution, TEST_ROUND_NUMBER);

      expect(mockSocket.emit).toHaveBeenCalledWith('contributionCreated', {
        agentId: TEST_AGENT_ID_ARCHITECT,
        agentName: TEST_AGENT_NAME_ARCHITECT,
        agentRole: TEST_AGENT_ROLE_ARCHITECT,
        type: TEST_PHASE_PROPOSAL,
        content: contribution.content,
        round: TEST_ROUND_NUMBER,
        targetAgentId: undefined,
      });
    });

    it('should use agentId as fallback when agent name not found', () => {
      const contribution: Contribution = {
        ...createMockContribution(),
        agentId: 'unknown-agent-id',
      };
      hooks.onContributionCreated(contribution, TEST_ROUND_NUMBER);

      expect(mockSocket.emit).toHaveBeenCalledWith('contributionCreated', {
        agentId: 'unknown-agent-id',
        agentName: 'unknown-agent-id',
        agentRole: TEST_AGENT_ROLE_ARCHITECT,
        type: TEST_PHASE_PROPOSAL,
        content: contribution.content,
        round: TEST_ROUND_NUMBER,
        targetAgentId: undefined,
      });
    });
  });

  describe('formatDebateResult', () => {
    it('should format debate result correctly', async () => {
      const mockResult = createMockDebateResult();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('debateComplete', {
        debateId: TEST_DEBATE_ID,
        solution: mockResult.solution,
        rounds: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: TEST_AGENT_ID_ARCHITECT,
                agentRole: TEST_AGENT_ROLE_ARCHITECT,
                type: TEST_PHASE_PROPOSAL,
                content: 'Test proposal',
                targetAgentId: undefined,
              },
            ],
          },
        ],
        metadata: mockResult.metadata,
      });
    });

    it('should include targetAgentId in contributions when present', async () => {
      const mockResult = createMockDebateResultWithTargetAgent();
      mockDebateService.runDebate.mockResolvedValue(mockResult);

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('debateComplete', {
        debateId: TEST_DEBATE_ID,
        solution: mockResult.solution,
        rounds: [
          {
            roundNumber: 1,
            contributions: [
              {
                agentId: TEST_AGENT_ID_ARCHITECT,
                agentRole: TEST_AGENT_ROLE_ARCHITECT,
                type: TEST_PHASE_CRITIQUE,
                content: 'Test critique',
                targetAgentId: 'agent-performance',
              },
            ],
          },
        ],
        metadata: mockResult.metadata,
      });
    });
  });

  describe('error handling', () => {
    it('should emit error event when debate fails', async () => {
      const errorMessage = 'Debate orchestration failed';
      mockDebateService.runDebate.mockRejectedValue(new Error(errorMessage));

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith(`Debate failed: ${errorMessage}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: `Debate failed: ${errorMessage}`,
      });
    });

    it('should reset state after debate failure', async () => {
      const errorMessage = 'Debate orchestration failed';
      mockDebateService.runDebate.mockRejectedValue(new Error(errorMessage));

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect((gateway as unknown as GatewayWithPrivateAccess).debateInProgress).toBe(false);
      expect((gateway as unknown as GatewayWithPrivateAccess).currentProblem).toBe('');
    });

    it('should handle non-Error rejection in runDebate (String error branch)', async () => {
      mockDebateService.runDebate.mockRejectedValue('crash string');

      await gateway.handleStartDebate(
        { problem: TEST_PROBLEM, clarificationsEnabled: false, agents: createMockAgentConfigInputs() },
        mockSocket
      );

      expect(logWarning).toHaveBeenCalledWith('Debate failed: crash string');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Debate failed: crash string' });
    });

    it('should emit error when runDebate is called with configuredAgents null', async () => {
      await (gateway as unknown as { runDebate: (c: Socket, cl?: AgentClarifications[], r?: number) => Promise<void> }).runDebate(
        mockSocket,
        undefined,
        3
      );
      expect(logWarning).toHaveBeenCalledWith('No agents configured');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'No agents configured' });
      expect(mockDebateService.runDebate).not.toHaveBeenCalled();
    });
  });

  describe('phase label mapping', () => {
    it('should map proposal phase correctly', () => {
      const phaseLabel = (gateway as unknown as GatewayWithPrivateAccess).getPhaseLabel(TEST_PHASE_PROPOSAL);
      expect(phaseLabel).toBe('Proposals');
    });

    it('should map critique phase correctly', () => {
      const phaseLabel = (gateway as unknown as GatewayWithPrivateAccess).getPhaseLabel(TEST_PHASE_CRITIQUE);
      expect(phaseLabel).toBe('Critiques');
    });

    it('should map refinement phase correctly', () => {
      const phaseLabel = (gateway as unknown as GatewayWithPrivateAccess).getPhaseLabel(TEST_PHASE_REFINEMENT);
      expect(phaseLabel).toBe('Refinements');
    });
  });

  describe('validateAgents (private, for branch coverage)', () => {
    it('returns NO_AGENTS_CONFIGURED when agents is empty', () => {
      const result = (gateway as unknown as { validateAgents: (a: AgentConfigInput[]) => string | undefined }).validateAgents(
        []
      );
      expect(result).toBe('No agents configured');
    });

    it('returns NO_AGENTS_CONFIGURED when agents is null', () => {
      const result = (gateway as unknown as { validateAgents: (a: AgentConfigInput[] | null) => string | undefined }).validateAgents(
        null as unknown as AgentConfigInput[]
      );
      expect(result).toBe('No agents configured');
    });

    it('returns MIN_AGENTS_REQUIRED when agents length is between 0 and MIN_AGENTS', () => {
      // An array-like with length in (0,1) hits the branch that is unreachable with real arrays
      const result = (gateway as unknown as { validateAgents: (a: { length: number }) => string | undefined }).validateAgents(
        { length: 0.5 } as unknown as AgentConfigInput[]
      );
      expect(result).toBe('At least 1 agent is required');
    });
  });

  describe('message formatting with round', () => {
    it('should format message with round prefix when round > 0', () => {
      const message = (gateway as unknown as GatewayWithPrivateAccess).formatMessageWithRound('Test message', TEST_ROUND_NUMBER);
      expect(message).toBe(`[Round ${TEST_ROUND_NUMBER}] Test message`);
    });

    it('should return message without prefix when round is 0', () => {
      const message = (gateway as unknown as GatewayWithPrivateAccess).formatMessageWithRound('Test message', 0);
      expect(message).toBe('Test message');
    });
  });
});

