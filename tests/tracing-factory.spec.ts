import { validateLangfuseConfig, createTracingContext, createTracingProvider, createTracingAgent } from '../src/utils/tracing-factory';
import { TRACE_OPTIONS } from '../src/types/tracing.types';
import { DebateConfig } from '../src/types/debate.types';
import { LLMProvider } from '../src/providers/llm-provider';
import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { SummarizationConfig } from '../src/types/config.types';

describe('TracingFactory', () => {
  const originalEnv = process.env;

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
    it('should create tracing context with valid config', () => {
      process.env.LANGFUSE_SECRET_KEY = 'sk-test-secret';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-public';
      
      const debateConfig: DebateConfig = {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const tracingContext = createTracingContext(debateConfig, 'test-debate-id');
      
      expect(tracingContext).toBeDefined();
      expect(tracingContext?.langfuse).toBeDefined();
      expect(tracingContext?.trace).toBeDefined();
    });

    it('should return undefined when tracing is not enabled', () => {
      const debateConfig: DebateConfig = {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
      };
      
      const tracingContext = createTracingContext(debateConfig, 'test-debate-id');
      
      expect(tracingContext).toBeUndefined();
    });

    it('should return undefined when config validation fails', () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      
      const debateConfig: DebateConfig = {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const tracingContext = createTracingContext(debateConfig, 'test-debate-id');
      
      expect(tracingContext).toBeUndefined();
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
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const tracingContext = createTracingContext(debateConfig, 'test-debate-id');
      
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
        temperature: 0.5,
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
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        trace: TRACE_OPTIONS.LANGFUSE,
      };
      
      const tracingContext = createTracingContext(debateConfig, 'test-debate-id');
      
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
        temperature: 0.5,
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

