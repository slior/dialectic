/**
 * Constant for the context section heading in markdown format.
 */
const CONTEXT_HEADING = '# Extra Context';

/**
 * Enhances a problem statement by appending an optional context section.
 * If context is provided and non-empty (after trimming), it is appended to the problem
 * under a distinct "Extra Context" markdown section.
 *
 * @param problem - The problem statement to enhance.
 * @param context - Optional context string to append. If undefined, empty, or whitespace-only, the problem is returned unchanged.
 * @returns The enhanced problem statement with context appended, or the original problem if context is invalid.
 */
export function enhanceProblemWithContext(problem: string, context?: string): string {
  // Early return if context is not provided
  if (!context) {
    return problem;
  }

  // Trim context and check if it's empty
  const trimmedContext = context.trim();
  if (trimmedContext.length === 0) {
    return problem;
  }

  // Append context with markdown heading
  return `${problem}\n\n${CONTEXT_HEADING}\n\n${trimmedContext}`;
}

