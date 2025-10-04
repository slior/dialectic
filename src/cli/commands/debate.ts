import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
// Optional chalk import to avoid ESM issues under Jest
let chalk: any;
try { chalk = require('chalk'); } catch { chalk = null; }
function color(method: string, msg: string) { return chalk && chalk[method] ? chalk[method](msg) : msg; }
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { WARNING_COLOR, INFO_COLOR } from '../index';
import { SystemConfig } from '../../types/config.types';
import { AgentConfig, AGENT_ROLES, LLM_PROVIDERS } from '../../types/agent.types';
import { DebateConfig, DebateResult, TERMINATION_TYPES, SYNTHESIS_METHODS, CONTRIBUTION_TYPES } from '../../types/debate.types';
import { OpenAIProvider } from '../../providers/openai-provider';
import { ArchitectAgent } from '../../agents/architect-agent';
import { PerformanceAgent } from '../../agents/performance-agent';
import { JudgeAgent } from '../../core/judge';
import { StateManager } from '../../core/state-manager';
import { DebateOrchestrator } from '../../core/orchestrator';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'debate-config.json');
const DEFAULT_ROUNDS = 3;

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
    { id: DEFAULT_ARCHITECT_ID, name: DEFAULT_ARCHITECT_NAME, role: AGENT_ROLES.ARCHITECT, model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
    { id: DEFAULT_PERFORMANCE_ID, name: DEFAULT_PERFORMANCE_NAME, role: AGENT_ROLES.PERFORMANCE, model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
  ];
  const judge: AgentConfig = { id: DEFAULT_JUDGE_ID, name: DEFAULT_JUDGE_NAME, role: AGENT_ROLES.GENERALIST, model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_JUDGE_TEMPERATURE };
  const debate: DebateConfig = { rounds: DEFAULT_ROUNDS, terminationCondition: { type: TERMINATION_TYPES.FIXED }, synthesisMethod: SYNTHESIS_METHODS.JUDGE, includeFullHistory: true, timeoutPerRound: 300000 };
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
  if (!fs.existsSync(finalPath)) {
    process.stderr.write(color(WARNING_COLOR, `Config not found at ${finalPath}. Using built-in defaults.`) + '\n');
    return builtInDefaults();
  }
  const raw = await fs.promises.readFile(finalPath, 'utf-8');
  const parsed = JSON.parse(raw);
  // Ensure shape minimal
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    // Use process.stderr.write for immediate, unbuffered output with precise newline control (CLI best practice)
    process.stderr.write(color(WARNING_COLOR, 'Config missing agents. Using built-in defaults.') + '\n');
    return builtInDefaults();
  }
  if (!parsed.judge) {
    process.stderr.write(color(WARNING_COLOR, 'Config missing judge. Using default judge.') + '\n');
    parsed.judge = builtInDefaults().judge;
  }
  if (!parsed.debate) {
    parsed.debate = builtInDefaults().debate;
  }
  return parsed as SystemConfig;
}

/**
 * Builds an array of Agent instances based on the provided configuration and LLM provider.
 *
 * This function creates an array of Agent instances based on the provided configuration,
 * using the appropriate Agent subclass for each role. It handles the following cases:
 *   - If the role is 'architect', creates an ArchitectAgent instance.
 *   - If the role is 'performance', creates a PerformanceAgent instance.
 *   - For any other role, defaults to creating an ArchitectAgent instance.
 *
 * @param {AgentConfig[]} agentConfigs - Array of agent configuration objects.
 * @param {OpenAIProvider} provider - The LLM provider to use for agent interactions.
 * @returns {Agent[]} Array of Agent instances.
 */
function buildAgents(agentConfigs: AgentConfig[], provider: OpenAIProvider) {
  return agentConfigs.map((cfg) => {
    if (cfg.role === AGENT_ROLES.ARCHITECT) return ArchitectAgent.create(cfg, provider);
    if (cfg.role === AGENT_ROLES.PERFORMANCE) return PerformanceAgent.create(cfg, provider);
    // Default to architect for unknown roles
    process.stderr.write(color(WARNING_COLOR, `Unknown agent role '${cfg.role}' for agent '${cfg.name}'. Defaulting to architect.`) + '\n');
    return ArchitectAgent.create(cfg, provider);
  });
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
    const err: any = new Error('Invalid arguments: --rounds must be >= 1');
    err.code = EXIT_INVALID_ARGS;
    throw err;
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
    process.stderr.write(color(WARNING_COLOR, 'No agents selected; defaulting to architect,performance.') + '\n');
    const defaults = builtInDefaults();
    agentConfigs = defaults.agents;
  }
  
  return agentConfigs;
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
    if (outputPath.toLowerCase().endsWith('.json')) {
      const fullState = await stateManager.getDebate(result.debateId);
      await fs.promises.writeFile(outputPath, JSON.stringify(fullState, null, 2), 'utf-8');
    } else {
      await fs.promises.writeFile(outputPath, finalText, 'utf-8');
    }
  } else {
    // stdout minimal
    process.stdout.write(finalText);
  }

  // Verbose summary after solution to stdout (only when not writing to a file)
  if (!outputPath && options.verbose) {
    const debate = await stateManager.getDebate(result.debateId);
    if (debate) {
      process.stdout.write('\nSummary (verbose)\n');
      debate.rounds.forEach((round) => {
        process.stdout.write(`Round ${round.roundNumber}\n`);
        const types = [CONTRIBUTION_TYPES.PROPOSAL, CONTRIBUTION_TYPES.CRITIQUE, CONTRIBUTION_TYPES.REFINEMENT] as const;
        types.forEach((t) => {
          const items = round.contributions.filter((c) => c.type === t);
          if (items.length > 0) {
            process.stdout.write(`  ${t}:\n`);
            items.forEach((c) => {
              const firstLine = c.content.split('\n')[0];
              const tokens = (c.metadata && c.metadata.tokensUsed != null) ? c.metadata.tokensUsed : 'N/A';
              const lat = (c.metadata && c.metadata.latencyMs != null) ? `${c.metadata.latencyMs}ms` : 'N/A';
              process.stdout.write(`    [${c.agentRole}] ${firstLine}\n`);
              process.stdout.write(`      (latency=${lat}, tokens=${tokens})\n`);
            });
          }
        });
      });
      const totalTokens = debate.rounds.reduce((sum, r) => sum + r.contributions.reduce((s, c) => s + (c.metadata.tokensUsed ?? 0), 0), 0);
      process.stdout.write(`\nTotals: rounds=${result.metadata.totalRounds}, duration=${result.metadata.durationMs}ms, tokens=${totalTokens ?? 'N/A'}\n`);
    }
  }
}

export function debateCommand(program: Command) {
  program
    .command('debate')
    .argument('<problem>', 'Problem statement to debate')
    .option('-a, --agents <roles>', 'Comma-separated agent roles (architect,performance,...)')
    .option('-r, --rounds <number>', `Number of rounds (default ${DEFAULT_ROUNDS})`)
    .option('-c, --config <path>', 'Path to configuration file (default ./debate-config.json)')
    .option('-o, --output <path>', 'Output file; .json writes full state, others write final solution text')
    .option('-v, --verbose', 'Verbose output')
    .action(async (problem: string, options: any) => {
      try {
        if (!problem || problem.trim().length === 0) {
          const err: any = new Error('Invalid arguments: problem is required');
          err.code = EXIT_INVALID_ARGS;
          throw err;
        }

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
        const agents = buildAgents(agentConfigs, provider);
        const judge = new JudgeAgent(sysConfig.judge!, provider);
        const stateManager = new StateManager();

        // Verbose header before run
        if (options.verbose) {
          process.stdout.write('Running debate (verbose)\n');
          process.stdout.write('Active Agents:\n');
          agentConfigs.forEach(a => {
            process.stdout.write(`  • ${a.name} (${a.model})\n`);
          });
        }

        const orchestrator = new DebateOrchestrator(
          agents as any,
          judge,
          stateManager,
          debateCfg,
          options.verbose
            ? { onPhaseComplete: (round, phase) => process.stdout.write(`[Round ${round}] ${phase} complete\n`) }
            : undefined,
        );
        const result: DebateResult = await orchestrator.runDebate(problem);

        // Persist path notice (StateManager already persisted during run)
        process.stderr.write(color(INFO_COLOR, `Saved debate to ./debates/${result.debateId}.json`) + '\n');

        await outputResults(result, stateManager, options);
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        process.stderr.write((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}
