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
import { createProvider } from '../src/providers/provider-factory';
import { AGENT_ROLES, LLM_PROVIDERS } from '../src/types/agent.types';
import { DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH, DEFAULT_SUMMARIZATION_METHOD } from '../src/types/config.types';

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
      const proposeImplSpy = jest.spyOn(agent, 'proposeImpl' as any);
      
      const result = await agent.propose('Test problem', mockContext);
      
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('security specialist')
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('Threat Model')
      );
      expect(proposeImplSpy).toHaveBeenCalledWith(
        mockContext,
        'Test security prompt',
        expect.stringContaining('Security Objectives')
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('critique()', () => {
    it('should call critiqueImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt', undefined, defaultSummaryConfig, undefined);
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
        expect.stringContaining('security engineering perspective')
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockContext,
        'Test security prompt',
        expect.stringContaining('vulnerabilities')
      );
      expect(critiqueImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockContext,
        'Test security prompt',
        expect.stringContaining('missing controls')
      );
      expect(result).toBeDefined();
      expect(result.content).toBe('Security solution text');
    });
  });

  describe('refine()', () => {
    it('should call refineImpl with security-focused prompts', async () => {
      const agent = RoleBasedAgent.create(mockConfig, mockProvider, 'Test security prompt', undefined, defaultSummaryConfig, undefined);
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
        expect.stringContaining('strengthen the protection')
      );
      expect(refineImplSpy).toHaveBeenCalledWith(
        mockProposal,
        mockCritiques,
        mockContext,
        'Test security prompt',
        expect.stringContaining('Revised Security Architecture')
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

// Note: Integration test with buildAgents function would require importing and setting up
// the entire buildAgents function with mocks, which is complex. The core functionality
// is already tested above through the RoleBasedAgent class methods.