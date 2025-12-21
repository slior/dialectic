import { enhanceProblemWithContext } from '@dialectic/core';

describe('enhanceProblemWithContext', () => {
  it('returns problem as-is when context is undefined', () => {
    const problem = 'Test problem';
    const result = enhanceProblemWithContext(problem, undefined);
    expect(result).toBe(problem);
  });

  it('returns problem as-is when context is empty string', () => {
    const problem = 'Test problem';
    const result = enhanceProblemWithContext(problem, '');
    expect(result).toBe(problem);
  });

  it('returns problem as-is when context is whitespace-only', () => {
    const problem = 'Test problem';
    const result = enhanceProblemWithContext(problem, '   \n\n  ');
    expect(result).toBe(problem);
  });

  it('appends context when context is valid', () => {
    const problem = 'Test problem';
    const context = 'Context content';
    const result = enhanceProblemWithContext(problem, context);
    expect(result).toBe('Test problem\n\n# Extra Context\n\nContext content');
  });

  it('handles empty problem string', () => {
    const problem = '';
    const context = 'Context content';
    const result = enhanceProblemWithContext(problem, context);
    expect(result).toBe('\n\n# Extra Context\n\nContext content');
  });

  it('preserves UTF-8 encoding correctly', () => {
    const problem = 'Test problem';
    const context = 'Context with émojis 🎉 and 中文';
    const result = enhanceProblemWithContext(problem, context);
    expect(result).toBe('Test problem\n\n# Extra Context\n\nContext with émojis 🎉 and 中文');
  });

  it('handles markdown spacing correctly', () => {
    const problem = 'Test problem';
    const context = 'Context';
    const result = enhanceProblemWithContext(problem, context);
    expect(result).toBe('Test problem\n\n# Extra Context\n\nContext');
  });

  it('trims context before appending', () => {
    const problem = 'Test problem';
    const context = '  Context content  \n\n';
    const result = enhanceProblemWithContext(problem, context);
    expect(result).toBe('Test problem\n\n# Extra Context\n\nContext content');
  });
});

