import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { LLMProvider } from '../src/providers/llm-provider';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { DebateContext, SummarizationConfig, CONTRIBUTION_TYPES, SUMMARIZATION_METHODS } from '../src/types/debate.types';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  private responses: string[] = [];
  private currentIndex = 0;

  constructor(responses: string[] = ['Mock summary']) {
    this.responses = responses;
  }

  async complete(_request: any): Promise<any> {
    const response = this.responses[this.currentIndex % this.responses.length];
    this.currentIndex++;
    return {
      text: response,
      usage: { totalTokens: 50 }
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
    temperature: 0.5,
  };

  const summaryConfig: SummarizationConfig = {
    enabled: true,
    threshold: 100, // Low threshold for testing
    maxLength: 50,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return false when summarization is disabled', () => {
    const provider = new MockLLMProvider();
    const disabledConfig: SummarizationConfig = { ...summaryConfig, enabled: false };
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

    const longContent = 'a'.repeat(150); // Above 100 char threshold

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
            content: 'a'.repeat(60),
            metadata: {}
          },
          // Critique received by agent (should NOT count - critiques excluded)
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.PERFORMANCE,
            type: CONTRIBUTION_TYPES.CRITIQUE,
            content: 'b'.repeat(40),
            targetAgentId: 'test-agent',
            metadata: {}
          },
          // Agent's refinement (should count)
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'c'.repeat(60),
            metadata: {}
          },
          // Critique of another agent (should NOT count)
          {
            agentId: 'other-agent',
            agentRole: AGENT_ROLES.PERFORMANCE,
            type: CONTRIBUTION_TYPES.CRITIQUE,
            content: 'd'.repeat(200), // Large but shouldn't count
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
    temperature: 0.5,
  };

  const summaryConfig: SummarizationConfig = {
    enabled: true,
    threshold: 100,
    maxLength: 200,
    method: SUMMARIZATION_METHODS.LENGTH_BASED,
  };

  it('should return original context when summarization disabled', async () => {
    const provider = new MockLLMProvider();
    const disabledConfig: SummarizationConfig = { ...summaryConfig, enabled: false };
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

    const longContent = 'a'.repeat(150);
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
            content: 'a'.repeat(60),
            metadata: {}
          },
          {
            agentId: 'test-agent',
            agentRole: AGENT_ROLES.ARCHITECT,
            type: CONTRIBUTION_TYPES.REFINEMENT,
            content: 'b'.repeat(60),
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

    const longContent = 'x'.repeat(150);
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
      async complete(_request: any): Promise<any> {
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

    const longContent = 'z'.repeat(150);
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

    // Mock stderr.write to verify warning is logged (changed from console.warn)
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = await agent.prepareContext(context, 1);

    expect(result.context).toEqual(context);
    expect(result.summary).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization failed')
    );

    stderrSpy.mockRestore();
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

