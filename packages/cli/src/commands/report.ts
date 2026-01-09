import { Command } from 'commander';
import {
  EXIT_INVALID_ARGS,
  EXIT_GENERAL_ERROR,
  writeStderr,
  SystemConfig,
  DebateState,
  AgentConfig,
  AGENT_ROLES,
  LLM_PROVIDERS,
  generateDebateReport,
  createValidationError,
  readJsonFile,
  writeFileWithDirectories,
  ErrorWithCode,
} from 'dialectic-core';

import { infoUser } from '../index';

import { loadConfig } from './debate';

// Import from dialectic-core

// Error message constants
const ERROR_INVALID_DEBATE_JSON = 'Invalid debate JSON';
const ERROR_MISSING_FIELD = 'missing or invalid';
const ERROR_MISSING_ID_FIELD = `${ERROR_INVALID_DEBATE_JSON}: ${ERROR_MISSING_FIELD} id field`;
const ERROR_MISSING_PROBLEM_FIELD = `${ERROR_INVALID_DEBATE_JSON}: ${ERROR_MISSING_FIELD} problem field`;
const ERROR_MISSING_STATUS_FIELD = `${ERROR_INVALID_DEBATE_JSON}: ${ERROR_MISSING_FIELD} status field`;
const ERROR_MISSING_ROUNDS_FIELD = `${ERROR_INVALID_DEBATE_JSON}: ${ERROR_MISSING_FIELD} rounds array`;

/**
 * Revives Date objects in a debate state that were serialized as strings.
 * 
 * @param debateState - The debate state to revive dates in.
 */
function reviveDatesInDebateState(debateState: DebateState): void {
  // Revive top-level dates
  if (debateState.createdAt && typeof debateState.createdAt === 'string') {
    debateState.createdAt = new Date(debateState.createdAt);
  }
  if (debateState.updatedAt && typeof debateState.updatedAt === 'string') {
    debateState.updatedAt = new Date(debateState.updatedAt);
  }
  
  // Revive round timestamps
  for (const round of debateState.rounds) {
    if (round.timestamp && typeof round.timestamp === 'string') {
      round.timestamp = new Date(round.timestamp);
    }
  }
}

/**
 * Loads and validates a debate state from a JSON file.
 * 
 * @param debatePath - Path to the debate JSON file.
 * @returns The loaded and validated DebateState.
 * @throws {Error} If the file doesn't exist, is invalid JSON, or lacks required fields.
 */
function loadAndValidateDebateState(debatePath: string): DebateState {
  const debate: DebateState = readJsonFile<DebateState>(debatePath, 'Debate file');
  
  // Validate required fields
  if (!debate.id || typeof debate.id !== 'string') {
    throw createValidationError(ERROR_MISSING_ID_FIELD, EXIT_INVALID_ARGS);
  }
  if (!debate.problem || typeof debate.problem !== 'string') {
    throw createValidationError(ERROR_MISSING_PROBLEM_FIELD, EXIT_INVALID_ARGS);
  }
  if (!debate.status || typeof debate.status !== 'string') {
    throw createValidationError(ERROR_MISSING_STATUS_FIELD, EXIT_INVALID_ARGS);
  }
  if (!Array.isArray(debate.rounds)) {
    throw createValidationError(ERROR_MISSING_ROUNDS_FIELD, EXIT_INVALID_ARGS);
  }
  
  // Revive Date objects if they were serialized as strings
  reviveDatesInDebateState(debate);
  
  return debate;
}

/**
 * Extracts unique agent IDs and roles from the debate state by examining all contributions.
 * 
 * @param debateState - The debate state to extract agent IDs from.
 * @returns Map of agent IDs to their roles.
 */
function extractAgentInfoFromDebate(debateState: DebateState): Map<string, string> {
  const agentInfo = new Map<string, string>();
  
  for (const round of debateState.rounds) {
    for (const contribution of round.contributions) {
      if (contribution.agentId && contribution.agentRole) {
        // Only set if not already set (first occurrence wins)
        if (!agentInfo.has(contribution.agentId)) {
          agentInfo.set(contribution.agentId, contribution.agentRole);
        }
      }
    }
  }
  
  return agentInfo;
}

/**
 * Creates minimal agent configurations from debate state when config file is not provided.
 * 
 * @param debateState - The debate state to extract agent information from.
 * @returns Array of minimal agent configurations.
 */
function createMinimalAgentConfigsFromDebate(debateState: DebateState): AgentConfig[] {
  const agentInfo = extractAgentInfoFromDebate(debateState);
  const agentConfigs: AgentConfig[] = [];
  
  for (const [agentId, role] of agentInfo.entries()) {
    // Validate role is a valid AgentRole, default to 'architect' if invalid
    const validRoleValues = Object.values(AGENT_ROLES) as string[];
    const validRole = validRoleValues.includes(role) 
      ? (role as typeof AGENT_ROLES[keyof typeof AGENT_ROLES])
      : AGENT_ROLES.ARCHITECT;
    
    // Create minimal config with only required fields
    agentConfigs.push({
      id: agentId,
      name: agentId, // Use ID as name fallback
      role: validRole,
      model: 'N/A',
      provider: LLM_PROVIDERS.OPENAI,
      temperature: 0.5 // Default temperature
    });
  }
  
  return agentConfigs;
}

/**
 * Creates a minimal judge configuration when config file is not provided.
 * 
 * @param debateState - The debate state (may contain judge info in finalSolution).
 * @returns Minimal judge configuration.
 */
function createMinimalJudgeConfigFromDebate(debateState: DebateState): AgentConfig {
  // Extract judge ID from finalSolution if available
  const judgeId = debateState.finalSolution?.synthesizedBy || 'judge-main';
  
  return {
    id: judgeId,
    name: judgeId,
    role: AGENT_ROLES.GENERALIST,
    model: 'N/A',
    provider: LLM_PROVIDERS.OPENAI,
    temperature: 0.3 // Default judge temperature
  };
}

/**
 * Matches agent configurations from the config file with agent IDs found in the debate state.
 * 
 * @param sysConfig - The system configuration containing agent configs.
 * @param agentIds - Array of agent IDs found in the debate state.
 * @returns Array of agent configurations that match the agent IDs in the debate.
 */
function matchAgentConfigsFromSysConfig(sysConfig: SystemConfig, agentIds: string[]): AgentConfig[] {
  return agentIds
    .map((agentId) => sysConfig.agents.find((a) => a.id === agentId))
    .filter((config): config is AgentConfig => config !== undefined);
}

/**
 * Writes the report content to stdout or a file.
 * 
 * If no output path is provided, writes to stdout (for piping/redirection).
 * If an output path is provided, creates parent directories if needed and writes the file,
 * overwriting any existing file at that path.
 * 
 * @param reportContent - The markdown report content to write.
 * @param outputPath - Optional path to output file. If not provided, writes to stdout.
 * @throws {Error} If file writing fails.
 */
async function writeReport(reportContent: string, outputPath?: string): Promise<void> {
  if (!outputPath) {
    // Write to stdout (allows piping: report --debate file.json > output.md)
    process.stdout.write(reportContent);
    return;
  }
  
  // Write to file (handles path normalization and directory creation)
  const writtenPath = await writeFileWithDirectories(outputPath, reportContent);
  infoUser(`Generated report: ${writtenPath}`);
}

/**
 * Options for the report command.
 */
interface ReportCommandOptions {
  debate: string;
  config?: string;
  output?: string;
  verbose?: boolean;
}

/**
 * Registers the 'report' CLI command, which generates a markdown report from a saved debate state.
 * 
 * This command loads a debate state JSON file, loads the corresponding configuration file,
 * matches agent configurations with agent IDs found in the debate, and generates a markdown report.
 * 
 * @param program - Commander.js program object to which the command is added.
 * 
 * Command-line Options:
 *   --debate <path>      Required: Path to debate JSON file (DebateState format).
 *   --config <path>      Optional: Path to configuration file. If not provided, creates minimal configs from debate state.
 *   --output <path>      Optional: Path to output markdown file. If not provided, writes to stdout.
 *   -v, --verbose        Optional: Enable verbose mode for report generation.
 * 
 * Behavior:
 *   - Loads and validates the debate state file.
 *   - If --config is provided: loads configuration file and matches agent/judge configs with IDs found in debate state.
 *   - If --config is not provided: creates minimal agent/judge configs from debate state (no validation of IDs).
 *   - Generates markdown report using generateDebateReport.
 *   - Writes report to file or stdout.
 * 
 * Errors:
 *   - Exits with explicit error codes and user-friendly messages on invalid arguments,
 *     missing files, or report generation failures.
 */
export function reportCommand(program: Command): void {
  program
    .command('report')
    .requiredOption('--debate <path>', 'Path to debate JSON file (DebateState)')
    .option('--config <path>', 'Path to configuration file (default: ./debate-config.json)')
    .option('-o, --output <path>', 'Path to output markdown file (default: stdout)')
    .option('-v, --verbose', 'Verbose mode for report generation')
    .description('Generate a markdown report from a saved debate state')
    .action(async (options: ReportCommandOptions) => {
      try {
        // Load and validate debate state
        const debateState = loadAndValidateDebateState(options.debate);
        
        let agentConfigs: AgentConfig[];
        let judgeConfig: AgentConfig;
        
        // Only load config if --config is explicitly provided
        if (options.config) {
          // Load configuration to get agent and judge configs
          const sysConfig = await loadConfig(options.config);
          
          // Extract agent IDs from debate state
          const agentInfo = extractAgentInfoFromDebate(debateState);
          const agentIds = Array.from(agentInfo.keys());
          
          // Match agent configs with agent IDs from debate
          agentConfigs = matchAgentConfigsFromSysConfig(sysConfig, agentIds);
          
          // Get judge config (loadConfig ensures judge is always present, either from config or defaults)
          // This check is defensive but should never fail in practice
          if (!sysConfig.judge) {
            throw createValidationError('Configuration missing judge definition', EXIT_INVALID_ARGS);
          }
          judgeConfig = sysConfig.judge;
        } else {
          // No config provided - create minimal configs from debate state
          agentConfigs = createMinimalAgentConfigsFromDebate(debateState);
          judgeConfig = createMinimalJudgeConfigFromDebate(debateState);
        }
        
        // Generate report
        const reportContent = generateDebateReport(
          debateState,
          agentConfigs,
          judgeConfig,
          debateState.problem,
          { verbose: options.verbose || false }
        );
        
        // Write report
        await writeReport(reportContent, options.output);
      } catch (err: unknown) {
        const errorWithCode = err as ErrorWithCode;
        const code = (errorWithCode && typeof errorWithCode.code === 'number') ? errorWithCode.code : EXIT_GENERAL_ERROR;
        writeStderr((errorWithCode.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(errorWithCode.message || 'Unknown error'), { code });
      }
    });
}

