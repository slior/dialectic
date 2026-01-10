import { AgentConfig } from '../types/agent.types';
import { DebateState, Contribution, CONTRIBUTION_TYPES } from '../types/debate.types';

// File-level constants to avoid magic strings and improve maintainability
const CODE_FENCE_LANG = 'text';
const NO_PROPOSALS_MSG = 'No proposals in this round.';
const NO_CRITIQUES_MSG = 'No critiques in this round.';
const NO_REFINEMENTS_MSG = 'No refinements in this round.';
const NA_TEXT = 'N/A';
const RIGHT_ARROW_HTML = '&rarr;';
const UNKNOWN_LABEL = 'unknown';

/**
 * Formats a date to YYYY-MM-DD HH:mm:ss local time string.
 * @param date - The date to format.
 * @returns Formatted date string.
 */
function formatLocalTime(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Extracts the first non-empty line from a text string.
 * @param text - The text to extract from.
 * @returns The first non-empty line, or empty string if none found.
 */
function extractFirstLine(text: string): string {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.trim().length > 0) {
      return line.trim();
    }
  }
  return '';
}

/**
 * Returns a value or NA_TEXT if the value is falsy or undefined.
 * Optionally converts the value to a string using a converter function.
 * 
 * @param value - The value to check (can be any type).
 * @param converter - Optional function to convert the value to a string (e.g., toString, String, JSON.stringify).
 * @returns The value (converted if converter provided) or NA_TEXT if value is falsy/undefined.
 */
function valOrNA<T>(value: T | undefined | null, converter?: (val: T) => string): string {
  if (value === undefined || value === null) {
    return NA_TEXT;
  }
  
  if (converter) {
    return converter(value);
  }
  
  // For falsy values (empty string, 0, false), return NA_TEXT
  // For truthy values, convert to string
  return value ? String(value) : NA_TEXT;
}

/**
 * Formats a single agent configuration as a markdown table row.
 * @param agent - Agent configuration.
 * @returns Markdown table row string.
 */
function formatAgentTableRow(agent: AgentConfig): string {
  const id = valOrNA(agent.id);
  const name = valOrNA(agent.name);
  const role = valOrNA(agent.role);
  const model = valOrNA(agent.model);
  const provider = valOrNA(agent.provider);
  const temperature = valOrNA(agent.temperature, (v) => v.toString());
  const enabled = valOrNA(agent.enabled, (v) => v.toString());
  const systemPromptPath = valOrNA(agent.systemPromptPath, String);
  const summaryPromptPath = valOrNA(agent.summaryPromptPath, String);
  const summarization = valOrNA(agent.summarization, JSON.stringify);
  
  return `| ${id} | ${name} | ${role} | ${model} | ${provider} | ${temperature} | ${enabled} | ${systemPromptPath} | ${summaryPromptPath} | ${summarization} |\n`;
}

/**
 * Formats agent configuration as a markdown table.
 * @param agents - Array of agent configurations.
 * @returns Markdown table string.
 */
function formatAgentsTable(agents: AgentConfig[]): string {
  if (agents.length === 0) {
    return 'No agents configured.';
  }

  // Include all defined fields as requested (omit undefined values in cells by rendering 'N/A')
  let table = '| ID | Name | Role | Model | Provider | Temperature | Enabled | SystemPromptPath | SummaryPromptPath | Summarization |\n';
  table += '|----|------|------|-------|----------|-------------|----------|------------------|-------------------|---------------|\n';

  for (const agent of agents) {
    table += formatAgentTableRow(agent);
  }

  return table;
}

/**
 * Formats judge configuration as a markdown table.
 * @param judge - Judge configuration.
 * @returns Markdown table string.
 */
function formatJudgeTable(judge: AgentConfig): string {
  // Use the same columns as agents for consistency
  let table = '| ID | Name | Role | Model | Provider | Temperature | Enabled | SystemPromptPath | SummaryPromptPath | Summarization |\n';
  table += '|----|------|------|-------|----------|-------------|----------|------------------|-------------------|---------------|\n';

  const id = valOrNA(judge.id);
  const name = valOrNA(judge.name);
  const role = valOrNA(judge.role);
  const model = valOrNA(judge.model);
  const provider = valOrNA(judge.provider);
  const temperature = valOrNA(judge.temperature, (v) => v.toString());
  // Guard for optional property without unsafe cast
  const enabled = 'enabled' in judge ? valOrNA((judge as unknown as { enabled?: unknown }).enabled, String) : NA_TEXT;
  const systemPromptPath = valOrNA(judge.systemPromptPath, String);
  const summaryPromptPath = valOrNA(judge.summaryPromptPath, String);
  const summarization = valOrNA(judge.summarization, JSON.stringify);
  
  table += `| ${id} | ${name} | ${role} | ${model} | ${provider} | ${temperature} | ${enabled} | ${systemPromptPath} | ${summaryPromptPath} | ${summarization} |\n`;

  return table;
}

/**
 * Formats contribution metadata for verbose mode.
 * @param contribution - The contribution to format metadata for.
 * @returns Metadata string or empty string if not verbose.
 */
function formatContributionMetadata(contribution: Contribution, verbose: boolean): string {
  if (!verbose)
    return '';

  const latency = valOrNA(contribution.metadata.latencyMs, (v) => v.toString());
  const tokens = valOrNA(contribution.metadata.tokensUsed, (v) => v.toString());

  return ` (latency=${latency}ms, tokens=${tokens})`;
}

/**
 * Structured representation of a contribution formatted for markdown output.
 */
type FormattedContribution = { title: string; content: string };

/**
 * Formats proposals for a round.
 * @param contributions - Array of proposal contributions.
 * @param verbose - Whether to include metadata.
 * @returns Array of formatted proposal entries with title and content.
 */
function formatProposals(contributions: Contribution[], verbose: boolean): FormattedContribution[] {
  const proposals = contributions.filter(c => c.type === CONTRIBUTION_TYPES.PROPOSAL);
  
  if (proposals.length === 0) {
    return [];
  }

  const result: FormattedContribution[] = [];
  for (const proposal of proposals) {
    const metadata = formatContributionMetadata(proposal, verbose);
    result.push({
      title: `Agent *${proposal.agentId}*${metadata}:`,
      content: proposal.content
    });
  }

  return result;
}

/**
 * Formats critiques for a round.
 * @param contributions - Array of critique contributions.
 * @param verbose - Whether to include metadata.
 * @returns Array of formatted critique entries with title and content.
 */
function formatCritiques(contributions: Contribution[], verbose: boolean): FormattedContribution[] {
  const critiques = contributions.filter(c => c.type === CONTRIBUTION_TYPES.CRITIQUE);
  
  if (critiques.length === 0) {
    return [];
  }

  const result: FormattedContribution[] = [];
  for (const critique of critiques) {
    const metadata = formatContributionMetadata(critique, verbose);
    const target = critique.targetAgentId || UNKNOWN_LABEL;
    result.push({
      title: `*${critique.agentId}* ${RIGHT_ARROW_HTML} *${target}*${metadata}:`,
      content: critique.content
    });
  }

  return result;
}

/**
 * Formats refinements for a round.
 * @param contributions - Array of refinement contributions.
 * @param verbose - Whether to include metadata.
 * @returns Array of formatted refinement entries with title and content.
 */
function formatRefinements(contributions: Contribution[], verbose: boolean): FormattedContribution[] {
  const refinements = contributions.filter(c => c.type === CONTRIBUTION_TYPES.REFINEMENT);
  
  if (refinements.length === 0) {
    return [];
  }

  const result: FormattedContribution[] = [];
  for (const refinement of refinements) {
    const metadata = formatContributionMetadata(refinement, verbose);
    result.push({
      title: `Agent *${refinement.agentId}*${metadata}:`,
      content: refinement.content
    });
  }

  return result;
}

/**
 * Renders a contribution section with a heading, titles outside code fences, and fenced content.
 * Extracted to remove repetition across proposals, critiques, and refinements.
 * @param heading - The section heading label.
 * @param items - The list of formatted contributions.
 * @param emptyMessage - Message to display when there are no items.
 */
function renderContributionSection(
  heading: string,
  items: FormattedContribution[],
  emptyMessage: string
): string {
  let section = `#### ${heading}\n`;
  if (items.length === 0) {
    section += `${emptyMessage}\n\n`;
    return section;
  }
  for (const item of items) {
    section += `${item.title}\n`;
    section += `\`\`\`${CODE_FENCE_LANG}\n${item.content}\n\`\`\`\n\n`;
  }
  return section;
}

/**
 * Generates a complete debate report in markdown format.
 * @param debateState - The complete debate state.
 * @param agentConfigs - Array of agent configurations.
 * @param judgeConfig - Judge configuration.
 * @param problemDescription - The full problem description text.
 * @param options - Options including verbose flag.
 * @returns Complete markdown report string.
 */
export function generateDebateReport(
  debateState: DebateState,
  agentConfigs: AgentConfig[],
  judgeConfig: AgentConfig,
  problemDescription: string,
  options: { verbose?: boolean }
): string {
  const title = extractFirstLine(problemDescription);
  const time = formatLocalTime(debateState.createdAt);
  const verbose = options.verbose || false;

  let report = `# Debate: ${title}\n`;
  report += `Time: ${time}\n\n`;

  // Problem Description section
  report += `## Problem Description\n`;
  report += `\`\`\`text\n${problemDescription}\n\`\`\`\n\n`;

  // Agents section
  report += `## Agents\n\n`;
  report += formatAgentsTable(agentConfigs);
  report += `\n\n`;

  // Clarifications section (if any)
  if (debateState.clarifications && debateState.clarifications.length > 0) {
    report += `## Clarifications\n\n`;
    for (const group of debateState.clarifications) {
      report += `### ${group.agentName} (${group.role})\n`;
      for (const item of group.items) {
        report += `Question (${item.id}):\n\n\`\`\`${CODE_FENCE_LANG}\n${item.question}\n\`\`\`\n\n`;
        report += `Answer:\n\n\`\`\`${CODE_FENCE_LANG}\n${item.answer}\n\`\`\`\n\n`;
      }
    }
    report += `\n`;
  }

  // Judge section
  report += `## Judge\n\n`;
  report += formatJudgeTable(judgeConfig);
  report += `\n\n`;

  // Rounds section
  report += `## Rounds\n\n`;

  for (const round of debateState.rounds) {
    report += `### Round ${round.roundNumber}\n\n`;

    // Proposals
    const formattedProposals = formatProposals(round.contributions, verbose);
    report += renderContributionSection('Proposals', formattedProposals, NO_PROPOSALS_MSG);

    // Critiques
    const formattedCritiques = formatCritiques(round.contributions, verbose);
    report += renderContributionSection('Critiques', formattedCritiques, NO_CRITIQUES_MSG);

    // Refinements
    const formattedRefinements = formatRefinements(round.contributions, verbose);
    report += renderContributionSection('Refinements', formattedRefinements, NO_REFINEMENTS_MSG);
  }

  // Final Synthesis section
  report += `### Final Synthesis\n`;
  if (debateState.finalSolution) {
    report += `\`\`\`text\n${debateState.finalSolution.description}\n\`\`\`\n`;
  } else {
    report += `\`\`\`text\nNo final solution available.\n\`\`\`\n`;
  }

  return report;
}
