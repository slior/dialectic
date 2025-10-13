import { RoleBasedAgent } from '../src/agents/role-based-agent';
import { AGENT_ROLES } from '../src/types/agent.types';
import { getPromptsForRole } from '../src/agents/prompts';

describe('Summary Prompts', () => {
  describe('Role-specific summary prompts', () => {
    it('should provide summary prompt for architect role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.ARCHITECT);
      const summaryPrompt = prompts.summarizePrompt('test content', 1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
      expect(summaryPrompt).toContain('test content');
      expect(summaryPrompt).toContain('1000');
    });

    it('should provide summary prompt for performance role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.PERFORMANCE);
      const summaryPrompt = prompts.summarizePrompt('test content', 1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for security role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.SECURITY);
      const summaryPrompt = prompts.summarizePrompt('test content', 1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for testing role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.TESTING);
      const summaryPrompt = prompts.summarizePrompt('test content', 1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for generalist role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.GENERALIST);
      const summaryPrompt = prompts.summarizePrompt('test content', 1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('RoleBasedAgent.defaultSummaryPrompt()', () => {
    it('should return summary prompt for all roles', () => {
      const roles = [
        AGENT_ROLES.ARCHITECT,
        AGENT_ROLES.PERFORMANCE,
        AGENT_ROLES.SECURITY,
        AGENT_ROLES.TESTING,
        AGENT_ROLES.GENERALIST
      ];

      roles.forEach(role => {
        const prompt = RoleBasedAgent.defaultSummaryPrompt(role, 'history content', 2500);
        
        expect(prompt).toBeDefined();
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain('history content');
        expect(prompt).toContain('2500');
      });
    });

    it('should include role-specific keywords in prompts', () => {
      const architectPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        'content',
        1000
      );
      expect(architectPrompt.toLowerCase()).toMatch(/architect|design|component/);

      const perfPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.PERFORMANCE,
        'content',
        1000
      );
      expect(perfPrompt.toLowerCase()).toMatch(/performance|optimization|latency|throughput/);

      const secPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.SECURITY,
        'content',
        1000
      );
      expect(secPrompt.toLowerCase()).toMatch(/security|threat|vulnerability/);
    });

    it('should interpolate content into prompt', () => {
      const content = 'This is specific debate history content';
      const prompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        content,
        1000
      );

      expect(prompt).toContain(content);
    });

    it('should interpolate maxLength into prompt', () => {
      const prompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        'content',
        3500
      );

      expect(prompt).toContain('3500');
    });
  });

  describe('Summary prompt consistency', () => {
    it('should return consistent prompts for same inputs', () => {
      const prompt1 = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        'same content',
        1000
      );
      const prompt2 = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        'same content',
        1000
      );

      expect(prompt1).toBe(prompt2);
    });

    it('should return different prompts for different roles', () => {
      const archPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        'content',
        1000
      );
      const perfPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.PERFORMANCE,
        'content',
        1000
      );

      expect(archPrompt).not.toBe(perfPrompt);
    });
  });
});

