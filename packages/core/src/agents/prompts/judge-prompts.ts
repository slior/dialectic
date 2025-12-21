/**
 * Default summary prompt for the judge when summarizing debate history for synthesis.
 * 
 * The judge's perspective is different from agents - it focuses on extracting key decisions,
 * trade-offs, and recommendations from the debate to inform the final synthesis.
 */
export const DEFAULT_JUDGE_SUMMARY_PROMPT = (content: string, maxLength: number): string => 
  `You are a technical judge preparing to synthesize a final solution from a debate. Summarize the following debate history, focusing on the most important decisions, trade-offs, and recommendations that will inform the final synthesis.

Debate history to summarize:
${content}

Create a concise summary (maximum ${maxLength} characters) that captures:
- Key architectural decisions and their rationale
- Important trade-offs identified across different perspectives
- Critical recommendations and concerns raised
- Evolution of the solution through the debate rounds

Focus on information that will be essential for creating a well-informed final synthesis.`;
