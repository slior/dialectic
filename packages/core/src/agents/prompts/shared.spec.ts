import { 
  appendSharedInstructions, 
  INSTRUCTION_TYPES, 
  getSharedSystemInstructions,
  getSharedProposalInstructions,
  getSharedCritiqueInstructions,
  getSharedRefinementInstructions,
  getSharedSummarizationInstructions
} from '@dialectic/core';

describe('Shared Prompts', () => {
  describe('INSTRUCTION_TYPES constants', () => {
    it('should export all required instruction type constants', () => {
      expect(INSTRUCTION_TYPES.SYSTEM).toBeDefined();
      expect(INSTRUCTION_TYPES.PROPOSAL).toBeDefined();
      expect(INSTRUCTION_TYPES.CRITIQUE).toBeDefined();
      expect(INSTRUCTION_TYPES.REFINEMENT).toBeDefined();
      expect(INSTRUCTION_TYPES.SUMMARIZATION).toBeDefined();
    });

    it('should have correct string values', () => {
      expect(INSTRUCTION_TYPES.SYSTEM).toBe('system');
      expect(INSTRUCTION_TYPES.PROPOSAL).toBe('proposal');
      expect(INSTRUCTION_TYPES.CRITIQUE).toBe('critique');
      expect(INSTRUCTION_TYPES.REFINEMENT).toBe('refinement');
      expect(INSTRUCTION_TYPES.SUMMARIZATION).toBe('summarization');
    });

    it('should be usable in function calls', () => {
      const result = appendSharedInstructions('test prompt', INSTRUCTION_TYPES.SYSTEM);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan('test prompt'.length);
    });
  });

  describe('Individual instruction functions', () => {
    it('should return non-empty strings for all instruction types', () => {
      expect(getSharedSystemInstructions()).toBeDefined();
      expect(getSharedSystemInstructions().length).toBeGreaterThan(0);
      
      expect(getSharedProposalInstructions()).toBeDefined();
      expect(getSharedProposalInstructions().length).toBeGreaterThan(0);
      
      expect(getSharedCritiqueInstructions()).toBeDefined();
      expect(getSharedCritiqueInstructions().length).toBeGreaterThan(0);
      
      expect(getSharedRefinementInstructions()).toBeDefined();
      expect(getSharedRefinementInstructions().length).toBeGreaterThan(0);
      
      expect(getSharedSummarizationInstructions()).toBeDefined();
      expect(getSharedSummarizationInstructions().length).toBeGreaterThan(0);
    });

    it('should return different content for different instruction types', () => {
      const systemInstructions = getSharedSystemInstructions();
      const proposalInstructions = getSharedProposalInstructions();
      const critiqueInstructions = getSharedCritiqueInstructions();
      const refinementInstructions = getSharedRefinementInstructions();
      const summarizationInstructions = getSharedSummarizationInstructions();

      // All should be different from each other
      expect(systemInstructions).not.toBe(proposalInstructions);
      expect(systemInstructions).not.toBe(critiqueInstructions);
      expect(systemInstructions).not.toBe(refinementInstructions);
      expect(systemInstructions).not.toBe(summarizationInstructions);
      
      expect(proposalInstructions).not.toBe(critiqueInstructions);
      expect(proposalInstructions).not.toBe(refinementInstructions);
      expect(proposalInstructions).not.toBe(summarizationInstructions);
      
      expect(critiqueInstructions).not.toBe(refinementInstructions);
      expect(critiqueInstructions).not.toBe(summarizationInstructions);
      
      expect(refinementInstructions).not.toBe(summarizationInstructions);
    });

    it('should return consistent results across multiple calls', () => {
      const system1 = getSharedSystemInstructions();
      const system2 = getSharedSystemInstructions();
      expect(system1).toBe(system2);

      const proposal1 = getSharedProposalInstructions();
      const proposal2 = getSharedProposalInstructions();
      expect(proposal1).toBe(proposal2);

      const critique1 = getSharedCritiqueInstructions();
      const critique2 = getSharedCritiqueInstructions();
      expect(critique1).toBe(critique2);

      const refinement1 = getSharedRefinementInstructions();
      const refinement2 = getSharedRefinementInstructions();
      expect(refinement1).toBe(refinement2);

      const summarization1 = getSharedSummarizationInstructions();
      const summarization2 = getSharedSummarizationInstructions();
      expect(summarization1).toBe(summarization2);
    });
  });

  describe('appendSharedInstructions() - Basic functionality', () => {
    it('should append system instructions correctly', () => {
      const prompt = 'You are an expert.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.SYSTEM);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should append proposal instructions correctly', () => {
      const prompt = 'Solve this problem.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.PROPOSAL);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should append critique instructions correctly', () => {
      const prompt = 'Review this proposal.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.CRITIQUE);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should append refinement instructions correctly', () => {
      const prompt = 'Refine your solution.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.REFINEMENT);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should append summarization instructions correctly', () => {
      const prompt = 'Summarize the debate.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.SUMMARIZATION);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should return original prompt plus appended instructions', () => {
      const prompt = 'Test prompt content';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.SYSTEM);
      
      // Should start with original prompt
      expect(result.startsWith(prompt)).toBe(true);
      
      // Should be longer than original prompt
      expect(result.length).toBeGreaterThan(prompt.length);
      
      // Should contain the original prompt exactly
      expect(result.indexOf(prompt)).toBe(0);
    });

    it('should handle empty prompts', () => {
      const result = appendSharedInstructions('', INSTRUCTION_TYPES.SYSTEM);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle prompts with existing content', () => {
      const prompt = 'You are an expert software architect. Consider scalability and performance.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.PROPOSAL);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });
  });

  describe('appendSharedInstructions() - Edge cases', () => {
    it('should handle prompts of various lengths', () => {
      const shortPrompt = 'Solve this.';
      const mediumPrompt = 'You are an expert. Consider multiple factors and provide a comprehensive solution.';
      const longPrompt = 'You are an expert software architect specializing in distributed systems and scalable architecture design. Consider scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns. When proposing solutions, start with high-level architecture, identify key components, communication patterns, failure modes, and provide clear descriptions.';

      const shortResult = appendSharedInstructions(shortPrompt, INSTRUCTION_TYPES.SYSTEM);
      const mediumResult = appendSharedInstructions(mediumPrompt, INSTRUCTION_TYPES.SYSTEM);
      const longResult = appendSharedInstructions(longPrompt, INSTRUCTION_TYPES.SYSTEM);

      expect(shortResult).toContain(shortPrompt);
      expect(mediumResult).toContain(mediumPrompt);
      expect(longResult).toContain(longPrompt);

      expect(shortResult.length).toBeGreaterThan(shortPrompt.length);
      expect(mediumResult.length).toBeGreaterThan(mediumPrompt.length);
      expect(longResult.length).toBeGreaterThan(longPrompt.length);
    });

    it('should be consistent across multiple calls', () => {
      const prompt = 'Test prompt for consistency';
      const result1 = appendSharedInstructions(prompt, INSTRUCTION_TYPES.CRITIQUE);
      const result2 = appendSharedInstructions(prompt, INSTRUCTION_TYPES.CRITIQUE);
      
      expect(result1).toBe(result2);
    });

    it('should produce different results for different instruction types', () => {
      const prompt = 'Same prompt for all types';
      
      const systemResult = appendSharedInstructions(prompt, INSTRUCTION_TYPES.SYSTEM);
      const proposalResult = appendSharedInstructions(prompt, INSTRUCTION_TYPES.PROPOSAL);
      const critiqueResult = appendSharedInstructions(prompt, INSTRUCTION_TYPES.CRITIQUE);
      const refinementResult = appendSharedInstructions(prompt, INSTRUCTION_TYPES.REFINEMENT);
      const summarizationResult = appendSharedInstructions(prompt, INSTRUCTION_TYPES.SUMMARIZATION);

      // All should contain the original prompt
      expect(systemResult).toContain(prompt);
      expect(proposalResult).toContain(prompt);
      expect(critiqueResult).toContain(prompt);
      expect(refinementResult).toContain(prompt);
      expect(summarizationResult).toContain(prompt);

      // But should be different from each other
      expect(systemResult).not.toBe(proposalResult);
      expect(systemResult).not.toBe(critiqueResult);
      expect(systemResult).not.toBe(refinementResult);
      expect(systemResult).not.toBe(summarizationResult);
      
      expect(proposalResult).not.toBe(critiqueResult);
      expect(proposalResult).not.toBe(refinementResult);
      expect(proposalResult).not.toBe(summarizationResult);
      
      expect(critiqueResult).not.toBe(refinementResult);
      expect(critiqueResult).not.toBe(summarizationResult);
      
      expect(refinementResult).not.toBe(summarizationResult);
    });

    it('should preserve original prompt content exactly', () => {
      const prompt = 'Original prompt content with special characters: !@#$%^&*()';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.REFINEMENT);
      
      // Should start with exact original prompt
      expect(result.startsWith(prompt)).toBe(true);
      
      // Should contain the exact original prompt at the beginning
      expect(result.indexOf(prompt)).toBe(0);
    });
  });

  describe('Integration testing', () => {
    it('should work with realistic prompt scenarios', () => {
      const realisticPrompt = `You are an expert software architect specializing in distributed systems and scalable architecture design.
Consider scalability, performance, component boundaries, interfaces, architectural patterns, data flow, state management, and operational concerns.
When proposing solutions, start with high-level architecture, identify key components, communication patterns, failure modes, and provide clear descriptions.
When critiquing, look for scalability bottlenecks, missing components, architectural coherence, and operational complexity.`;

      const result = appendSharedInstructions(realisticPrompt, INSTRUCTION_TYPES.SYSTEM);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(realisticPrompt);
      expect(result.length).toBeGreaterThan(realisticPrompt.length);
    });

    it('should maintain proper formatting', () => {
      const multiLinePrompt = `Problem to solve:
Design a scalable web application

Requirements:
- Handle 1M+ users
- 99.9% uptime
- Global deployment`;

      const result = appendSharedInstructions(multiLinePrompt, INSTRUCTION_TYPES.PROPOSAL);
      
      expect(result).toBeDefined();
      expect(result).toContain(multiLinePrompt);
      expect(result.length).toBeGreaterThan(multiLinePrompt.length);
    });

    it('should work correctly with all instruction types in sequence', () => {
      const basePrompt = 'Base prompt for testing';
      
      const systemResult = appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SYSTEM);
      const proposalResult = appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.PROPOSAL);
      const critiqueResult = appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.CRITIQUE);
      const refinementResult = appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.REFINEMENT);
      const summarizationResult = appendSharedInstructions(basePrompt, INSTRUCTION_TYPES.SUMMARIZATION);

      // All should work without errors
      expect(systemResult).toBeDefined();
      expect(proposalResult).toBeDefined();
      expect(critiqueResult).toBeDefined();
      expect(refinementResult).toBeDefined();
      expect(summarizationResult).toBeDefined();

      // All should contain the base prompt
      expect(systemResult).toContain(basePrompt);
      expect(proposalResult).toContain(basePrompt);
      expect(critiqueResult).toContain(basePrompt);
      expect(refinementResult).toContain(basePrompt);
      expect(summarizationResult).toContain(basePrompt);

      // All should be longer than the base prompt
      expect(systemResult.length).toBeGreaterThan(basePrompt.length);
      expect(proposalResult.length).toBeGreaterThan(basePrompt.length);
      expect(critiqueResult.length).toBeGreaterThan(basePrompt.length);
      expect(refinementResult.length).toBeGreaterThan(basePrompt.length);
      expect(summarizationResult.length).toBeGreaterThan(basePrompt.length);
    });
  });
});

