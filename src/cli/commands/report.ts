import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { infoUser, writeStderr } from '../index';
import { loadConfig } from './debate';
import { SystemConfig } from '../../types/config.types';
import { DebateState } from '../../types/debate.types';
import { AgentConfig } from '../../types/agent.types';
import { generateDebateReport } from '../../utils/report-generator';

const FILE_ENCODING_UTF8 = 'utf-8';

/**
 * Creates a validation error with a custom error code.
 * 
 * @param message - The error message to associate with the error.
 * @param code - The numeric error code indicating the exit or validation type.
 * @returns An Error object with the specified message and an added 'code' property.
 */
function createValidationError(message: string, code: number): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

/**
 * Reads a JSON file from the given path, validates its existence and file type, parses its contents,
 * and returns the parsed object. Throws a validation error with an appropriate exit code if the file 
 * does not exist, is not a regular file, or does not contain valid JSON.
 * 
 * @template T The expected return type for the parsed JSON object.
 * @param p - The path to the JSON file, relative to the current working directory.
 * @returns The parsed JSON object of type T.
 * @throws {Error} Throws a validation error with a specific exit code if:
 *   - The file does not exist (EXIT_INVALID_ARGS).
 *   - The path is not a file (EXIT_INVALID_ARGS).
 *   - The file contains invalid JSON (EXIT_INVALID_ARGS).
 */
function readJsonFile<T>(p: string): T {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    throw createValidationError(`Debate file not found: ${abs}`, EXIT_INVALID_ARGS);
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw createValidationError(`Path is not a file: ${abs}`, EXIT_INVALID_ARGS);
  }
  const raw = fs.readFileSync(abs, FILE_ENCODING_UTF8);
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    throw createValidationError(`Invalid JSON format in debate file: ${abs}`, EXIT_INVALID_ARGS);
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
  const debate: DebateState = readJsonFile<DebateState>(debatePath);
  
  // Validate required fields
  if (!debate.id || typeof debate.id !== 'string') {
    throw createValidationError('Invalid debate JSON: missing or invalid id field', EXIT_INVALID_ARGS);
  }
  if (!debate.problem || typeof debate.problem !== 'string') {
    throw createValidationError('Invalid debate JSON: missing or invalid problem field', EXIT_INVALID_ARGS);
  }
  if (!debate.status || typeof debate.status !== 'string') {
    throw createValidationError('Invalid debate JSON: missing or invalid status field', EXIT_INVALID_ARGS);
  }
  if (!Array.isArray(debate.rounds)) {
    throw createValidationError('Invalid debate JSON: missing or invalid rounds array', EXIT_INVALID_ARGS);
  }
  
  // Revive Date objects if they are strings
  if (debate.createdAt && typeof debate.createdAt === 'string') {
    debate.createdAt = new Date(debate.createdAt);
  }
  if (debate.updatedAt && typeof debate.updatedAt === 'string') {
    debate.updatedAt = new Date(debate.updatedAt);
  }
  
  // Revive round timestamps
  for (const round of debate.rounds) {
    if (round.timestamp && typeof round.timestamp === 'string') {
      round.timestamp = new Date(round.timestamp);
    }
  }
  
  return debate;
}

/**
 * Extracts unique agent IDs from the debate state by examining all contributions.
 * 
 * @param debateState - The debate state to extract agent IDs from.
 * @returns Array of unique agent IDs found in the debate.
 */
function extractAgentIdsFromDebate(debateState: DebateState): string[] {
  const agentIds = new Set<string>();
  
  for (const round of debateState.rounds) {
    for (const contribution of round.contributions) {
      if (contribution.agentId) {
        agentIds.add(contribution.agentId);
      }
    }
  }
  
  return Array.from(agentIds);
}

/**
 * Matches agent configurations from the config file with agent IDs found in the debate state.
 * 
 * @param sysConfig - The system configuration containing agent configs.
 * @param agentIds - Array of agent IDs found in the debate state.
 * @returns Array of agent configurations that match the agent IDs in the debate.
 */
function matchAgentConfigs(sysConfig: SystemConfig, agentIds: string[]): AgentConfig[] {
  const matchedConfigs: AgentConfig[] = [];
  
  for (const agentId of agentIds) {
    const config = sysConfig.agents.find(a => a.id === agentId);
    if (config) {
      matchedConfigs.push(config);
    }
  }
  
  return matchedConfigs;
}

/**
 * Writes the report content to stdout or a file.
 * 
 * @param reportContent - The markdown report content to write.
 * @param outputPath - Optional path to output file. If not provided, writes to stdout.
 * @throws {Error} If file writing fails.
 */
async function writeReport(reportContent: string, outputPath?: string): Promise<void> {
  if (!outputPath) {
    // Write to stdout
    process.stdout.write(reportContent);
    return;
  }
  
  // Write to file
  const reportPath = path.resolve(process.cwd(), outputPath);
  
  // Ensure parent directories exist
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // Write file (overwrites if exists)
  await fs.promises.writeFile(reportPath, reportContent, FILE_ENCODING_UTF8);
  infoUser(`Generated report: ${reportPath}`);
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
 *   --config <path>      Optional: Path to configuration file (default: ./debate-config.json).
 *   --output <path>      Optional: Path to output markdown file. If not provided, writes to stdout.
 *   -v, --verbose        Optional: Enable verbose mode for report generation.
 * 
 * Behavior:
 *   - Loads and validates the debate state file.
 *   - Loads configuration file (or uses defaults) to get agent and judge configurations.
 *   - Matches agent configs with agent IDs found in the debate state.
 *   - Generates markdown report using generateDebateReport.
 *   - Writes report to file or stdout.
 * 
 * Errors:
 *   - Exits with explicit error codes and user-friendly messages on invalid arguments,
 *     missing files, or report generation failures.
 */
export function reportCommand(program: Command) {
  program
    .command('report')
    .requiredOption('--debate <path>', 'Path to debate JSON file (DebateState)')
    .option('--config <path>', 'Path to configuration file (default: ./debate-config.json)')
    .option('-o, --output <path>', 'Path to output markdown file (default: stdout)')
    .option('-v, --verbose', 'Verbose mode for report generation')
    .description('Generate a markdown report from a saved debate state')
    .action(async (options: any) => {
      try {
        // Load and validate debate state
        const debateState = loadAndValidateDebateState(options.debate);
        
        // Load configuration to get agent and judge configs
        const sysConfig = await loadConfig(options.config);
        
        // Extract agent IDs from debate state
        const agentIds = extractAgentIdsFromDebate(debateState);
        
        // Match agent configs with agent IDs from debate
        const agentConfigs = matchAgentConfigs(sysConfig, agentIds);
        
        // Get judge config (use default if not found)
        if (!sysConfig.judge) {
          throw createValidationError('Configuration missing judge definition', EXIT_INVALID_ARGS);
        }
        const judgeConfig = sysConfig.judge;
        
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
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        writeStderr((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}

