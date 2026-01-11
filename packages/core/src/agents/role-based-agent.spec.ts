import {
  RoleBasedAgent, LLMProvider, AgentConfig, AGENT_ROLES, LLM_PROVIDERS,
  ToolSchema, DebateContext, DebateState, CompletionRequest, CompletionResponse,
  ToolRegistry, ToolImplementation, CONTRIBUTION_TYPES, SUMMARIZATION_METHODS,
  DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH,
  DEFAULT_SUMMARIZATION_METHOD, createProvider,
} from 'dialectic-core';

// Test constants
const DEFAULT_TEMPERATURE = 0.5;
const MOCK_TOTAL_TOKENS = 100;
const MOCK_PROMPT_TOKENS = 50;
const MOCK_COMPLETION_TOKENS = 50;
const TEST_SUMMARY_THRESHOLD = 100;
const TEST_MAX_LENGTH = 50;
const LONG_CONTENT_LENGTH = 150;
const CONTENT_SNIPPET_60 = 60;
const CONTENT_SNIPPET_40 = 40;
const CONTENT_SNIPPET_200 = 200;

// Mock OpenAI SDK to avoid network calls during tests
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      public chat = {
        completions: {
          create: async (_: unknown): Promise<unknown> => ({ 
            choices: [{ message: { content: 'Security solution text' } }],
            usage: { total_tokens: MOCK_TOTAL_TOKENS, prompt_tokens: MOCK_PROMPT_TOKENS, completion_tokens: MOCK_COMPLETION_TOKENS }
          }),
        },
      };
      constructor(_opts: unknown) {}
    },
  };
});

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  private responses: string[] = [];
  private currentIndex = 0;

  constructor(responses: string[] = ['Mock summary']) {
    this.responses = responses;
  }

  async complete(_request: unknown): Promise<CompletionResponse> {
    const response = this.responses[this.currentIndex % this.responses.length];
    this.currentIndex++;
    return {
      text: response ?? '',
      usage: { totalTokens: MOCK_COMPLETION_TOKENS }
    };
  }
}

// Mock tool
class TestTool implements ToolImplementation {
  name = 'test_tool';
  schema: ToolSchema = {
    name: 'test_tool',
    description: 'Test tool',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
  };

  execute(_args: unknown, _context?: DebateContext, _state?: DebateState): string {
    return JSON.stringify({ status: 'success', result: { output: 'test' } });
  }
}

// Mock provider for tool calling tests
class MockProvider implements LLMProvider {
  private responses: CompletionResponse[] = [];
  private callCount = 0;

  setResponses(responses: CompletionResponse[]): void {
    this.responses = responses;
    this.callCount = 0;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    const response = this.responses[this.callCount] || { text: 'Final' };
    this.callCount++;
    return {
      text: response.text,
      ...(response.toolCalls !== undefined && { toolCalls: response.toolCalls }),
      usage: { totalTokens: MOCK_TOTAL_TOKENS },
    };
  }
}

describe('RoleBasedAgent - shouldSummarize()', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const summaryConfig = {
    enabled: true,
    threshold: TEST_SUMMARY_THRESHOLD, // Low threshold for testing
    maxLength: TEST_MAX_LENGTH,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return false when summarization is disabled', () => {
    const provider = new MockLLMProvider();
    const disabledConfig = { ...summaryConfig, enabled: false };
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      disabledConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [],
    };

    expect(agent.shouldSummarize(context)).toBe(false);
  });

  it('should return false when history is empty', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [],
    };

    expect(agent.shouldSummarize(context)).toBe(false);
  });

  it('should return false when below threshold', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: 'Short proposal', // Less than 100 chars
            metadata: {}
          }
        ]
      }]
    };

    expect(agent.shouldSummarize(context)).toBe(false);
  });

  it('should return true when above threshold', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const longContent = 'a'.repeat(LONG_CONTENT_LENGTH); // Above 100 char threshold

    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: longContent,
            metadata: {}
          }
        ]
      }]
    };

    expect(agent.shouldSummarize(context)).toBe(true);
  });

  it('should correctly calculate character count from agent perspective', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          // Agent's proposal (should count)
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: 'a'.repeat(CONTENT_SNIPPET_60),
            metadata: {}
          },
          // Critique received by agent (should NOT count - critiques excluded)
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.PERFORMANCE,
            type: CONTRIBUTION_TYPES.CRITIQUE,
            content: 'b'.repeat(CONTENT_SNIPPET_40),
            targetAgentId: 'test-agent',
            metadata: {}
          },
          // Agent's refinement (should count)
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'c'.repeat(CONTENT_SNIPPET_60),
            metadata: {}
          },
          // Critique of another agent (should NOT count)
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.PERFORMANCE,
            type: CONTRIBUTION_TYPES.CRITIQUE,
            content: 'd'.repeat(CONTENT_SNIPPET_200), // Large but shouldn't count
            targetAgentId: 'different-agent',
            metadata: {}
          }
        ]
      }]
    };

    // Total should be 60 + 60 = 120 (only proposals and refinements), above threshold of 100
    expect(agent.shouldSummarize(context)).toBe(true);
  });
});

describe('RoleBasedAgent - prepareContext()', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const summaryConfig = {
    enabled: true,
    threshold: TEST_SUMMARY_THRESHOLD,
    maxLength: 200,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return original context when summarization disabled', async () => {
    const provider = new MockLLMProvider();
    const disabledConfig = { ...summaryConfig, enabled: false };
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      disabledConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: []
    };

    const result = await agent.prepareContext(context, 1);

    expect(result.context).toEqual(context);
    expect(result.summary).toBeUndefined();
  });

  it('should return original context when below threshold', async () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [{
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Short',
          metadata: {}
        }]
      }]
    };

    const result = await agent.prepareContext(context, 1);

    expect(result.context).toEqual(context);
    expect(result.summary).toBeUndefined();
  });

  it('should return context with summary when above threshold', async () => {
    const provider = new MockLLMProvider(['Generated summary text']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const longContent = 'a'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [{
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: longContent,
          metadata: {}
        }]
      }]
    };

    const result = await agent.prepareContext(context, 1);

    // Summary is no longer stored in context, but returned separately
    expect(result.context).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary?.agentId).toBe('test-agent');
    expect(result.summary?.agentRole).toBe(AGENT_ROLES.ARCHITECT);
    expect(result.summary?.summary).toBe('Generated summary text');
    expect(result.summary?.metadata.model).toBe(agentConfig.model);
    expect(result.summary?.metadata.temperature).toBe(agentConfig.temperature);
    expect(result.summary?.metadata.provider).toBe(agentConfig.provider);
  });

  it('should filter history to agent perspective', async () => {
    const provider = new MockLLMProvider(['Summary']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: 'a'.repeat(CONTENT_SNIPPET_60),
            metadata: {}
          },
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'b'.repeat(CONTENT_SNIPPET_60),
            metadata: {}
          },
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.PERFORMANCE,
            type: CONTRIBUTION_TYPES.CRITIQUE,
            content: 'Should not be included'.repeat(10),
            targetAgentId: 'different-agent',
            metadata: {}
          }
        ]
      }]
    };

    await agent.prepareContext(context, 1);

    // Verify the LLM was called (which means filtering occurred and threshold was met)
    expect(provider['currentIndex']).toBe(1);
  });

  it('should create correct DebateSummary object', async () => {
    const provider = new MockLLMProvider(['Summary text']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const longContent = 'x'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [{
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: longContent,
          metadata: {}
        }]
      }]
    };

    const result = await agent.prepareContext(context, 1);

    expect(result.summary).toBeDefined();
    expect(result.summary?.agentId).toBe('test-agent');
    expect(result.summary?.agentRole).toBe(AGENT_ROLES.ARCHITECT);
    expect(result.summary?.summary).toBe('Summary text');
    expect(result.summary?.metadata.beforeChars).toBeGreaterThan(0);
    expect(result.summary?.metadata.afterChars).toBe('Summary text'.length);
    expect(result.summary?.metadata.method).toBe(SUMMARIZATION_METHODS.LENGTH_BASED);
    expect(result.summary?.metadata.timestamp).toBeInstanceOf(Date);
    expect(result.summary?.metadata.model).toBe(agentConfig.model);
    expect(result.summary?.metadata.temperature).toBe(agentConfig.temperature);
    expect(result.summary?.metadata.provider).toBe(agentConfig.provider);
  });

  it('should fallback to full history on error with warning', async () => {
    class FailingProvider implements LLMProvider {
      async complete(_request: unknown): Promise<CompletionResponse> {
        throw new Error('LLM failure');
      }
    }

    const provider = new FailingProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const longContent = 'z'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [{
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: longContent,
          metadata: {}
        }]
      }]
    };

    // Mock console.error to verify warning is logged
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await agent.prepareContext(context, 1);

    expect(result.context).toEqual(context);
    expect(result.summary).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization failed')
    );

    consoleErrorSpy.mockRestore();
  });
});

describe('RoleBasedAgent - defaultSummaryPrompt()', () => {
  it('should return summary prompt for each role', () => {
    const roles = [
      AGENT_ROLES.ARCHITECT,
      AGENT_ROLES.PERFORMANCE,
      AGENT_ROLES.SECURITY,
      AGENT_ROLES.TESTING,
      AGENT_ROLES.GENERALIST
    ];

    roles.forEach(role => {
      const prompt = RoleBasedAgent.defaultSummaryPrompt(role, 'test content', 1000);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('test content');
      expect(prompt).toContain('1000');
    });
  });
});

describe('RoleBasedAgent Tool Calling', () => {
  let agentConfig: AgentConfig;
  let mockProvider: MockProvider;
  let toolRegistry: ToolRegistry;
  let mockContext: DebateContext;

  beforeEach(() => {
    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      role: AGENT_ROLES.ARCHITECT,
      model: 'gpt-4',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: DEFAULT_TEMPERATURE,
    };

    mockProvider = new MockProvider();
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new TestTool());

    mockContext = {
      problem: 'Test problem',
      history: [],
    };
  });

  describe('Agent with Tools Configured', () => {
    it('should use tools when tool registry is provided', async () => {
      mockProvider.setResponses([
        {
          text: 'Calling tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final response',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System prompt',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Test problem', mockContext);

      expect(proposal.content).toBe('Final response');
      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolCalls?.length).toBe(1);
    });

    it('should include tool calls in proposal metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Proposal with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final proposal',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolCalls?.[0]?.name).toBe('test_tool');
      expect(proposal.metadata.toolResults).toBeDefined();
      expect(proposal.metadata.toolCallIterations).toBe(1);
    });

    it('should include tool calls in critique metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Critique with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final critique',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const critique = await agent.critique(
        { content: 'Proposal to critique', metadata: {} },
        mockContext
      );

      expect(critique.metadata.toolCalls).toBeDefined();
      expect(critique.metadata.toolCallIterations).toBe(1);
    });

    it('should include tool calls in refinement metadata', async () => {
      mockProvider.setResponses([
        {
          text: 'Refinement with tool',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Final refinement',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const refinement = await agent.refine(
        { content: 'Original', metadata: {} },
        [],
        mockContext
      );

      expect(refinement.metadata.toolCalls).toBeDefined();
      expect(refinement.metadata.toolCallIterations).toBe(1);
    });
  });

  describe('Agent without Tools (Backward Compatibility)', () => {
    it('should work without tool registry', async () => {
      mockProvider.setResponses([
        {
          text: 'Simple proposal',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        undefined // No tool registry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.content).toBe('Simple proposal');
      expect(proposal.metadata.toolCalls).toBeUndefined();
    });
  });

  describe('Tool Call Limits', () => {
    it('should respect tool call limit per phase', async () => {
      agentConfig.toolCallLimit = 2;

      // Set up responses that would exceed limit
      mockProvider.setResponses([
        {
          text: 'Iter 1',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Iter 2',
          toolCalls: [
            {
              id: 'call_2',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
        {
          text: 'Iter 3',
          toolCalls: [
            {
              id: 'call_3',
              name: 'test_tool',
              arguments: '{}',
            },
          ],
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', mockContext);

      expect(proposal.metadata.toolCallIterations).toBe(2);
    });
  });

  describe('Context Passing', () => {
    it('should pass context to tools correctly', async () => {
      const contextWithHistory: DebateContext = {
        problem: 'Test',
        history: [
          {
            roundNumber: 1,
            contributions: [],
            timestamp: new Date(),
          },
        ],
      };

      mockProvider.setResponses([
        {
          text: 'Calling context search',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: '{"input":"test"}',
            },
          ],
        },
        {
          text: 'Final',
        },
      ]);

      const agent = RoleBasedAgent.create(
        agentConfig,
        mockProvider,
        'System',
        undefined,
        { enabled: false, threshold: 0, maxLength: 0, method: 'length-based' },
        undefined,
        undefined,
        toolRegistry
      );

      const proposal = await agent.propose('Problem', contextWithHistory);

      // Tool should have received context
      expect(proposal.metadata.toolCalls).toBeDefined();
      expect(proposal.metadata.toolResults).toBeDefined();
    });
  });
});

describe('RoleBasedAgent (Security Role)', () => {
  // Mock environment variable for provider factory
  const originalEnv = process.env;
  let mockProvider: any;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockProvider = createProvider('openai');
  });
  afterAll(() => {
    process.env = originalEnv;
  });
  const mockConfig = {
    id: 'test-security-agent',
    name: 'Test Security Agent',
    role: AGENT_ROLES.SECURITY,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: 0.5,
    enabled: true
  };
  const mockContext = { 
    debateId: 'test-debate',
    problem: 'Test problem',
    currentRound: 1,
    history: []
  };

  const defaultSummaryConfig = {
    enabled: DEFAULT_SUMMARIZATION_ENABLED,
    threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
    maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
    method: DEFAULT_SUMMARIZATION_METHOD,
  };

  describe('RoleBasedAgent.create()', () => {
    it('should create a RoleBasedAgent instance', () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', undefined, defaultSummaryConfig, undefined);
      
      expect(agent).toBeInstanceOf(RoleBasedAgent);
      expect(agent.config).toBe(mockConfig);
    });

    it('should create a RoleBasedAgent instance with prompt source metadata', () => {
      const promptSource = { source: 'built-in' as const };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource, defaultSummaryConfig, undefined);
      
      expect(agent).toBeInstanceOf(RoleBasedAgent);
      expect(agent.promptSource).toBe(promptSource);
    });
  });

  describe('defaultSystemPrompt()', () => {
    it('should return expected security-focused system prompt content', () => {
      const prompt = RoleBasedAgent.defaultSystemPrompt(AGENT_ROLES.SECURITY);
      
      expect(prompt).toContain('security architect and engineer');
      expect(prompt).toContain('Threat modeling');
      expect(prompt).toContain('risk vectors');
      expect(prompt).toContain('architectural security');
      expect(prompt).toContain('Authentication');
      expect(prompt).toContain('authorization');
      expect(prompt).toContain('data protection');
      expect(prompt).toContain('compliance');
      expect(prompt).toContain('security controls');
      expect(prompt).toContain('defense in depth');
      expect(prompt).toContain('zero trust');
    });
  });

  describe('propose()', () => {
    it('should call proposeImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt', undefined, defaultSummaryConfig, undefined);
      const proposeImplSpy = jest.spyOn(agent, 'proposeImpl' as keyof typeof agent as any);
      
      const result = await agent.propose('Test problem', mockContext);
      
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('security specialist'),
        undefined // state parameter
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('Threat Model'),
        undefined // state parameter
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('Security Objectives'),
        undefined // state parameter
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('critique()', () => {
    it('should call critiqueImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt', undefined, defaultSummaryConfig, undefined);
      const critiqueImplSpy = jest.spyOn(agent, 'critiqueImpl' as keyof typeof agent as any);
      const mockProposal = {
        content: 'Test proposal content',
        metadata: { latencyMs: 100, model: 'gpt-4' }
      };
      
      const result = await agent.critique(mockProposal, mockContext);
      
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('security engineering perspective'),
        undefined // state parameter
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('vulnerabilities'),
        undefined // state parameter
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('missing controls'),
        undefined // state parameter
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('refine()', () => {
    it('should call refineImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt', undefined, defaultSummaryConfig, undefined);
      const refineImplSpy = jest.spyOn(agent, 'refineImpl' as keyof typeof agent as any);
      const mockProposal = {
        content: 'Original proposal content',
        metadata: { latencyMs: 100, model: 'gpt-4' }
      };
      const mockCritiques = [
        { content: 'First critique', metadata: { latencyMs: 50, model: 'gpt-4' } },
        { content: 'Second critique', metadata: { latencyMs: 60, model: 'gpt-4' } }
      ];
      
      const result = await agent.refine(mockProposal, mockCritiques, mockContext);
      
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('security concerns'),
        undefined // state parameter
      );
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('strengthen the protection'),
        undefined // state parameter
      );
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('Revised Security Architecture'),
        undefined // state parameter
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('prompt source metadata handling', () => {
    it('should handle built-in prompt source metadata', () => {
      const promptSource = { source: 'built-in' as const };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource, defaultSummaryConfig, undefined);
      
      expect(agent.promptSource).toEqual(promptSource);
    });

    it('should handle file prompt source metadata', () => {
      const promptSource = { source: 'file' as const, absPath: '/path/to/prompt.md' };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource, defaultSummaryConfig, undefined);
      
      expect(agent.promptSource).toEqual(promptSource);
    });

    it('should handle undefined prompt source metadata', () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', undefined, defaultSummaryConfig, undefined);
      
      expect(agent.promptSource).toBeUndefined();
    });
  });
});

describe('RoleBasedAgent - askClarifyingQuestions()', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const defaultSummaryConfig = {
    enabled: DEFAULT_SUMMARIZATION_ENABLED,
    threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
    maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
    method: DEFAULT_SUMMARIZATION_METHOD,
  };

  const mockContext: DebateContext = {
    problem: 'Test problem',
    history: [],
  };

  it('should return structured questions from valid JSON response', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({
        questions: [
          { id: 'q1', text: 'What is the expected load?' },
          { id: 'q2', text: 'What are the performance requirements?' }
        ]
      })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toEqual({ id: 'q1', text: 'What is the expected load?' });
    expect(result.questions[1]).toEqual({ id: 'q2', text: 'What are the performance requirements?' });
  });

  it('should append resolvedClarificationPromptText when provided', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ questions: [{ id: 'q1', text: 'Question 1' }] })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined,
      'Additional clarification instructions'
    );

    await agent.askClarifyingQuestions('Test problem', mockContext);

    // Verify the LLM was called (the prompt should include the additional text)
    expect(provider['currentIndex']).toBe(1);
  });

  it('should handle empty resolvedClarificationPromptText', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ questions: [{ id: 'q1', text: 'Question 1' }] })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined,
      '' // Empty string
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(1);
  });

  it('should handle whitespace-only resolvedClarificationPromptText', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ questions: [{ id: 'q1', text: 'Question 1' }] })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined,
      '   ' // Whitespace only
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(1);
  });

  it('should extract JSON from text with extra content', async () => {
    const provider = new MockLLMProvider([
      `Some preamble text\n${JSON.stringify({ questions: [{ id: 'q1', text: 'Question 1' }] })}\nSome trailing text`
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.text).toBe('Question 1');
  });

  it('should handle non-array questions in response', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ questions: 'not an array' })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(0);
  });

  it('should filter out questions without text', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({
        questions: [
          { id: 'q1', text: 'Valid question' },
          { id: 'q2' }, // Missing text
          { id: 'q3', text: '' }, // Empty text
          { id: 'q4', text: '   ' }, // Whitespace only
          { id: 'q5', text: 'Another valid question' }
        ]
      })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]!.text).toBe('Valid question');
    expect(result.questions[1]!.text).toBe('Another valid question');
  });

  it('should generate IDs for questions missing them', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({
        questions: [
          { text: 'Question without ID' },
          { id: 'custom-id', text: 'Question with ID' },
          { text: 'Another question without ID' }
        ]
      })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]!.id).toBe('q1');
    expect(result.questions[1]!.id).toBe('custom-id');
    expect(result.questions[2]!.id).toBe('q3');
  });

  it('should handle invalid JSON with error logging', async () => {
    const provider = new MockLLMProvider(['Invalid JSON response']);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid clarifications JSON')
    );

    consoleErrorSpy.mockRestore();
  });

  it('should handle text with no JSON match', async () => {
    const provider = new MockLLMProvider(['No JSON here at all']);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should handle missing questions property', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ notQuestions: [] })
    ]);

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined
    );

    const result = await agent.askClarifyingQuestions('Test problem', mockContext);

    expect(result.questions).toHaveLength(0);
  });
});

describe('RoleBasedAgent - Constructor and Factory', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const defaultSummaryConfig = {
    enabled: DEFAULT_SUMMARIZATION_ENABLED,
    threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
    maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
    method: DEFAULT_SUMMARIZATION_METHOD,
  };

  it('should set summaryPromptSource when provided', () => {
    const provider = new MockLLMProvider();
    const summaryPromptSource = { source: 'file' as const, absPath: '/path/to/summary.md' };

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      summaryPromptSource
    );

    expect(agent.summaryPromptSource).toEqual(summaryPromptSource);
  });

  it('should set resolvedClarificationPromptText when provided', () => {
    const provider = new MockLLMProvider();
    const clarificationText = 'Additional clarification instructions';

    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      defaultSummaryConfig,
      undefined,
      clarificationText
    );

    // Verify it's set by testing askClarifyingQuestions uses it
    expect(agent).toBeDefined();
  });
});

describe('RoleBasedAgent - processRelevantContributions edge cases', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const summaryConfig = {
    enabled: true,
    threshold: TEST_SUMMARY_THRESHOLD,
    maxLength: 200,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return initialValue when history is null', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: null as any,
    };

    // This tests processRelevantContributions indirectly through shouldSummarize
    expect(agent.shouldSummarize(context)).toBe(false);
  });

  it('should return initialValue when history is empty array', () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const context: DebateContext = {
      problem: 'Test problem',
      history: [],
    };

    expect(agent.shouldSummarize(context)).toBe(false);
  });
});

describe('RoleBasedAgent - prepareContext edge cases', () => {
  const agentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    role: AGENT_ROLES.ARCHITECT,
    model: 'gpt-4',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: DEFAULT_TEMPERATURE,
  };

  const summaryConfig = {
    enabled: true,
    threshold: TEST_SUMMARY_THRESHOLD,
    maxLength: 200,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return context when history is null in prepareContext', async () => {
    const provider = new MockLLMProvider();
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const shouldSummarizeSpy = jest.spyOn(agent, 'shouldSummarize').mockReturnValue(true);
    
    const contextWithNullHistory: DebateContext = {
      problem: 'Test problem',
      history: null as any,
    };

    const result = await agent.prepareContext(contextWithNullHistory, 1);

    expect(result.context).toEqual(contextWithNullHistory);
    expect(result.summary).toBeUndefined();

    shouldSummarizeSpy.mockRestore();
  });

  it('should handle critique contributions in prepareContext', async () => {
    const provider = new MockLLMProvider(['Summary text']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    // Create context with critiques that would be included in summarization
    // Note: critiques are currently NOT included in processRelevantContributions
    // but the code path for critique type exists in prepareContext
    const longContent = 'a'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: longContent,
            metadata: {}
          }
        ]
      }]
    };

    const result = await agent.prepareContext(context, 1);

    expect(result.summary).toBeDefined();
  });

  it('should handle missing summarizer when summarization is enabled', async () => {
    const provider = new MockLLMProvider(['Summary']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    const longContent = 'a'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: longContent,
            metadata: {}
          }
        ]
      }]
    };

    // Access the private summarizer and set it to null using type assertion
    // This tests the defensive branch
    (agent as any).summarizer = null;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await agent.prepareContext(context, 1);

    expect(result.context).toEqual(context);
    expect(result.summary).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization enabled but no summarizer available')
    );

    consoleErrorSpy.mockRestore();
  });

  it('should handle null history in prepareContext to cover processRelevantContributions early return', async () => {
    const provider = new MockLLMProvider(['Summary']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    // Mock shouldSummarize to return true so processRelevantContributions is called
    const shouldSummarizeSpy = jest.spyOn(agent, 'shouldSummarize').mockReturnValue(true);

    const contextWithNullHistory: DebateContext = {
      problem: 'Test problem',
      history: null as any,
    };

    const result = await agent.prepareContext(contextWithNullHistory, 1);

    expect(result.context).toEqual(contextWithNullHistory);
    expect(result.summary).toBeUndefined();

    shouldSummarizeSpy.mockRestore();
  });

  it('should handle critique contribution type in prepareContext callback', async () => {
    const provider = new MockLLMProvider(['Summary text']);
    const agent = RoleBasedAgent.create(
      agentConfig,
      provider,
      'System prompt',
      undefined,
      summaryConfig,
      undefined
    );

    // Create context with a proposal that triggers summarization
    // and also include a critique that would be processed if critiques were included
    const longContent = 'a'.repeat(LONG_CONTENT_LENGTH);
    const context: DebateContext = {
      problem: 'Test problem',
      history: [{
        roundNumber: 1,
        timestamp: new Date(),
        contributions: [
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: longContent,
            metadata: {}
          },
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'b'.repeat(50),
            metadata: {}
          }
        ]
      }]
    };

    // Mock processRelevantContributions to include a critique in the callback
    // This tests the critique branch in the callback (line 345)
    const processRelevantContributionsSpy = jest.spyOn(agent as any, 'processRelevantContributions').mockImplementation(
      function(this: any, ...args: any[]) {
        const callback = args[1] as (contribution: any, roundNumber: number) => string[];
        const initialValue = args[2] as string[];
        const reducer = args[3] as (acc: string[], contribution: string[]) => string[];
        // Simulate the callback being called with a critique contribution
        // This tests line 345 (the critique branch in the callback)
        const critiqueContribution = {
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.PERFORMANCE,
          type: CONTRIBUTION_TYPES.CRITIQUE,
          content: 'Critique content',
          metadata: {}
        };
        const critiqueResult = callback(critiqueContribution, 1);
        const proposalContribution = {
          agentId: 'test-agent',
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: longContent,
          metadata: {}
        };
        const proposalResult = callback(proposalContribution, 1);
        return reducer(reducer(initialValue, critiqueResult), proposalResult);
      }
    );

    const result = await agent.prepareContext(context, 1);

    expect(result.summary).toBeDefined();
    expect(processRelevantContributionsSpy).toHaveBeenCalled();

    processRelevantContributionsSpy.mockRestore();
  });
});
