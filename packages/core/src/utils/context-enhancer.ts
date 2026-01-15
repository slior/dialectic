/**
 * Constant for the context section heading in markdown format.
 */
const CONTEXT_HEADING = '# Extra Context';

/**
 * Constant for the context directory section heading in markdown format.
 */
const CONTEXT_DIRECTORY_HEADING = '## Context Directory';

/**
 * Enhances a problem statement by appending optional context sections.
 * If context directory is provided, it is prepended with instructions for file access tools.
 * If context string is provided and non-empty (after trimming), it is appended to the problem
 * under a distinct "Extra Context" markdown section.
 *
 * @param problem - The problem statement to enhance.
 * @param context - Optional context string to append. If undefined, empty, or whitespace-only, the problem is returned unchanged.
 * @param contextDirectory - Optional absolute path to the context directory. If provided, adds instructions for file access tools.
 * @returns The enhanced problem statement with context sections appended, or the original problem if context is invalid.
 */
export function enhanceProblemWithContext(problem: string, context?: string, contextDirectory?: string): string {
  let enhanced = problem;

  // Prepend context directory instructions if provided
  if (contextDirectory) {
    enhanced = `${CONTEXT_DIRECTORY_HEADING}\n\nYou have access to files in the context directory: ${contextDirectory}\nUse the file_read and list_files tools to explore and read relevant files.\n\n${enhanced}`;
  }

  // Early return if context string is not provided
  if (!context) {
    return enhanced;
  }

  // Trim context and check if it's empty
  const trimmedContext = context.trim();
  if (trimmedContext.length === 0) {
    return enhanced;
  }

  // Append context with markdown heading
  return `${enhanced}\n\n${CONTEXT_HEADING}\n\n${trimmedContext}`;
}

