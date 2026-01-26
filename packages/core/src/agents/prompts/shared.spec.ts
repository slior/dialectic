import {
  appendSharedInstructions,
  INSTRUCTION_TYPES,
  REQUIREMENTS_COVERAGE_SECTION_TITLE,
  getSharedSystemInstructions,
  getSharedProposalInstructions,
  getSharedCritiqueInstructions,
  getSharedRefinementInstructions,
  getSharedSummarizationInstructions,
  getSharedClarificationInstructions,
  getSharedGroundingInstruction,
  getSharedGroundingInstructionShort,
  type InstructionType
} from './shared';

// Test constants
const PROMPT_TEST = 'test prompt';
const PROMPT_EXPERT = 'You are an expert.';
const PROMPT_SOLVE = 'Solve this problem.';
const PROMPT_REVIEW = 'Review this proposal.';
const PROMPT_REFINE = 'Refine your solution.';
const PROMPT_SUMMARIZE = 'Summarize the debate.';
const PROMPT_TEST_CONTENT = 'Test prompt content';
const PROMPT_TEST_CONSISTENCY = 'Test prompt for consistency';
const PROMPT_SAME_FOR_ALL = 'Same prompt for all types';
const PROMPT_ORIGINAL_CONTENT = 'Original prompt content with special characters: !@#$%^&*()';
const PROMPT_BASE_TESTING = 'Base prompt for testing';
const INSTRUCTION_TYPE_SYSTEM = 'system';
const INSTRUCTION_TYPE_PROPOSAL = 'proposal';
const INSTRUCTION_TYPE_CRITIQUE = 'critique';
const INSTRUCTION_TYPE_REFINEMENT = 'refinement';
const INSTRUCTION_TYPE_SUMMARIZATION = 'summarization';
const INSTRUCTION_TYPE_CLARIFICATION = 'clarification';

describe('Shared Prompts', () => {
  describe('INSTRUCTION_TYPES constants', () => {
    it('should export all required instruction type constants', () => {
      expect(INSTRUCTION_TYPES.SYSTEM).toBeDefined();
      expect(INSTRUCTION_TYPES.PROPOSAL).toBeDefined();
      expect(INSTRUCTION_TYPES.CRITIQUE).toBeDefined();
      expect(INSTRUCTION_TYPES.REFINEMENT).toBeDefined();
      expect(INSTRUCTION_TYPES.SUMMARIZATION).toBeDefined();
      expect(INSTRUCTION_TYPES.CLARIFICATION).toBeDefined();
    });

    it('should have correct string values', () => {
      expect(INSTRUCTION_TYPES.SYSTEM).toBe(INSTRUCTION_TYPE_SYSTEM);
      expect(INSTRUCTION_TYPES.PROPOSAL).toBe(INSTRUCTION_TYPE_PROPOSAL);
      expect(INSTRUCTION_TYPES.CRITIQUE).toBe(INSTRUCTION_TYPE_CRITIQUE);
      expect(INSTRUCTION_TYPES.REFINEMENT).toBe(INSTRUCTION_TYPE_REFINEMENT);
      expect(INSTRUCTION_TYPES.SUMMARIZATION).toBe(INSTRUCTION_TYPE_SUMMARIZATION);
      expect(INSTRUCTION_TYPES.CLARIFICATION).toBe(INSTRUCTION_TYPE_CLARIFICATION);
    });

    it('should be usable in function calls', () => {
      const result = appendSharedInstructions(PROMPT_TEST, INSTRUCTION_TYPES.SYSTEM);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(PROMPT_TEST.length);
    });
  });

  describe('REQUIREMENTS_COVERAGE_SECTION_TITLE constant', () => {
    it('should export REQUIREMENTS_COVERAGE_SECTION_TITLE constant', () => {
      expect(REQUIREMENTS_COVERAGE_SECTION_TITLE).toBeDefined();
      expect(typeof REQUIREMENTS_COVERAGE_SECTION_TITLE).toBe('string');
    });

    it('should have correct value', () => {
      expect(REQUIREMENTS_COVERAGE_SECTION_TITLE).toBe('Requirements Coverage');
    });

    it('should be used in proposal instructions', () => {
      const proposalInstructions = getSharedProposalInstructions();
      expect(proposalInstructions).toContain(REQUIREMENTS_COVERAGE_SECTION_TITLE);
    });
  });

  describe('getSharedGroundingInstruction and getSharedGroundingInstructionShort', () => {
    it('getSharedGroundingInstruction returns a non-empty string', () => {
      const text = getSharedGroundingInstruction();
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });

    it('getSharedGroundingInstruction returns text containing "stated problem" and "Omit generic best-practices"', () => {
      const text = getSharedGroundingInstruction();
      expect(text).toContain('stated problem');
      expect(text).toContain('Omit generic best-practices');
    });

    it('getSharedGroundingInstructionShort(INSTRUCTION_TYPES.PROPOSAL) returns a non-empty string containing "problem or its constraints" and "Avoid generic architecture"', () => {
      const text = getSharedGroundingInstructionShort(INSTRUCTION_TYPES.PROPOSAL);
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('problem or its constraints');
      expect(text).toContain('Avoid generic architecture');
    });

    it('getSharedGroundingInstructionShort(INSTRUCTION_TYPES.CRITIQUE) returns a non-empty string containing "Do not suggest generic improvements" and "problem does not require"', () => {
      const text = getSharedGroundingInstructionShort(INSTRUCTION_TYPES.CRITIQUE);
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('Do not suggest generic improvements');
      expect(text).toContain('problem does not require');
    });

    it('getSharedSystemInstructions includes the full grounding text', () => {
      expect(getSharedSystemInstructions()).toContain(getSharedGroundingInstruction());
    });

    it('getSharedProposalInstructions includes the proposal short grounding text', () => {
      expect(getSharedProposalInstructions()).toContain(getSharedGroundingInstructionShort(INSTRUCTION_TYPES.PROPOSAL));
    });

    it('getSharedCritiqueInstructions includes the critique short grounding text', () => {
      expect(getSharedCritiqueInstructions()).toContain(getSharedGroundingInstructionShort(INSTRUCTION_TYPES.CRITIQUE));
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

      expect(getSharedClarificationInstructions()).toBeDefined();
      expect(getSharedClarificationInstructions().length).toBeGreaterThan(0);
    });

    it('should return different content for different instruction types', () => {
      const systemInstructions = getSharedSystemInstructions();
      const proposalInstructions = getSharedProposalInstructions();
      const critiqueInstructions = getSharedCritiqueInstructions();
      const refinementInstructions = getSharedRefinementInstructions();
      const summarizationInstructions = getSharedSummarizationInstructions();
      const clarificationInstructions = getSharedClarificationInstructions();

      // All should be different from each other
      expect(systemInstructions).not.toBe(proposalInstructions);
      expect(systemInstructions).not.toBe(critiqueInstructions);
      expect(systemInstructions).not.toBe(refinementInstructions);
      expect(systemInstructions).not.toBe(summarizationInstructions);
      expect(systemInstructions).not.toBe(clarificationInstructions);
      
      expect(proposalInstructions).not.toBe(critiqueInstructions);
      expect(proposalInstructions).not.toBe(refinementInstructions);
      expect(proposalInstructions).not.toBe(summarizationInstructions);
      expect(proposalInstructions).not.toBe(clarificationInstructions);
      
      expect(critiqueInstructions).not.toBe(refinementInstructions);
      expect(critiqueInstructions).not.toBe(summarizationInstructions);
      expect(critiqueInstructions).not.toBe(clarificationInstructions);
      
      expect(refinementInstructions).not.toBe(summarizationInstructions);
      expect(refinementInstructions).not.toBe(clarificationInstructions);

      expect(summarizationInstructions).not.toBe(clarificationInstructions);
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

      const clarification1 = getSharedClarificationInstructions();
      const clarification2 = getSharedClarificationInstructions();
      expect(clarification1).toBe(clarification2);
    });

    it('should include expected content in system instructions', () => {
      const instructions = getSharedSystemInstructions();
      expect(instructions).toContain('General Guidelines');
      expect(instructions).toContain('Requirements-First Approach');
      expect(instructions).toContain('major requirements');
      expect(instructions).toContain('minor requirements');
      expect(instructions).toContain('Ground in the problem');
      expect(instructions).toContain('Omit generic best-practices');
    });

    it('should include expected content in proposal instructions', () => {
      const instructions = getSharedProposalInstructions();
      expect(instructions).toContain('Response Guidelines');
      expect(instructions).toContain(REQUIREMENTS_COVERAGE_SECTION_TITLE);
      expect(instructions).toContain('Lists major requirements');
      expect(instructions).toContain('Maps each major requirement');
    });

    it('should include expected content in critique instructions', () => {
      const instructions = getSharedCritiqueInstructions();
      expect(instructions).toContain('Critique Guidelines');
      expect(instructions).toContain('Requirements Check');
      expect(instructions).toContain('Review the proposal\'s Requirements Coverage section');
      expect(instructions).toContain('Critical Rule');
      expect(instructions).toContain('MUST NOT suggest changes');
    });

    it('should include expected content in refinement instructions', () => {
      const instructions = getSharedRefinementInstructions();
      expect(instructions).toContain('Refinement Guidelines');
      expect(instructions).toContain('Requirements Preservation');
      expect(instructions).toContain('REJECT any critique suggestions');
      expect(instructions).toContain('Major requirements are non-negotiable');
    });

    it('should include expected content in summarization instructions', () => {
      const instructions = getSharedSummarizationInstructions();
      expect(instructions).toContain('Summary Guidelines');
      expect(instructions).toContain('Preserve key architectural decisions');
      expect(instructions).toContain('specialized perspective');
      expect(instructions).toContain('concise but include all critical reasoning');
    });

    it('should include expected content in clarification instructions', () => {
      const instructions = getSharedClarificationInstructions();
      expect(instructions).toContain('Clarification Guidelines');
      expect(instructions).toContain('ONLY JSON');
      expect(instructions).toContain('{"questions":');
      expect(instructions).toContain('would change the design or scope for this problem');
    });
  });

  describe('appendSharedInstructions() - Basic functionality', () => {
    it('should append system instructions correctly', () => {
      const result = appendSharedInstructions(PROMPT_EXPERT, INSTRUCTION_TYPES.SYSTEM);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(PROMPT_EXPERT);
      expect(result.length).toBeGreaterThan(PROMPT_EXPERT.length);
    });

    it('should append proposal instructions correctly', () => {
      const result = appendSharedInstructions(PROMPT_SOLVE, INSTRUCTION_TYPES.PROPOSAL);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(PROMPT_SOLVE);
      expect(result.length).toBeGreaterThan(PROMPT_SOLVE.length);
    });

    it('should append critique instructions correctly', () => {
      const result = appendSharedInstructions(PROMPT_REVIEW, INSTRUCTION_TYPES.CRITIQUE);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(PROMPT_REVIEW);
      expect(result.length).toBeGreaterThan(PROMPT_REVIEW.length);
    });

    it('should append refinement instructions correctly', () => {
      const result = appendSharedInstructions(PROMPT_REFINE, INSTRUCTION_TYPES.REFINEMENT);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(PROMPT_REFINE);
      expect(result.length).toBeGreaterThan(PROMPT_REFINE.length);
    });

    it('should append summarization instructions correctly', () => {
      const result = appendSharedInstructions(PROMPT_SUMMARIZE, INSTRUCTION_TYPES.SUMMARIZATION);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(PROMPT_SUMMARIZE);
      expect(result.length).toBeGreaterThan(PROMPT_SUMMARIZE.length);
    });

    it('should append clarification instructions correctly', () => {
      const prompt = 'Ask clarifying questions about the problem.';
      const result = appendSharedInstructions(prompt, INSTRUCTION_TYPES.CLARIFICATION);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(prompt);
      expect(result.length).toBeGreaterThan(prompt.length);
    });

    it('should return original prompt plus appended instructions', () => {
      const result = appendSharedInstructions(PROMPT_TEST_CONTENT, INSTRUCTION_TYPES.SYSTEM);
      
      // Should start with original prompt
      expect(result.startsWith(PROMPT_TEST_CONTENT)).toBe(true);
      
      // Should be longer than original prompt
      expect(result.length).toBeGreaterThan(PROMPT_TEST_CONTENT.length);
      
      // Should contain the original prompt exactly
      expect(result.indexOf(PROMPT_TEST_CONTENT)).toBe(0);
    });

    it('should handle empty prompts', () => {
      const emptyPrompt = '';
      const result = appendSharedInstructions(emptyPrompt, INSTRUCTION_TYPES.SYSTEM);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle prompts with existing content', () => {
      const promptWithContent = 'You are an expert software architect. Consider scalability and performance.';
      const result = appendSharedInstructions(promptWithContent, INSTRUCTION_TYPES.PROPOSAL);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain(promptWithContent);
      expect(result.length).toBeGreaterThan(promptWithContent.length);
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
      const result1 = appendSharedInstructions(PROMPT_TEST_CONSISTENCY, INSTRUCTION_TYPES.CRITIQUE);
      const result2 = appendSharedInstructions(PROMPT_TEST_CONSISTENCY, INSTRUCTION_TYPES.CRITIQUE);
      
      expect(result1).toBe(result2);
    });

    it('should produce different results for different instruction types', () => {
      const systemResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.SYSTEM);
      const proposalResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.PROPOSAL);
      const critiqueResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.CRITIQUE);
      const refinementResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.REFINEMENT);
      const summarizationResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.SUMMARIZATION);
      const clarificationResult = appendSharedInstructions(PROMPT_SAME_FOR_ALL, INSTRUCTION_TYPES.CLARIFICATION);

      // All should contain the original prompt
      expect(systemResult).toContain(PROMPT_SAME_FOR_ALL);
      expect(proposalResult).toContain(PROMPT_SAME_FOR_ALL);
      expect(critiqueResult).toContain(PROMPT_SAME_FOR_ALL);
      expect(refinementResult).toContain(PROMPT_SAME_FOR_ALL);
      expect(summarizationResult).toContain(PROMPT_SAME_FOR_ALL);
      expect(clarificationResult).toContain(PROMPT_SAME_FOR_ALL);

      // But should be different from each other
      expect(systemResult).not.toBe(proposalResult);
      expect(systemResult).not.toBe(critiqueResult);
      expect(systemResult).not.toBe(refinementResult);
      expect(systemResult).not.toBe(summarizationResult);
      expect(systemResult).not.toBe(clarificationResult);
      
      expect(proposalResult).not.toBe(critiqueResult);
      expect(proposalResult).not.toBe(refinementResult);
      expect(proposalResult).not.toBe(summarizationResult);
      expect(proposalResult).not.toBe(clarificationResult);
      
      expect(critiqueResult).not.toBe(refinementResult);
      expect(critiqueResult).not.toBe(summarizationResult);
      expect(critiqueResult).not.toBe(clarificationResult);
      
      expect(refinementResult).not.toBe(summarizationResult);
      expect(refinementResult).not.toBe(clarificationResult);

      expect(summarizationResult).not.toBe(clarificationResult);
    });

    it('should preserve original prompt content exactly', () => {
      const result = appendSharedInstructions(PROMPT_ORIGINAL_CONTENT, INSTRUCTION_TYPES.REFINEMENT);
      
      // Should start with exact original prompt
      expect(result.startsWith(PROMPT_ORIGINAL_CONTENT)).toBe(true);
      
      // Should contain the exact original prompt at the beginning
      expect(result.indexOf(PROMPT_ORIGINAL_CONTENT)).toBe(0);
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
      const systemResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.SYSTEM);
      const proposalResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.PROPOSAL);
      const critiqueResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.CRITIQUE);
      const refinementResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.REFINEMENT);
      const summarizationResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.SUMMARIZATION);
      const clarificationResult = appendSharedInstructions(PROMPT_BASE_TESTING, INSTRUCTION_TYPES.CLARIFICATION);

      // All should work without errors
      expect(systemResult).toBeDefined();
      expect(proposalResult).toBeDefined();
      expect(critiqueResult).toBeDefined();
      expect(refinementResult).toBeDefined();
      expect(summarizationResult).toBeDefined();
      expect(clarificationResult).toBeDefined();

      // All should contain the base prompt
      expect(systemResult).toContain(PROMPT_BASE_TESTING);
      expect(proposalResult).toContain(PROMPT_BASE_TESTING);
      expect(critiqueResult).toContain(PROMPT_BASE_TESTING);
      expect(refinementResult).toContain(PROMPT_BASE_TESTING);
      expect(summarizationResult).toContain(PROMPT_BASE_TESTING);
      expect(clarificationResult).toContain(PROMPT_BASE_TESTING);

      // All should be longer than the base prompt
      expect(systemResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
      expect(proposalResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
      expect(critiqueResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
      expect(refinementResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
      expect(summarizationResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
      expect(clarificationResult.length).toBeGreaterThan(PROMPT_BASE_TESTING.length);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown instruction type', () => {
      // Use type assertion to bypass TypeScript's type checking for testing
      const invalidType = 'invalid-type' as unknown as InstructionType;
      
      expect(() => {
        appendSharedInstructions(PROMPT_TEST, invalidType);
      }).toThrow('Unknown instruction type: invalid-type');
    });

    it('should throw error with correct message format', () => {
      const invalidType = 'unknown' as unknown as InstructionType;
      
      expect(() => {
        appendSharedInstructions(PROMPT_TEST, invalidType);
      }).toThrow(Error);
      
      expect(() => {
        appendSharedInstructions(PROMPT_TEST, invalidType);
      }).toThrow('Unknown instruction type: unknown');
    });
  });
});

