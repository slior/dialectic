// Mock OpenAI SDK to avoid network calls during tests
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      public chat = {
        completions: {
          create: async (_: any) => ({ 
            choices: [{ message: { content: 'Security solution text' } }],
            usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
          }),
        },
      };
      constructor(_opts: any) {}
    },
  };
});

import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { OpenAIProvider } from '../src/providers/openai-provider';
import { AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';

describe('RoleBasedAgent (Security Role)', () => {
  const mockProvider = new OpenAIProvider('test-key');
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

  describe('RoleBasedAgent.create()', () => {
    it('should create a RoleBasedAgent instance', () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt');
      
      expect(agent).toBeInstanceOf(RoleBasedAgent);
      expect(agent.config).toBe(mockConfig);
    });

    it('should create a RoleBasedAgent instance with prompt source metadata', () => {
      const promptSource = { source: 'built-in' as const };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource);
      
      expect(agent).toBeInstanceOf(RoleBasedAgent);
      expect(agent.promptSource).toBe(promptSource);
    });
  });

  describe('defaultSystemPrompt()', () => {
    it('should return expected security-focused system prompt content', () => {
      const prompt = RoleBasedAgent.defaultSystemPrompt(AGENT_ROLES.SECURITY);
      
      expect(prompt).toContain('cybersecurity expert');
      expect(prompt).toContain('threat modeling');
      expect(prompt).toContain('risk assessment');
      expect(prompt).toContain('security architecture');
      expect(prompt).toContain('authentication');
      expect(prompt).toContain('authorization');
      expect(prompt).toContain('data protection');
      expect(prompt).toContain('network security');
      expect(prompt).toContain('application security');
      expect(prompt).toContain('compliance frameworks');
      expect(prompt).toContain('security vulnerabilities');
      expect(prompt).toContain('security controls');
    });
  });

  describe('propose()', () => {
    it('should call proposeImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt');
      const proposeImplSpy = jest.spyOn(agent, 'proposeImpl' as any);
      
      const result = await agent.propose('Test problem', mockContext);
      
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('cybersecurity expert')
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('security requirements')
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('threat modeling')
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('critique()', () => {
    it('should call critiqueImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt');
      const critiqueImplSpy = jest.spyOn(agent, 'critiqueImpl' as any);
      const mockProposal = {
        content: 'Test proposal content',
        metadata: { latencyMs: 100, model: 'gpt-4' }
      };
      
      const result = await agent.critique(mockProposal, mockContext);
      
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockContext,
        'Test security prompt',
        expect.stringContaining('cybersecurity expert')
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockContext,
        'Test security prompt',
        expect.stringContaining('security vulnerabilities')
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockContext,
        'Test security prompt',
        expect.stringContaining('missing security controls')
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('refine()', () => {
    it('should call refineImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt');
      const refineImplSpy = jest.spyOn(agent, 'refineImpl' as any);
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
        mockProposal,
        mockCritiques,
        mockContext,
        'Test security prompt',
        expect.stringContaining('security concerns')
      );
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockCritiques,
        mockContext,
        'Test security prompt',
        expect.stringContaining('strengthening security measures')
      );
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockCritiques,
        mockContext,
        'Test security prompt',
        expect.stringContaining('security feedback')
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('prompt source metadata handling', () => {
    it('should handle built-in prompt source metadata', () => {
      const promptSource = { source: 'built-in' as const };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource);
      
      expect(agent.promptSource).toEqual(promptSource);
    });

    it('should handle file prompt source metadata', () => {
      const promptSource = { source: 'file' as const, absPath: '/path/to/prompt.md' };
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt', promptSource);
      
      expect(agent.promptSource).toEqual(promptSource);
    });

    it('should handle undefined prompt source metadata', () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test prompt');
      
      expect(agent.promptSource).toBeUndefined();
    });
  });
});

// Note: Integration test with buildAgents function would require importing and setting up
// the entire buildAgents function with mocks, which is complex. The core functionality
// is already tested above through the RoleBasedAgent class methods.