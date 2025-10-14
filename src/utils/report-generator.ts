import { DebateState, Contribution, CONTRIBUTION_TYPES } from '../types/debate.types';
import { AgentConfig } from '../types/agent.types';

/**
 * Formats a date to YYYY-MM-DD HH:mm:ss local time string.
 * @param date - The date to format.
 * @returns Formatted date string.
 */
function formatLocalTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
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
    const id = agent.id || 'N/A';
    const name = agent.name || 'N/A';
    const role = agent.role || 'N/A';
    const model = agent.model || 'N/A';
    const provider = agent.provider || 'N/A';
    const temperature = agent.temperature !== undefined ? agent.temperature.toString() : 'N/A';
    const enabled = agent.enabled !== undefined ? agent.enabled.toString() : 'N/A';
    const systemPromptPath = agent.systemPromptPath !== undefined ? String(agent.systemPromptPath) : 'N/A';
    const summaryPromptPath = agent.summaryPromptPath !== undefined ? String(agent.summaryPromptPath) : 'N/A';
    const summarization = agent.summarization !== undefined ? JSON.stringify(agent.summarization) : 'N/A';
    
    table += `| ${id} | ${name} | ${role} | ${model} | ${provider} | ${temperature} | ${enabled} | ${systemPromptPath} | ${summaryPromptPath} | ${summarization} |\n`;
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

  const id = judge.id || 'N/A';
  const name = judge.name || 'N/A';
  const role = judge.role || 'N/A';
  const model = judge.model || 'N/A';
  const provider = judge.provider || 'N/A';
  const temperature = judge.temperature !== undefined ? judge.temperature.toString() : 'N/A';
  const enabled = (judge as any).enabled !== undefined ? String((judge as any).enabled) : 'N/A';
  const systemPromptPath = judge.systemPromptPath !== undefined ? String(judge.systemPromptPath) : 'N/A';
  const summaryPromptPath = judge.summaryPromptPath !== undefined ? String(judge.summaryPromptPath) : 'N/A';
  const summarization = judge.summarization !== undefined ? JSON.stringify(judge.summarization) : 'N/A';
  
  table += `| ${id} | ${name} | ${role} | ${model} | ${provider} | ${temperature} | ${enabled} | ${systemPromptPath} | ${summaryPromptPath} | ${summarization} |\n`;

  return table;
}

/**
 * Formats contribution metadata for verbose mode.
 * @param contribution - The contribution to format metadata for.
 * @returns Metadata string or empty string if not verbose.
 */
function formatContributionMetadata(contribution: Contribution, verbose: boolean): string {
  if (!verbose) {
    return '';
  }

  const latency = contribution.metadata.latencyMs !== undefined 
    ? contribution.metadata.latencyMs.toString() 
    : 'N/A';
  const tokens = contribution.metadata.tokensUsed !== undefined 
    ? contribution.metadata.tokensUsed.toString() 
    : 'N/A';

  return ` (latency=${latency}ms, tokens=${tokens})`;
}

/**
 * Formats proposals for a round.
 * @param contributions - Array of proposal contributions.
 * @param verbose - Whether to include metadata.
 * @returns Formatted proposals string.
 */
function formatProposals(contributions: Contribution[], verbose: boolean): string {
  const proposals = contributions.filter(c => c.type === CONTRIBUTION_TYPES.PROPOSAL);
  
  if (proposals.length === 0) {
    return 'No proposals in this round.';
  }

  let result = '';
  for (const proposal of proposals) {
    const metadata = formatContributionMetadata(proposal, verbose);
    result += `Agent ${proposal.agentId}${metadata}:\n${proposal.content}\n\n`;
  }

  return result.trim();
}

/**
 * Formats critiques for a round.
 * @param contributions - Array of critique contributions.
 * @param verbose - Whether to include metadata.
 * @returns Formatted critiques string.
 */
function formatCritiques(contributions: Contribution[], verbose: boolean): string {
  const critiques = contributions.filter(c => c.type === CONTRIBUTION_TYPES.CRITIQUE);
  
  if (critiques.length === 0) {
    return 'No critiques in this round.';
  }

  let result = '';
  for (const critique of critiques) {
    const metadata = formatContributionMetadata(critique, verbose);
    const target = critique.targetAgentId || 'unknown';
    result += `${critique.agentId} --> ${target}${metadata}: ${critique.content}\n\n`;
  }

  return result.trim();
}

/**
 * Formats refinements for a round.
 * @param contributions - Array of refinement contributions.
 * @param verbose - Whether to include metadata.
 * @returns Formatted refinements string.
 */
function formatRefinements(contributions: Contribution[], verbose: boolean): string {
  const refinements = contributions.filter(c => c.type === CONTRIBUTION_TYPES.REFINEMENT);
  
  if (refinements.length === 0) {
    return 'No refinements in this round.';
  }

  let result = '';
  for (const refinement of refinements) {
    const metadata = formatContributionMetadata(refinement, verbose);
    result += `Agent ${refinement.agentId}${metadata}:\n${refinement.content}\n\n`;
  }

  return result.trim();
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

  // Judge section
  report += `## Judge\n\n`;
  report += formatJudgeTable(judgeConfig);
  report += `\n\n`;

  // Rounds section
  report += `## Rounds\n\n`;

  for (const round of debateState.rounds) {
    report += `### Round ${round.roundNumber}\n\n`;

    // Proposals
    report += `#### Proposals\n`;
    report += `\`\`\`text\n${formatProposals(round.contributions, verbose)}\n\`\`\`\n\n`;

    // Critiques
    report += `#### Critiques\n`;
    report += `\`\`\`text\n${formatCritiques(round.contributions, verbose)}\n\`\`\`\n\n`;

    // Refinements
    report += `#### Refinements\n`;
    report += `\`\`\`text\n${formatRefinements(round.contributions, verbose)}\n\`\`\`\n\n`;
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
