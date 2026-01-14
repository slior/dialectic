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
});

