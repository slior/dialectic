import { enhanceProblemWithContext } from './context-enhancer';

// Test constants
const TEST_PROBLEM = 'Test problem';
const EMPTY_PROBLEM = '';
const CONTEXT_CONTENT = 'Context content';
const CONTEXT_WHITESPACE_ONLY = '   \n\n  ';
const CONTEXT_WITH_WHITESPACE = '  Context content  \n\n';
const CONTEXT_UTF8 = 'Context with émojis 🎉 and 中文';
const CONTEXT_SIMPLE = 'Context';
const CONTEXT_HEADER = '# Extra Context';
const EXPECTED_SEPARATOR = '\n\n';

describe('enhanceProblemWithContext', () => {
  it('returns problem as-is when context is undefined', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, undefined);
    expect(result).toBe(TEST_PROBLEM);
  });

  it('returns problem as-is when context is empty string', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, '');
    expect(result).toBe(TEST_PROBLEM);
  });

  it('returns problem as-is when context is whitespace-only', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_WHITESPACE_ONLY);
    expect(result).toBe(TEST_PROBLEM);
  });

  it('appends context when context is valid', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_CONTENT);
    expect(result).toBe(`${TEST_PROBLEM}${EXPECTED_SEPARATOR}${CONTEXT_HEADER}${EXPECTED_SEPARATOR}${CONTEXT_CONTENT}`);
  });

  it('handles empty problem string', () => {
    const result = enhanceProblemWithContext(EMPTY_PROBLEM, CONTEXT_CONTENT);
    expect(result).toBe(`${EXPECTED_SEPARATOR}${CONTEXT_HEADER}${EXPECTED_SEPARATOR}${CONTEXT_CONTENT}`);
  });

  it('preserves UTF-8 encoding correctly', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_UTF8);
    expect(result).toBe(`${TEST_PROBLEM}${EXPECTED_SEPARATOR}${CONTEXT_HEADER}${EXPECTED_SEPARATOR}${CONTEXT_UTF8}`);
  });

  it('handles markdown spacing correctly', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_SIMPLE);
    expect(result).toBe(`${TEST_PROBLEM}${EXPECTED_SEPARATOR}${CONTEXT_HEADER}${EXPECTED_SEPARATOR}${CONTEXT_SIMPLE}`);
  });

  it('trims context before appending', () => {
    const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_WITH_WHITESPACE);
    expect(result).toBe(`${TEST_PROBLEM}${EXPECTED_SEPARATOR}${CONTEXT_HEADER}${EXPECTED_SEPARATOR}${CONTEXT_CONTENT}`);
  });

  describe('Context Directory', () => {
    const CONTEXT_DIRECTORY = '/test/context';
    const CONTEXT_DIRECTORY_HEADING = '## Context Directory';
    const CONTEXT_DIRECTORY_INSTRUCTION = `You have access to files in the context directory: ${CONTEXT_DIRECTORY}\nUse the file_read and list_files tools to explore and read relevant files.`;

    it('prepends context directory instructions when context directory is provided', () => {
      const result = enhanceProblemWithContext(TEST_PROBLEM, undefined, CONTEXT_DIRECTORY);
      expect(result).toContain(CONTEXT_DIRECTORY_HEADING);
      expect(result).toContain(CONTEXT_DIRECTORY_INSTRUCTION);
      expect(result).toContain(TEST_PROBLEM);
      expect(result.indexOf(CONTEXT_DIRECTORY_HEADING)).toBeLessThan(result.indexOf(TEST_PROBLEM));
    });

    it('prepends context directory instructions and appends context when both are provided', () => {
      const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_CONTENT, CONTEXT_DIRECTORY);
      expect(result).toContain(CONTEXT_DIRECTORY_HEADING);
      expect(result).toContain(CONTEXT_DIRECTORY_INSTRUCTION);
      expect(result).toContain(TEST_PROBLEM);
      expect(result).toContain(CONTEXT_HEADER);
      expect(result).toContain(CONTEXT_CONTENT);
      expect(result.indexOf(CONTEXT_DIRECTORY_HEADING)).toBeLessThan(result.indexOf(TEST_PROBLEM));
      expect(result.indexOf(TEST_PROBLEM)).toBeLessThan(result.indexOf(CONTEXT_HEADER));
    });

    it('returns problem as-is when context directory is not provided', () => {
      const result = enhanceProblemWithContext(TEST_PROBLEM, undefined, undefined);
      expect(result).toBe(TEST_PROBLEM);
    });

    it('only appends context when context directory is not provided but context string is', () => {
      const result = enhanceProblemWithContext(TEST_PROBLEM, CONTEXT_CONTENT, undefined);
      expect(result).not.toContain(CONTEXT_DIRECTORY_HEADING);
      expect(result).toContain(CONTEXT_HEADER);
      expect(result).toContain(CONTEXT_CONTENT);
    });
  });
});

