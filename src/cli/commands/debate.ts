import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { warnUser, infoUser, writeStderr } from '../index';
import { SystemConfig } from '../../types/config.types';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS, PROMPT_SOURCES, AgentPromptMetadata, JudgePromptMetadata, PromptSource } from '../../types/agent.types';
import { DebateConfig, DebateResult, DebateRound, Contribution, TERMINATION_TYPES, SYNTHESIS_METHODS, CONTRIBUTION_TYPES } from '../../types/debate.types';
import { OpenAIProvider } from '../../providers/openai-provider';
import { RoleBasedAgent } from '../../agents/role-based-agent';
import { JudgeAgent } from '../../core/judge';
import { StateManager } from '../../core/state-manager';
import { DebateOrchestrator } from '../../core/orchestrator';
import { resolvePrompt } from '../../utils/prompt-loader';
import { loadEnvironmentFile } from '../../utils/env-loader';
import { Agent } from '../../core/agent';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'debate-config.json');
const DEFAULT_ROUNDS = 3;

// File handling constants
const FILE_ENCODING_UTF8 = 'utf-8';
const JSON_FILE_EXTENSION = '.json';
const JSON_INDENT_SPACES = 2;

// Problem resolution error messages
const ERROR_BOTH_PROBLEM_SOURCES = 'Invalid arguments: provide exactly one of <problem> or --problemDescription';
const ERROR_NO_PROBLEM_SOURCE = 'Invalid arguments: problem is required (provide <problem> or --problemDescription)';
const ERROR_FILE_NOT_FOUND = 'Invalid arguments: problem description file not found';
const ERROR_PATH_IS_DIRECTORY = 'Invalid arguments: problem description path is a directory';
const ERROR_FILE_EMPTY = 'Invalid arguments: problem description file is empty';
const ERROR_FILE_READ_FAILED = 'Failed to read problem description file';

// Default agent identifiers and names
const DEFAULT_ARCHITECT_ID = 'agent-architect';
const DEFAULT_ARCHITECT_NAME = 'System Architect';
const DEFAULT_PERFORMANCE_ID = 'agent-performance';
const DEFAULT_PERFORMANCE_NAME = 'Performance Engineer';
const DEFAULT_JUDGE_ID = 'judge-main';
const DEFAULT_JUDGE_NAME = 'Technical Judge';

// Default LLM configuration
const DEFAULT_LLM_MODEL = 'gpt-4';
const DEFAULT_AGENT_TEMPERATURE = 0.5;
const DEFAULT_JUDGE_TEMPERATURE = 0.3;

/**
 * Returns the built-in default system configuration for the debate system.
 *
 * This includes:
 * - Two default agents: a System Architect and a Performance Engineer, both using the GPT-4 model via OpenAI.
 * - A default judge agent with the role of "generalist" and a lower temperature for more deterministic judging.
 * - Default debate configuration: 3 rounds, fixed termination, judge-based synthesis, full history included, and a 5-minute timeout per round.
 *
 * @returns {SystemConfig} The default system configuration object.
 */
function builtInDefaults(): SystemConfig {
  const defaultAgents: AgentConfig[] = [
    { id: DEFAULT_ARCHITECT_ID, name: DEFAULT_ARCHITECT_NAME, role: AGENT_ROLES.ARCHITECT, 
      model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
    { id: DEFAULT_PERFORMANCE_ID, name: DEFAULT_PERFORMANCE_NAME, role: AGENT_ROLES.PERFORMANCE, 
      model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
  ];
  const judge: AgentConfig = {  id: DEFAULT_JUDGE_ID, name: DEFAULT_JUDGE_NAME, role: AGENT_ROLES.GENERALIST, 
                                model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_JUDGE_TEMPERATURE };
  const debate: DebateConfig = {  rounds: DEFAULT_ROUNDS, terminationCondition: { type: TERMINATION_TYPES.FIXED }, 
                                  synthesisMethod: SYNTHESIS_METHODS.JUDGE, includeFullHistory: true, timeoutPerRound: 300000 };
  return { agents: defaultAgents, judge, debate } as SystemConfig;
}

/**
 * Loads the system configuration for the debate system from a specified file path,
 * or falls back to a default location and built-in defaults if the file is missing or incomplete.
 *
 * This function attempts to read and parse a JSON configuration file containing agent, judge,
 * and debate settings. If the file does not exist, or if required fields are missing,
 * it prints a warning to stderr and uses built-in defaults for the missing parts.
 *
 * The function ensures that:
 *   - If the config file is missing, the entire built-in default configuration is used.
 *   - If the config file is present but missing the 'agents' array or it is empty,
 *     the entire built-in default configuration is used.
 *   - If the config file is missing the 'judge' or 'debate' fields, those fields are filled in
 *     from the built-in defaults, and a warning is printed.
 *
 * @param {string} [configPath] - Optional path to the configuration file. If not provided,
 *   uses the default path ('debate-config.json' in the current working directory).
 * @returns {Promise<SystemConfig>} The loaded and validated system configuration object.
 */
export async function loadConfig(configPath?: string): Promise<SystemConfig> {
  const finalPath = configPath ? path.resolve(process.cwd(), configPath) : DEFAULT_CONFIG_PATH;
  const defaults = builtInDefaults();
  
  if (!fs.existsSync(finalPath)) {
    warnUser(`Config not found at ${finalPath}. Using built-in defaults.`);
    defaults.configDir = process.cwd();
    return defaults;
  }
  
  const raw = await fs.promises.readFile(finalPath, FILE_ENCODING_UTF8);
  const parsed = JSON.parse(raw);
  
  // Ensure shape minimal
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    warnUser('Config missing agents. Using built-in defaults.');
    defaults.configDir = path.dirname(finalPath);
    return defaults;
  }
  
  if (!parsed.judge) {
    warnUser('Config missing judge. Using default judge.');
    parsed.judge = defaults.judge;
  }
  
  if (!parsed.debate) {
    parsed.debate = defaults.debate;
  }
  
  parsed.configDir = path.dirname(finalPath);
  return parsed as SystemConfig;
}

/**
 * Helper to create an agent instance with prompt resolution and metadata collection.
 * Resolves the system prompt from file or default, creates the agent, and records provenance.
 * 
 * @param cfg - Agent configuration containing role, model, and other settings.
 * @param provider - OpenAI provider instance for LLM interactions.
 * @param configDir - Directory path where the configuration file is located.
 * @param collect - Collection object to record prompt source metadata.
 * @returns A configured RoleBasedAgent instance.
 */
function createAgentWithPromptResolution( cfg: AgentConfig, provider: OpenAIProvider, configDir: string, collect: { agents: AgentPromptMetadata[] } ): Agent
{
  const defaultText = RoleBasedAgent.defaultSystemPrompt(cfg.role);
  const res = resolvePrompt({
    label: cfg.name,
    configDir,
    ...(cfg.systemPromptPath !== undefined && { promptPath: cfg.systemPromptPath }),
    defaultText
  });
  
  const promptSource: PromptSource = res.source === PROMPT_SOURCES.FILE
    ? { source: PROMPT_SOURCES.FILE, ...(res.absPath !== undefined && { absPath: res.absPath }) }
    : { source: PROMPT_SOURCES.BUILT_IN };
  
  const agent = RoleBasedAgent.create(cfg, provider, res.text, promptSource);
  
  collect.agents.push({
    agentId: cfg.id,
    role: cfg.role,
    source: res.source,
    ...(res.absPath !== undefined && { path: res.absPath })
  });
  
  return agent;
}

/**
 * Builds an array of Agent instances based on the provided configuration and LLM provider.
 *
 * Creates RoleBasedAgent instances for each agent configuration, resolving system prompts
 * from files or defaults, and collecting metadata about prompt sources. The RoleBasedAgent
 * class handles all roles through a prompt registry, eliminating the need for role-specific
 * agent classes.
 *
 * @param agentConfigs - Array of agent configurations.
 * @param provider - OpenAI provider instance.
 * @param configDir - Directory where the config file is located, used for resolving relative prompt paths.
 * @param collect - Object to collect prompt metadata.
 * @returns Array of Agent instances.
 */
function buildAgents( agentConfigs: AgentConfig[], provider: OpenAIProvider, configDir: string, collect: { agents: AgentPromptMetadata[] } ): Agent[]
{
  return agentConfigs.map((cfg) => createAgentWithPromptResolution(cfg, provider, configDir, collect));
}

/**
 * Creates a DebateConfig from the system configuration and command-line options.
 * Validates that the number of rounds is at least 1.
 *
 * @param {SystemConfig} sysConfig - The system configuration.
 * @param {any} options - Command-line options containing optional rounds override.
 * @returns {DebateConfig} The debate configuration.
 * @throws {Error} If rounds is less than 1.
 */
function debateConfigFromSysConfig(sysConfig: SystemConfig, options: any): DebateConfig {
  const debateCfg: DebateConfig = {
    ...sysConfig.debate!,
    rounds: options.rounds ? parseInt(options.rounds, 10) : (sysConfig.debate?.rounds ?? DEFAULT_ROUNDS),
  } as DebateConfig;
  
  if (!debateCfg.rounds || debateCfg.rounds < 1) {
    throw createValidationError('Invalid arguments: --rounds must be >= 1', EXIT_INVALID_ARGS);
  }
  
  return debateCfg;
}

/**
 * Filters and returns agent configurations from the system configuration based on command-line options.
 * If specific agent roles are provided via options, only agents with matching roles are included.
 * If no agents are selected after filtering, defaults to built-in agents.
 *
 * @param {SystemConfig} sysConfig - The system configuration.
 * @param {any} options - Command-line options containing optional agent roles filter.
 * @returns {AgentConfig[]} Array of filtered agent configurations.
 */
function agentConfigsFromSysConfig(sysConfig: SystemConfig, options: any): AgentConfig[] {
  let agentConfigs = sysConfig.agents.filter((a) => a.enabled !== false);
  
  if (options.agents) {
    const roles = String(options.agents).split(',').map((r: string) => r.trim());
    agentConfigs = agentConfigs.filter((a) => roles.includes(a.role));
  }
  
  if (agentConfigs.length === 0) {
    warnUser('No agents selected; defaulting to architect,performance.');
    const defaults = builtInDefaults();
    agentConfigs = defaults.agents;
  }
  
  return agentConfigs;
}

/**
 * Creates an error object with the specified message and exit code.
 * @param message - Error message to display.
 * @param code - Exit code for the error.
 * @returns Error object with code property.
 */
function createValidationError(message: string, code: number): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

/**
 * Validates the exactly-one constraint for problem sources.
 * @param hasProblem - Whether problem string is provided.
 * @param hasFile - Whether problemDescription file is provided.
 * @throws {Error} If both or neither are provided.
 */
function validateExactlyOneProblemSource(hasProblem: boolean, hasFile: boolean): void {
  if (hasProblem && hasFile) {
    throw createValidationError(ERROR_BOTH_PROBLEM_SOURCES, EXIT_INVALID_ARGS);
  }
  if (!hasProblem && !hasFile) {
    throw createValidationError(ERROR_NO_PROBLEM_SOURCE, EXIT_INVALID_ARGS);
  }
}

/**
 * Validates that the file path exists and is a file (not directory).
 * @param filePath - Absolute path to the file.
 * @throws {Error} If file doesn't exist or is a directory.
 */
function validateFilePathExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw createValidationError(`${ERROR_FILE_NOT_FOUND}: ${filePath}`, EXIT_INVALID_ARGS);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    throw createValidationError(`${ERROR_PATH_IS_DIRECTORY}: ${filePath}`, EXIT_INVALID_ARGS);
  }
}

/**
 * Reads and validates file content.
 * @param filePath - Absolute path to the file.
 * @returns File content as string.
 * @throws {Error} If file is empty or read fails.
 */
async function readAndValidateFileContent(filePath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(filePath, FILE_ENCODING_UTF8);
    
    // Check if content is non-empty after trimming (whitespace-only = empty)
    if (content.trim().length === 0) {
      throw createValidationError(`${ERROR_FILE_EMPTY}: ${filePath}`, EXIT_INVALID_ARGS);
    }

    // Return raw content (preserve formatting)
    return content;
  } catch (error: any) {
    if (error.code === EXIT_INVALID_ARGS) {
      throw error;
    }
    // Handle read errors
    throw createValidationError(`${ERROR_FILE_READ_FAILED}: ${error.message}`, EXIT_GENERAL_ERROR);
  }
}

/**
 * Resolves the problem description from either command line string or file.
 * Enforces exactly-one constraint and validates file content.
 *
 * @param {string | undefined} problem - Optional problem string from command line.
 * @param {any} options - Command-line options containing optional problemDescription.
 * @returns {Promise<string>} The resolved problem description.
 * @throws {Error} If validation fails or file operations fail.
 */
async function resolveProblemDescription(problem: string | undefined, options: any): Promise<string> {
  const hasProblem = !!(problem && problem.trim().length > 0);
  const hasFile = !!options.problemDescription;

  // Validate exactly-one constraint
  validateExactlyOneProblemSource(hasProblem, hasFile);

  // Return problem string if provided
  if (hasProblem) {
    return problem!.trim();
  }

  // Handle file-based problem description
  const filePath = path.resolve(process.cwd(), options.problemDescription);
  validateFilePathExists(filePath);
  return await readAndValidateFileContent(filePath);
}

/**
 * Outputs a summary of a single debate round to stderr for verbose mode.
 * Lists all contributions (proposals, critiques, refinements) with metadata.
 *
 * @param {DebateRound} round - The debate round to summarize.
 */
function outputRoundSummary(round: DebateRound): void {
  writeStderr(`Round ${round.roundNumber}\n`);
  const types = [CONTRIBUTION_TYPES.PROPOSAL, CONTRIBUTION_TYPES.CRITIQUE, CONTRIBUTION_TYPES.REFINEMENT] as const;
  types.forEach((t) => {
    const items = round.contributions.filter((c: Contribution) => c.type === t);
    if (items.length > 0) {
      writeStderr(`  ${t}:\n`);
      items.forEach((c: Contribution) => {
        const firstLine = c.content.split('\n')[0];
        const tokens = (c.metadata && c.metadata.tokensUsed != null) ? c.metadata.tokensUsed : 'N/A';
        const lat = (c.metadata && c.metadata.latencyMs != null) ? `${c.metadata.latencyMs}ms` : 'N/A';
        writeStderr(`    [${c.agentRole}] ${firstLine}\n`);
        writeStderr(`      (latency=${lat}, tokens=${tokens})\n`);
      });
    }
  });
}

/**
 * Outputs the debate results to a file or stdout, with optional verbose summary.
 * If an output path is provided and ends with .json, writes the full debate state.
 * Otherwise, writes the final solution text. If no output path is provided, writes to stdout.
 * When verbose mode is enabled and no output file is specified, also writes a detailed summary.
 *
 * @param {DebateResult} result - The debate result containing the solution and metadata.
 * @param {StateManager} stateManager - The state manager to retrieve the full debate state.
 * @param {any} options - Command-line options containing output path and verbose flag.
 * @returns {Promise<void>} A promise that resolves when output is complete.
 */
async function outputResults(result: DebateResult, stateManager: StateManager, options: any): Promise<void> {
  const outputPath = options.output ? path.resolve(process.cwd(), options.output) : undefined;
  const finalText = result.solution.description + '\n';
  
  if (outputPath) {
    if (outputPath.toLowerCase().endsWith(JSON_FILE_EXTENSION)) {
      const fullState = await stateManager.getDebate(result.debateId);
      await fs.promises.writeFile(outputPath, JSON.stringify(fullState, null, JSON_INDENT_SPACES), FILE_ENCODING_UTF8);
    } else {
      await fs.promises.writeFile(outputPath, finalText, FILE_ENCODING_UTF8);
    }
  } else {
    // stdout minimal
    process.stdout.write(finalText);
  }

  // Verbose summary after solution to stderr (only when not writing to a file)
  if (!outputPath && options.verbose) {
    const debate = await stateManager.getDebate(result.debateId);
    if (debate) {
      writeStderr('\nSummary (verbose)\n');
      debate.rounds.forEach(outputRoundSummary);
      const totalTokens = debate.rounds.reduce((sum, r) => sum + r.contributions.reduce((s, c) => s + (c.metadata.tokensUsed ?? 0), 0), 0);
      writeStderr(`\nTotals: rounds=${result.metadata.totalRounds}, duration=${result.metadata.durationMs}ms, tokens=${totalTokens ?? 'N/A'}\n`);
    }
  }
}

export function debateCommand(program: Command) {
  program
    .command('debate')
    .argument('[problem]', 'Problem statement to debate (provide exactly one of this or --problemDescription)')
    .option('-a, --agents <roles>', 'Comma-separated agent roles (architect,performance,...)')
    .option('-r, --rounds <number>', `Number of rounds (default ${DEFAULT_ROUNDS})`)
    .option('-c, --config <path>', 'Path to configuration file (default ./debate-config.json)')
    .option('-o, --output <path>', 'Output file; .json writes full state, others write final solution text')
    .option('-p, --problemDescription <path>', 'Path to a text file containing the problem description')
    .option('-e, --env-file <path>', 'Path to environment file (default: .env)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (problem: string | undefined, options: any) => {
      try {
        // Load environment variables from .env file
        loadEnvironmentFile(options.envFile, options.verbose);
        
        const resolvedProblem = await resolveProblemDescription(problem, options);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          const err: any = new Error('OPENAI_API_KEY is not set');
          err.code = EXIT_CONFIG_ERROR;
          throw err;
        }

        const sysConfig = await loadConfig(options.config);
        const debateCfg = debateConfigFromSysConfig(sysConfig, options);
        const agentConfigs = agentConfigsFromSysConfig(sysConfig, options);

        const provider = new OpenAIProvider(apiKey);

        const promptSources: { agents: AgentPromptMetadata[]; judge: JudgePromptMetadata } = {
          agents: [],
          judge: { id: sysConfig.judge!.id, source: PROMPT_SOURCES.BUILT_IN },
        };

        const agents = buildAgents(agentConfigs, provider, sysConfig.configDir || process.cwd(), promptSources);

        // Judge prompt resolution
        const judgeDefault = JudgeAgent.defaultSystemPrompt();
        const jres = resolvePrompt({ label: sysConfig.judge!.name, configDir: sysConfig.configDir || process.cwd(), ...((sysConfig.judge!.systemPromptPath !== undefined) && { promptPath: sysConfig.judge!.systemPromptPath }), defaultText: judgeDefault });
        const judge = new JudgeAgent(
          sysConfig.judge!,
          provider,
          jres.text,
          jres.source === PROMPT_SOURCES.FILE ? ({ source: PROMPT_SOURCES.FILE, ...(jres.absPath !== undefined && { absPath: jres.absPath }) }) : ({ source: PROMPT_SOURCES.BUILT_IN })
        );
        promptSources.judge = { id: sysConfig.judge!.id, source: jres.source, ...(jres.absPath !== undefined && { path: jres.absPath }) };

        const stateManager = new StateManager();

        // Verbose header before run
        if (options.verbose) {
          writeStderr('Running debate (verbose)\n');
          writeStderr('Active Agents:\n');
          agentConfigs.forEach(a => {
            const used = promptSources.agents.find(p => p.agentId === a.id);
            writeStderr(`  • ${a.name} (${a.model})\n`);
            writeStderr(`    - System prompt: ${used?.source === 'file' ? (used.path || 'file') : 'built-in default'}\n`);
          });
          writeStderr(`Judge: ${sysConfig.judge!.name} (${sysConfig.judge!.model})\n`);
          writeStderr(`  - System prompt: ${promptSources.judge.source === 'file' ? (promptSources.judge.path || 'file') : 'built-in default'}\n`);
        }

        const orchestrator = new DebateOrchestrator(  agents, judge, stateManager, debateCfg, 
                                                      options.verbose ? { onPhaseComplete: (round, phase) => writeStderr(`[Round ${round}] ${phase} complete\n`) } : undefined, );
        const result: DebateResult = await orchestrator.runDebate(resolvedProblem);

        // Persist prompt sources once per debate
        await stateManager.setPromptSources(result.debateId, promptSources);

        // Persist path notice (StateManager already persisted during run)
        infoUser(`Saved debate to ./debates/${result.debateId}.json`);

        await outputResults(result, stateManager, options);
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        process.stderr.write((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}
