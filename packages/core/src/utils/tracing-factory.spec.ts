import { RoleBasedAgent } from '../agents/role-based-agent';
import { LLMProvider } from '../providers/llm-provider';
import { AgentConfig, AgentRole, AGENT_ROLES, LLM_PROVIDERS } from '../types/agent.types';
import { DebateConfig, SummarizationConfig } from '../types/debate.types';
import { TRACE_OPTIONS, TraceMetadata } from '../types/tracing.types';

import { validateLangfuseConfig, createTracingContext, createTracingProvider, createTracingAgent } from './tracing-factory';

// Test constants
const DEFAULT_TEMPERATURE = 0.5;
const DEFAULT_TIMEOUT_MS = 300000;
const EXPECTED_ROUNDS_COUNT = 3;

describe('TracingFactory', () => {
  const originalEnv = process.env;

  const createMockAgentConfig = (id: string, role: AgentRole): AgentConfig => ({
    id,
    name: `Test ${role} Agent`,
    role,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: 0.5,
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateLangfuseConfig', () => {
    it('should not throw with valid config', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      expect(() => validateLangfuseConfig()).not.toThrow();
    });

    it('should throw with missing secret key', () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      expect(() => validateLangfuseConfig()).toThrow();
    });

    it('should throw with missing public key', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      delete process.env.LANGFUSE_PUBLIC_KEY;
      
      expect(() => validateLangfuseConfig()).toThrow();
    });

    it('should throw with empty secret key', () => {
      process.env.LANGFUSE_SECRET_KEY = '';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      expect(() => validateLangfuseConfig()).toThrow();
    });

    it('should throw with empty public key', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = '';
      
      expect(() => validateLangfuseConfig()).toThrow();
    });
  });

  describe('createTracingContext', () => {
    const createMockTraceMetadata = (includeJudge = true): TraceMetadata => ({
      debateId: 'test-debate-id',
      clarificationRequested: false,
      verboseRun: false,
      configFileName: 'debate-config.json',
      debateConfig: {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      },
      agentConfigs: [
        createMockAgentConfig('agent-architect', AGENT_ROLES.ARCHITECT),
        createMockAgentConfig('agent-performance', AGENT_ROLES.PERFORMANCE),
      ],
      ...(includeJudge && { judgeConfig: createMockAgentConfig('judge', AGENT_ROLES.GENERALIST) }),
    });

    it('should create tracing context with valid config', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata = createMockTraceMetadata();
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      expect(tracingContext).toBeDefined();
      expect(tracingContext?.langfuse).toBeDefined();
      expect(tracingContext?.trace).toBeDefined();
    });

    it('should create tracing context with all metadata fields', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata: TraceMetadata = {
        debateId: 'test-debate-id',
        problemFileName: 'problem.txt',
        contextFileName: 'context.md',
        clarificationRequested: true,
        verboseRun: true,
        configFileName: 'custom-config.json',
        debateConfig,
        agentConfigs: [
          createMockAgentConfig('agent-architect', AGENT_ROLES.ARCHITECT),
          createMockAgentConfig('agent-performance', AGENT_ROLES.PERFORMANCE),
        ],
        judgeConfig: createMockAgentConfig('judge', AGENT_ROLES.GENERALIST),
      };
      
      const traceName = 'debate-command-20240101-1200';
      const tags = ['clarify', 'architect', 'performance'];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      expect(tracingContext).toBeDefined();
      expect(tracingContext?.langfuse).toBeDefined();
      expect(tracingContext?.trace).toBeDefined();
    });

    it('should return undefined when tracing is not enabled', () => {
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
      };
      
      const traceMetadata = createMockTraceMetadata();
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      expect(tracingContext).toBeUndefined();
    });

    it('should return undefined when config validation fails', () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata = createMockTraceMetadata();
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      expect(tracingContext).toBeUndefined();
    });

    it('should handle optional judgeConfig', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata = createMockTraceMetadata(false);
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      expect(tracingContext).toBeDefined();
      expect(tracingContext?.langfuse).toBeDefined();
      expect(tracingContext?.trace).toBeDefined();
      expect(traceMetadata.judgeConfig).toBeUndefined();
    });
  });

  describe('createTracingProvider', () => {
    it('should return wrapped provider when tracing enabled', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const mockProvider: LLMProvider = {
        complete: jest.fn().mockResolvedValue({ text: 'test response' }),
      };
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata: TraceMetadata = {
        debateId: 'test-debate-id',
        clarificationRequested: false,
        verboseRun: false,
        configFileName: 'debate-config.json',
        debateConfig,
        agentConfigs: [
          createMockAgentConfig('agent-architect', AGENT_ROLES.ARCHITECT),
        ],
        judgeConfig: createMockAgentConfig('judge', AGENT_ROLES.GENERALIST),
      };
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      if (!tracingContext) {
        throw new Error('Tracing context should be created');
      }
      
      const wrappedProvider = createTracingProvider(mockProvider, tracingContext);
      
      expect(wrappedProvider).toBeDefined();
      expect(wrappedProvider).not.toBe(mockProvider);
      expect(wrappedProvider.complete).toBeDefined();
    });

    it('should return original provider when tracing disabled', () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn().mockResolvedValue({ text: 'test response' }),
      };
      
      const wrappedProvider = createTracingProvider(mockProvider, undefined);
      
      expect(wrappedProvider).toBe(mockProvider);
    });
  });

  describe('createTracingAgent', () => {
    it('should return wrapped agent when tracing enabled', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const mockProvider: LLMProvider = {
        complete: jest.fn().mockResolvedValue({ text: 'test response' }),
      };
      
      const agentConfig: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        role: AGENT_ROLES.ARCHITECT,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
      temperature: DEFAULT_TEMPERATURE,
    };
      
      const summaryConfig: SummarizationConfig = {
        enabled: false,
        threshold: 5000,
        maxLength: 2500,
        method: 'length-based',
      };
      
      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );
      
      const debateConfig: DebateConfig = {
        rounds: EXPECTED_ROUNDS_COUNT,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: DEFAULT_TIMEOUT_MS,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const traceMetadata: TraceMetadata = {
        debateId: 'test-debate-id',
        clarificationRequested: false,
        verboseRun: false,
        configFileName: 'debate-config.json',
        debateConfig,
        agentConfigs: [
          createMockAgentConfig('agent-architect', AGENT_ROLES.ARCHITECT),
        ],
        judgeConfig: createMockAgentConfig('judge', AGENT_ROLES.GENERALIST),
      };
      const traceName = 'debate-command-20240101-1200';
      const tags: string[] = [];
      
      const tracingContext = createTracingContext(debateConfig, traceMetadata, traceName, tags);
      
      if (!tracingContext) {
        throw new Error('Tracing context should be created');
      }
      
      const wrappedAgent = createTracingAgent(agent, tracingContext);
      
      expect(wrappedAgent).toBeDefined();
      expect(wrappedAgent).not.toBe(agent);
      expect(wrappedAgent.config).toEqual(agent.config);
    });

    it('should return original agent when tracing disabled', () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn().mockResolvedValue({ text: 'test response' }),
      };
      
      const agentConfig: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        role: AGENT_ROLES.ARCHITECT,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
      temperature: DEFAULT_TEMPERATURE,
    };
      
      const summaryConfig: SummarizationConfig = {
        enabled: false,
        threshold: 5000,
        maxLength: 2500,
        method: 'length-based',
      };
      
      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System prompt',
        undefined,
        summaryConfig
      );
      
      const wrappedAgent = createTracingAgent(agent, undefined);
      
      expect(wrappedAgent).toBe(agent);
    });
  });
});

