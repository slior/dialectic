import { RoleBasedAgent, AGENT_ROLES, getPromptsForRole } from '@dialectic/core';

// Test constants
const TEST_CONTENT = 'test content';
const HISTORY_CONTENT = 'history content';
const CONTENT_SIMPLE = 'content';
const CONTENT_SPECIFIC = 'This is specific debate history content';
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_3500 = 3500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_3500_STRING = '3500';

describe('Summary Prompts', () => {
  describe('Role-specific summary prompts', () => {
    it('should provide summary prompt for architect role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.ARCHITECT);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
      expect(summaryPrompt).toContain(TEST_CONTENT);
      expect(summaryPrompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should provide summary prompt for performance role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.PERFORMANCE);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for security role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.SECURITY);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for testing role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.TESTING);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for generalist role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.GENERALIST);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
    });

    it('should provide summary prompt for data modeling role', () => {
      const prompts = getPromptsForRole(AGENT_ROLES.DATA_MODELING);
      const summaryPrompt = prompts.summarizePrompt(TEST_CONTENT, MAX_LENGTH_1000);

      expect(summaryPrompt).toBeDefined();
      expect(typeof summaryPrompt).toBe('string');
      expect(summaryPrompt.length).toBeGreaterThan(0);
      expect(summaryPrompt).toContain(TEST_CONTENT);
      expect(summaryPrompt).toContain(MAX_LENGTH_1000_STRING);
    });
  });

  describe('RoleBasedAgent.defaultSummaryPrompt()', () => {
    it('should return summary prompt for all roles', () => {
      const roles = [
        AGENT_ROLES.ARCHITECT,
        AGENT_ROLES.PERFORMANCE,
        AGENT_ROLES.SECURITY,
        AGENT_ROLES.TESTING,
        AGENT_ROLES.GENERALIST,
        AGENT_ROLES.DATA_MODELING
      ];

      roles.forEach(role => {
        const prompt = RoleBasedAgent.defaultSummaryPrompt(role, HISTORY_CONTENT, MAX_LENGTH_2500);
        
        expect(prompt).toBeDefined();
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain(HISTORY_CONTENT);
        expect(prompt).toContain(MAX_LENGTH_2500_STRING);
      });
    });

    it('should include role-specific keywords in prompts', () => {
      const architectPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        CONTENT_SIMPLE,
        MAX_LENGTH_1000
      );
      expect(architectPrompt.toLowerCase()).toMatch(/architect|design|component/);

      const perfPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.PERFORMANCE,
        CONTENT_SIMPLE,
        MAX_LENGTH_1000
      );
      expect(perfPrompt.toLowerCase()).toMatch(/performance|optimization|latency|throughput/);

      const secPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.SECURITY,
        CONTENT_SIMPLE,
        MAX_LENGTH_1000
      );
      expect(secPrompt.toLowerCase()).toMatch(/security|threat|vulnerability/);

      const dataModelingPrompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.DATA_MODELING,
        CONTENT_SIMPLE,
        MAX_LENGTH_1000
      );
      expect(dataModelingPrompt.toLowerCase()).toMatch(/data|domain|entity|relationship|model/);
    });

    it('should interpolate content into prompt', () => {
      const prompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        CONTENT_SPECIFIC,
        MAX_LENGTH_1000
      );

      expect(prompt).toContain(CONTENT_SPECIFIC);
    });

    it('should interpolate maxLength into prompt', () => {
      const prompt = RoleBasedAgent.defaultSummaryPrompt(
        AGENT_ROLES.ARCHITECT,
        CONTENT_SIMPLE,
        MAX_LENGTH_3500
      );

      expect(prompt).toContain(MAX_LENGTH_3500_STRING);
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

