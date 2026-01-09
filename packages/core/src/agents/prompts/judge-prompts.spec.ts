import { DEFAULT_JUDGE_SUMMARY_PROMPT } from './judge-prompts';

// Test constants
const TEST_CONTENT = 'Debate history content to summarize';
const TEST_CONTENT_WITH_DETAILS = `Round 1: Architect proposed microservices architecture
Round 2: Performance agent raised concerns about latency
Round 3: Security agent identified authentication gaps`;
const MAX_LENGTH_1000 = 1000;
const MAX_LENGTH_2500 = 2500;
const MAX_LENGTH_1000_STRING = '1000';
const MAX_LENGTH_2500_STRING = '2500';
const MAX_LENGTH_500 = 500;
const MAX_LENGTH_500_STRING = '500';
const EMPTY_CONTENT = '';
const SHORT_CONTENT = 'Short';
const LONG_CONTENT = 'Very long content '.repeat(100);

describe('Judge Prompts', () => {
  describe('DEFAULT_JUDGE_SUMMARY_PROMPT', () => {
    it('should return a non-empty prompt with content and maxLength', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(TEST_CONTENT);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should include the judge role description', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('technical judge');
      expect(prompt).toContain('synthesize');
      expect(prompt).toContain('final solution');
    });

    it('should include instructions for summarizing', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Debate history to summarize');
      expect(prompt).toContain('Create a concise summary');
      expect(prompt).toContain('maximum');
      expect(prompt).toContain('characters');
    });

    it('should include key focus areas in the prompt', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toContain('Key architectural decisions');
      expect(prompt).toContain('trade-offs');
      expect(prompt).toContain('recommendations');
      expect(prompt).toContain('Evolution of the solution');
    });

    it('should interpolate content correctly', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT_WITH_DETAILS, MAX_LENGTH_1000);

      expect(prompt).toContain(TEST_CONTENT_WITH_DETAILS);
      expect(prompt).toContain('microservices architecture');
      expect(prompt).toContain('latency');
      expect(prompt).toContain('authentication gaps');
    });

    it('should interpolate maxLength correctly', () => {
      const prompt1 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_2500);
      const prompt3 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_500);

      expect(prompt1).toContain(MAX_LENGTH_1000_STRING);
      expect(prompt2).toContain(MAX_LENGTH_2500_STRING);
      expect(prompt3).toContain(MAX_LENGTH_500_STRING);
      expect(prompt1).not.toContain(MAX_LENGTH_2500_STRING);
      expect(prompt2).not.toContain(MAX_LENGTH_1000_STRING);
      expect(prompt3).not.toContain(MAX_LENGTH_1000_STRING);
    });

    it('should return consistent results for same inputs', () => {
      const prompt1 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toBe(prompt2);
    });

    it('should return different prompts for different maxLength values', () => {
      const prompt1 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_2500);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should return different prompts for different content', () => {
      const prompt1 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);
      const prompt2 = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT_WITH_DETAILS, MAX_LENGTH_1000);

      expect(prompt1).not.toBe(prompt2);
    });

    it('should handle different content lengths', () => {
      const prompt1 = DEFAULT_JUDGE_SUMMARY_PROMPT(SHORT_CONTENT, MAX_LENGTH_1000);
      const prompt2 = DEFAULT_JUDGE_SUMMARY_PROMPT(LONG_CONTENT, MAX_LENGTH_1000);

      expect(prompt1).toContain(SHORT_CONTENT);
      expect(prompt2).toContain(LONG_CONTENT);
      expect(prompt1.length).toBeLessThan(prompt2.length);
    });

    it('should handle empty content string', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(EMPTY_CONTENT, MAX_LENGTH_1000);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(MAX_LENGTH_1000_STRING);
    });

    it('should handle zero maxLength', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, 0);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('0');
    });

    it('should handle very large maxLength values', () => {
      const largeMaxLength = 1000000;
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, largeMaxLength);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('1000000');
    });

    it('should include all required sections in the prompt structure', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);

      // Check for main sections
      expect(prompt).toContain('You are a technical judge');
      expect(prompt).toContain('Debate history to summarize:');
      expect(prompt).toContain('Create a concise summary');
      expect(prompt).toContain('Focus on information');
    });

    it('should properly format the prompt with content insertion', () => {
      const prompt = DEFAULT_JUDGE_SUMMARY_PROMPT(TEST_CONTENT, MAX_LENGTH_1000);
      const contentIndex = prompt.indexOf(TEST_CONTENT);
      const maxLengthIndex = prompt.indexOf(MAX_LENGTH_1000_STRING);

      expect(contentIndex).toBeGreaterThan(-1);
      expect(maxLengthIndex).toBeGreaterThan(-1);
      // Content should appear after "Debate history to summarize:"
      expect(contentIndex).toBeGreaterThan(prompt.indexOf('Debate history to summarize:'));
      // maxLength should appear in the summary instruction
      expect(maxLengthIndex).toBeGreaterThan(prompt.indexOf('maximum'));
    });
  });
});

