import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { Command } from 'commander';
import {
  EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR, ErrorWithCode, writeStderr,
  logWarning, MessageType, SystemConfig, AgentConfig,
  AGENT_ROLES, LLM_PROVIDERS, PROMPT_SOURCES, AgentPromptMetadata,
  JudgePromptMetadata, PromptSource, AgentPromptMetadataCollection, DebateConfig,
  DebateResult, DebateRound, Contribution, ContributionType,
  TERMINATION_TYPES, SYNTHESIS_METHODS, CONTRIBUTION_TYPES, SummarizationConfig,
  AgentClarifications, DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH,
  DEFAULT_SUMMARIZATION_METHOD, TRACE_OPTIONS, TracingContext, TraceMetadata,
  LLMProvider, createProvider, RoleBasedAgent, JudgeAgent,
  Agent, AgentLogger, StateManager, createOrchestrator,
  ORCHESTRATOR_TYPES, ADebateOrchestrator, DebateOrchestrator, OrchestratorHooks, isStateMachineOrchestrator,
  collectClarifications, ExecutionResult, EXECUTION_STATUS,
  SUSPEND_REASON, resolvePrompt, PromptResolveResult, loadEnvironmentFile,
  createValidationError, writeFileWithDirectories, generateDebateId, generateDebateReport,
  buildToolRegistry, validateLangfuseConfig, createTracingContext, createTracingProvider,
  createTracingAgent, buildTraceTags, formatTraceNameWithTimestamp,
} from 'dialectic-core';

import { warnUser, infoUser } from '../index';
import { DebateProgressUI } from '../utils/progress-ui';

// Import everything from dialectic-core

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'debate-config.json');
const DEFAULT_ROUNDS = 3;
const DEFAULT_CLARIFICATIONS_MAX_PER_AGENT = 5;

// File handling constants
const FILE_ENCODING_UTF8 = 'utf-8';
const JSON_FILE_EXTENSION = '.json';
const MARKDOWN_FILE_EXTENSION = '.md';
const JSON_INDENT_SPACES = 2;

/** Placeholder for clarification answers when the user leaves the input empty. */
const CLARIFICATION_ANSWER_NA = 'NA';

// Problem resolution error messages
const ERROR_BOTH_PROBLEM_SOURCES = 'Invalid arguments: provide exactly one of <problem> or --problemDescription';

/** Prompt source metadata for agents and judge (used for verbose output and resolution). */
type PromptSources = { agents: AgentPromptMetadata[]; judge: JudgePromptMetadata };

/**
 * Checks if an error has a specific error code and rethrows it if it matches.
 * This is used to preserve error codes from validation errors that should propagate.
 * 
 * @param error - The error to check
 * @param expectedCode - The error code to check for (e.g., EXIT_INVALID_ARGS)
 * @returns The error typed as ErrorWithCode if it doesn't match the expected code
 * @throws The original error if it has the expected code
 */
function rethrowIfErrorCode(error: unknown, expectedCode: number): ErrorWithCode {
  const errorWithCode = error as ErrorWithCode;
  if (errorWithCode && typeof errorWithCode === 'object' && 'code' in errorWithCode && typeof errorWithCode.code === 'number' && errorWithCode.code === expectedCode) {
    throw error;
  }
  return errorWithCode;
}
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
const DEFAULT_KISS_ID = 'agent-kiss';
const DEFAULT_KISS_NAME = 'Simplicity Advocate';
const DEFAULT_JUDGE_ID = 'judge-main';
const DEFAULT_JUDGE_NAME = 'Technical Judge';

// Default LLM configuration
const DEFAULT_LLM_MODEL = 'gpt-4';
const DEFAULT_AGENT_TEMPERATURE = 0.5;
const DEFAULT_JUDGE_TEMPERATURE = 0.3;

// Default summary prompt fallback
const DEFAULT_SUMMARY_PROMPT_FALLBACK = 'Summarize the following debate history from your perspective, preserving key points and decisions.';

/**
 * Context passed to runDebateWithClarifications so it can perform the clarification phase
 * (collect for classic, suspend/resume for state machine) internally.
 */
interface RunDebateClarificationContext {
  clarificationRequested: boolean;
  resolvedProblem: string;
  agents: Agent[];
  sysConfig: SystemConfig;
}

/**
 * Collects clarifying questions from agents and prompts the user for answers.
 * Returns the collected clarifications with user-provided answers.
 * 
 * @param resolvedProblem - The problem statement to clarify
 * @param agents - Array of agents to collect questions from
 * @param maxPerAgent - Maximum questions per agent
 * @returns Promise resolving to collected clarifications with answers
 */
async function collectAndAnswerClarifications( resolvedProblem: string, agents: Agent[], maxPerAgent: number ): Promise<AgentClarifications[]>
{
  // Collect questions from agents (grouped, truncated with warnings)
  const collected: AgentClarifications[] = await collectClarifications( resolvedProblem, agents, maxPerAgent, (msg) => warnUser(msg) );

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

  
  async function askUser(promptText: string): Promise<string> { // Inline helper to convert readline callback to Promise, scoped to this readline instance
    return await new Promise((resolve) => rl.question(promptText, resolve));
  }

  try { // Prompt user for answers (empty line => NA)
    for (const group of collected) {
      if (group.items.length === 0) continue;
      writeStderr(`\n[${group.agentName}] Clarifying Questions\n`);
      for (const item of group.items) {
        const ans = (await askUser(`Q (${item.id}): ${item.question}\n> `)).trim();
        item.answer = ans.length === 0 ? CLARIFICATION_ANSWER_NA : ans;
      }
    }
  } finally {
    rl.close();
  }
  
  return collected;
}

/**
 * Runs a debate with the clarification phase handled inside this function.
 * For state-machine orchestrator: runs with no initial clarifications; on suspend, prompts user and resumes.
 * For classic orchestrator: if clarification was requested, collects clarifications here then runs debate.
 *
 * @param orchestrator - The orchestrator instance (classic or state machine)
 * @param problem - The problem statement
 * @param context - Optional additional context
 * @param debateId - Optional debate ID
 * @param clarificationContext - Optional context for the clarification phase (resolvedProblem, agents, sysConfig, clarificationRequested)
 * @returns The final debate result
 */
async function runDebateWithClarifications( orchestrator: ADebateOrchestrator,
                                            problem: string, context?: string, debateId?: string,
                                            clarificationContext?: RunDebateClarificationContext ): Promise<DebateResult> {
  if (isStateMachineOrchestrator(orchestrator)) { // TODO: think about how to abstract the orchestrators
    const stateMachineOrchestrator = orchestrator;
    let result: ExecutionResult = await stateMachineOrchestrator.runDebate(problem, context, undefined, debateId);

    while (result.status === EXECUTION_STATUS.SUSPENDED) {
      if (result.suspendReason === SUSPEND_REASON.WAITING_FOR_INPUT) {
        const answers = await promptUserForAnswers(result.suspendPayload!.questions);
        result = await stateMachineOrchestrator.resume(result.suspendPayload!.debateId, answers);
      } else {
        throw new Error(`Unknown suspend reason: ${result.suspendReason}`);
      }
    }

    if (!result.result) {
      throw new Error('Debate completed without result');
    }

    return result.result;
  }
  else {
    const debateOrchestrator = orchestrator as DebateOrchestrator;
    let initialClarifications: AgentClarifications[] | undefined;
    if (clarificationContext?.clarificationRequested) {
      initialClarifications = await collectFinalClarifications(
        true,
        clarificationContext.resolvedProblem,
        clarificationContext.agents,
        clarificationContext.sysConfig
      );
    }
    return await debateOrchestrator.runDebate(problem, context, initialClarifications, debateId);
  }
}

/**
 * Prompts the user for clarification answers.
 * 
 * @param questions - Array of agent clarifications with questions
 * @returns Promise resolving to clarifications with answers filled in
 */
async function promptUserForAnswers( questions: AgentClarifications[] ): Promise<AgentClarifications[]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  
  try {
    for (const group of questions) {
      if (group.items.length === 0) continue;
      writeStderr(`\n[${group.agentName}] Clarifying Questions\n`);
      for (const item of group.items) {
        if (item.answer && item.answer !== CLARIFICATION_ANSWER_NA && item.answer.trim() !== '') {
          continue; // Already answered
        }
        const ans = await askUser(rl, `Q (${item.id}): ${item.question}\n> `);
        item.answer = ans.length === 0 ? CLARIFICATION_ANSWER_NA : ans;
      }
    }
  } finally {
    rl.close();
  }
  
  return questions;
}

/**
 * Helper function to convert readline callback to Promise.
 * 
 * @param rl - Readline interface instance
 * @param promptText - Prompt text to display
 * @returns Promise resolving to user input
 */
async function askUser(rl: readline.Interface, promptText: string): Promise<string> {
  return await new Promise((resolve) => rl.question(promptText, resolve));
}

/**
 * Creates a logger function that routes messages through the progress UI.
 * Messages with onlyVerbose=true are only logged when verbose mode is enabled.
 * 
 * @param progressUI - The progress UI instance to use for logging
 * @param verbose - Whether verbose mode is enabled
 * @returns Logger function compatible with AgentLogger type
 */
function createAgentLogger(progressUI: DebateProgressUI, verbose: boolean): AgentLogger {
  return (message: string, onlyVerbose?: boolean): void => {
    if (onlyVerbose === false || (onlyVerbose === true && verbose)) {
      progressUI.log(message);
    }
  };
}

/**
 * Orchestrator hooks implementation for CLI progress UI.
 * All hooks are required since createOrchestratorHooks always provides all implementations.
 * Uses Required<Pick<...>> to select only the hooks we implement and make them required.
 */
type OrchestratorHooksImplementation = Required<Pick<OrchestratorHooks,
  | 'onRoundStart'
  | 'onPhaseStart'
  | 'onAgentStart'
  | 'onAgentComplete'
  | 'onPhaseComplete'
  | 'onSummarizationStart'
  | 'onSummarizationComplete'
  | 'onSummarizationEnd'
  | 'onSynthesisStart'
  | 'onSynthesisComplete'
>>;

/**
 * Creates orchestrator hooks that drive the progress UI during debate execution.
 * 
 * @param progressUI - The progress UI instance to drive
 * @param options - CLI options containing verbose flag
 * @returns Object containing all orchestrator hook functions
 */
function createOrchestratorHooks(progressUI: DebateProgressUI, options: { verbose?: boolean }): OrchestratorHooksImplementation {
  const SUMMARY_ACTIVITY_LABEL = 'summarizing context';
  return {
    // Note: totalRounds is available from progressUI.initialize(), so we only use roundNumber
    // eslint-disable-next-line @typescript-eslint/no-unused-vars 
    onRoundStart: (roundNumber: number, _totalRounds: number): void => {
      progressUI.startRound(roundNumber);
    },
    onPhaseStart: (_roundNumber: number, phase: ContributionType, expectedTaskCount: number): void => {
      progressUI.startPhase(phase, expectedTaskCount);
    },
    onAgentStart: (agentName: string, activity: string): void => {
      progressUI.startAgentActivity(agentName, activity);
    },
    onAgentComplete: (agentName: string, activity: string): void => {
      progressUI.completeAgentActivity(agentName, activity);
    },
    onPhaseComplete: (_roundNumber: number, phase: ContributionType): void => {
      progressUI.completePhase(phase);
    },
    onSummarizationStart: (agentName: string): void => {
      progressUI.startAgentActivity(agentName, SUMMARY_ACTIVITY_LABEL);
    },
    onSummarizationComplete: (agentName: string, beforeChars: number, afterChars: number): void => {
      progressUI.completeAgentActivity(agentName, SUMMARY_ACTIVITY_LABEL);
      if (options.verbose) {
        progressUI.log(`  [${agentName}] Summarized: ${beforeChars} → ${afterChars} chars`, MessageType.SUCCESS);
      }
    },
    // Ensure activity is cleared even when no summary is produced
    onSummarizationEnd: (agentName: string): void => {
      progressUI.completeAgentActivity(agentName, SUMMARY_ACTIVITY_LABEL);
    },
    onSynthesisStart: (): void => {
      progressUI.startSynthesis();
    },
    onSynthesisComplete: (): void => {
      progressUI.completeSynthesis();
    },
  };
}

/**
 * Resolves the judge system prompt, either from a file or using the built-in default.
 * 
 * @param judgeName - Name of the judge (used for labeling)
 * @param configDir - Configuration directory for resolving relative paths
 * @param systemPromptPath - Optional path to the system prompt file
 * @returns Prompt resolution result containing text, source, and optional absolute path
 */
function resolveJudgeSystemPromptWithDefault(
  judgeName: string,
  configDir: string | undefined,
  systemPromptPath: string | undefined
): PromptResolveResult {
  const judgeDefault = JudgeAgent.defaultSystemPrompt();
  return resolvePrompt({
    label: judgeName,
    configDir: configDir || process.cwd(),
    ...(systemPromptPath !== undefined && { promptPath: systemPromptPath }),
    defaultText: judgeDefault
  });
}

/**
 * Resolves the judge summary prompt, either from a file or using the built-in default.
 * 
 * @param judgeName - Name of the judge (used for labeling)
 * @param configDir - Configuration directory for resolving relative paths
 * @param summaryPromptPath - Optional path to the summary prompt file
 * @param maxLength - Maximum length for the default summary prompt
 * @returns Prompt resolution result containing text, source, and optional absolute path
 */
function resolveJudgeSummaryPromptWithDefault(
  judgeName: string,
  configDir: string | undefined,
  summaryPromptPath: string | undefined,
  maxLength: number
): PromptResolveResult {
  const judgeSummaryDefault = JudgeAgent.defaultSummaryPrompt('', maxLength);
  return resolvePrompt({
    label: `${judgeName} (summary)`,
    configDir: configDir || process.cwd(),
    ...(summaryPromptPath !== undefined && { promptPath: summaryPromptPath }),
    defaultText: judgeSummaryDefault
  });
}

/**
 * Creates a judge agent with resolved prompts and metadata collection.
 * 
 * @param sysConfig - System configuration containing judge settings
 * @param systemSummaryConfig - System-wide summarization configuration
 * @param promptSources - Collection object to record prompt source metadata
 * @param tracingContext - Optional tracing context
 * @returns Configured JudgeAgent instance
 */
function createJudgeWithPromptResolution(sysConfig: SystemConfig, systemSummaryConfig: SummarizationConfig, 
                                         promptSources: { judge: JudgePromptMetadata }, tracingContext?: TracingContext): JudgeAgent {

  const jres = resolveJudgeSystemPromptWithDefault( sysConfig.judge!.name, sysConfig.configDir, sysConfig.judge!.systemPromptPath );
  
  const jsres = resolveJudgeSummaryPromptWithDefault( sysConfig.judge!.name, sysConfig.configDir, sysConfig.judge!.summaryPromptPath, systemSummaryConfig.maxLength );
  
  const judgeProvider = createProvider(sysConfig.judge!.provider);
  const wrappedJudgeProvider = createTracingProvider(judgeProvider, tracingContext);
  const judge = new JudgeAgent(
    sysConfig.judge!,
    wrappedJudgeProvider,
    jres.text,
    jres.source === PROMPT_SOURCES.FILE ? ({ source: PROMPT_SOURCES.FILE, ...(jres.absPath !== undefined && { absPath: jres.absPath }) }) : ({ source: PROMPT_SOURCES.BUILT_IN }),
    systemSummaryConfig,
    jsres.source === PROMPT_SOURCES.FILE ? ({ source: PROMPT_SOURCES.FILE, ...(jsres.absPath !== undefined && { absPath: jsres.absPath }) }) : ({ source: PROMPT_SOURCES.BUILT_IN })
  );
  
  // Record prompt source metadata
  promptSources.judge = { 
    id: sysConfig.judge!.id, 
    source: jres.source, 
    ...(jres.absPath !== undefined && { path: jres.absPath }),
    summarySource: jsres.source,
    ...(jsres.absPath !== undefined && { summaryPath: jsres.absPath })
  };
  
  return judge;
}

/** Parameters for createOrchestratorForDebate. */
interface CreateOrchestratorForDebateParams {
  agents: Agent[];
  sysConfig: SystemConfig;
  systemSummaryConfig: SummarizationConfig;
  promptSources: PromptSources;
  tracingContext: TracingContext | undefined;
  progressUI: DebateProgressUI;
  options: { verbose?: boolean };
  stateManager: StateManager;
  debateCfg: DebateConfig;
  contextDirectory: string;
  agentLogger: AgentLogger;
}

/**
 * Creates judge, hooks, and orchestrator for the debate command.
 *
 * @param params - All inputs required to build the orchestrator.
 * @returns The configured orchestrator (classic or state-machine per config).
 */
function createOrchestratorForDebate(params: CreateOrchestratorForDebateParams): ADebateOrchestrator {
  const {
    agents,
    sysConfig,
    systemSummaryConfig,
    promptSources,
    tracingContext,
    progressUI,
    options,
    stateManager,
    debateCfg,
    contextDirectory,
    agentLogger,
  } = params;
  const judge = createJudgeWithPromptResolution(sysConfig, systemSummaryConfig, promptSources, tracingContext);
  const hooks = createOrchestratorHooks(progressUI, options);
  return createOrchestrator({
    agents,
    judge,
    stateManager,
    config: debateCfg,
    hooks,
    ...(tracingContext !== undefined && { tracingContext }),
    contextDirectory,
    logger: agentLogger,
  });
}

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
export function builtInDefaults(): SystemConfig {
  const defaultAgents: AgentConfig[] = [
    { id: DEFAULT_ARCHITECT_ID, name: DEFAULT_ARCHITECT_NAME, role: AGENT_ROLES.ARCHITECT, 
      model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
    { id: DEFAULT_PERFORMANCE_ID, name: DEFAULT_PERFORMANCE_NAME, role: AGENT_ROLES.PERFORMANCE, 
      model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
    { id: DEFAULT_KISS_ID, name: DEFAULT_KISS_NAME, role: AGENT_ROLES.KISS, 
      model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_AGENT_TEMPERATURE, enabled: true },
  ];
  const judge: AgentConfig = {  id: DEFAULT_JUDGE_ID, name: DEFAULT_JUDGE_NAME, role: AGENT_ROLES.GENERALIST, 
                                model: DEFAULT_LLM_MODEL, provider: LLM_PROVIDERS.OPENAI, temperature: DEFAULT_JUDGE_TEMPERATURE };
  
  // Default summarization configuration
  const summarization = {
    enabled: DEFAULT_SUMMARIZATION_ENABLED,
    threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
    maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
    method: DEFAULT_SUMMARIZATION_METHOD,
  };
  
  const debate: DebateConfig = {  
    rounds: DEFAULT_ROUNDS, 
    terminationCondition: { type: TERMINATION_TYPES.FIXED }, 
    synthesisMethod: SYNTHESIS_METHODS.JUDGE, 
    includeFullHistory: true, 
    timeoutPerRound: 300000,
    summarization,
  };
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
 * Resolves system and summary prompts from files or defaults, merges summarization config,
 * creates the agent, and records provenance.
 * 
 * @param cfg - Agent configuration containing role, model, and other settings.
 * @param provider - LLM provider instance for LLM interactions.
 * @param configDir - Directory path where the configuration file is located.
 * @param systemSummaryConfig - System-wide summarization configuration.
 * @param collect - Collection object to record prompt source metadata.
 * @param logger - Optional logger callback for agent messages.
 * @returns A configured RoleBasedAgent instance.
 */
interface CreateAgentParams {
  cfg: AgentConfig;
  provider: LLMProvider;
  configDir: string;
  systemSummaryConfig: SummarizationConfig;
  collect: AgentPromptMetadataCollection;
  logger?: AgentLogger | undefined;
  contextDirectory?: string | undefined;
}

function createAgentWithPromptResolution(params: CreateAgentParams): Agent {
  const { cfg, provider, configDir, systemSummaryConfig, collect, logger, contextDirectory } = params;
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
  
  const mergedSummaryConfig: SummarizationConfig = { // Agent-level summarization overrides system-level
    ...systemSummaryConfig,
    ...cfg.summarization,
  };
  
  // Resolve summary prompt
  // For the default, we use a generic fallback prompt
  const summaryRes = resolvePrompt({
    label: `${cfg.name} (summary)`,
    configDir,
    ...(cfg.summaryPromptPath !== undefined && { promptPath: cfg.summaryPromptPath }),
    defaultText: DEFAULT_SUMMARY_PROMPT_FALLBACK
  });
  
  const summaryPromptSource: PromptSource = summaryRes.source === PROMPT_SOURCES.FILE
    ? { source: PROMPT_SOURCES.FILE, ...(summaryRes.absPath !== undefined && { absPath: summaryRes.absPath }) }
    : { source: PROMPT_SOURCES.BUILT_IN };
  
  // Resolve clarification prompt (optional)
  const clarificationRes = resolvePrompt({
    label: `${cfg.name} (clarifications)`,
    configDir,
    ...(cfg.clarificationPromptPath !== undefined && { promptPath: cfg.clarificationPromptPath }),
    defaultText: ''
  });

  const agentToolRegistry = buildToolRegistry(cfg, contextDirectory);

  // Display tool availability info
  const toolSchemas = agentToolRegistry.getAllSchemas();
  const toolNames = toolSchemas.length > 0
    ? toolSchemas.map(schema => schema.name).join(', ')
    : 'no tools';
  infoUser(`[${cfg.name}] Tools available: ${toolNames}`);

  const agent = RoleBasedAgent.create(  cfg, provider, res.text, promptSource,
                                        mergedSummaryConfig, summaryPromptSource,
                                        clarificationRes.text, agentToolRegistry, logger );
  
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
 * Creates RoleBasedAgent instances for each agent configuration, resolving system and summary
 * prompts from files or defaults, merging summarization configs, and collecting metadata about
 * prompt sources. The RoleBasedAgent class handles all roles through a prompt registry,
 * eliminating the need for role-specific agent classes.
 *
 * @param agentConfigs - Array of agent configurations.
 * @param configDir - Directory where the config file is located, used for resolving relative prompt paths.
 * @param systemSummaryConfig - System-wide summarization configuration.
 * @param collect - Object to collect prompt metadata.
 * @param logger - Optional logger callback for agent messages.
 * @returns Array of Agent instances.
 */
interface BuildAgentsParams {
  agentConfigs: AgentConfig[];
  configDir: string;
  systemSummaryConfig: SummarizationConfig;
  collect: AgentPromptMetadataCollection;
  logger?: AgentLogger | undefined;
  tracingContext?: TracingContext | undefined;
  contextDirectory?: string;
}

function buildAgents(params: BuildAgentsParams): Agent[] {
  const { agentConfigs, configDir, systemSummaryConfig, collect, logger, tracingContext, contextDirectory } = params;
  return agentConfigs.map((cfg) => {
    const provider = createProvider(cfg.provider);
    const wrappedProvider = createTracingProvider(provider, tracingContext);
    const agent = createAgentWithPromptResolution({ cfg, provider: wrappedProvider, configDir, systemSummaryConfig, collect, logger, contextDirectory });
    return createTracingAgent(agent, tracingContext);
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
function debateConfigFromSysConfig(sysConfig: SystemConfig, options: { rounds?: string }): DebateConfig {
  const debateCfg: DebateConfig = {
    ...sysConfig.debate!,
    rounds: options.rounds ? parseInt(options.rounds, 10) : (sysConfig.debate?.rounds ?? DEFAULT_ROUNDS),
  } as DebateConfig;
  
  if (!debateCfg.rounds || debateCfg.rounds < 1) {
    throw createValidationError('Invalid arguments: --rounds must be >= 1', EXIT_INVALID_ARGS);
  }

  if (debateCfg.interactiveClarifications) {
    debateCfg.orchestratorType = ORCHESTRATOR_TYPES.STATE_MACHINE;
    writeStderr(`Interactive clarifications requested. Running debate with state machine orchestrator\n`);
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
function agentConfigsFromSysConfig(sysConfig: SystemConfig, options: { agents?: string }): AgentConfig[] {
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
  } catch (error: unknown) {
    const errorWithCode = rethrowIfErrorCode(error, EXIT_INVALID_ARGS);
    // Handle read errors
    throw createValidationError(`${ERROR_FILE_READ_FAILED}: ${errorWithCode.message}`, EXIT_GENERAL_ERROR);
  }
}

/**
 * Validates and resolves a context directory path.
 * 
 * @param contextPath - Path to the context directory (relative or absolute).
 * @returns The absolute path to the context directory, or undefined if validation fails.
 * @throws {Error} If the path is invalid (not a directory, doesn't exist, or access denied).
 */
function validateContextDirectory(contextPath: string): string {
  const resolvedPath = path.resolve(process.cwd(), contextPath);

  if (!fs.existsSync(resolvedPath)) {
    throw createValidationError(`Context directory not found: ${resolvedPath}`, EXIT_INVALID_ARGS);
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw createValidationError(`Context path is not a directory: ${resolvedPath}`, EXIT_INVALID_ARGS);
  }

  return resolvedPath;
}

/**
 * Resolves the context directory: validates and returns the given path, or the current working directory if not specified.
 *
 * @param context - Optional path to the context directory.
 * @returns The absolute path to the context directory.
 */
function resolveContextDirectory(context: string | undefined): string {
  return context ? validateContextDirectory(context) : process.cwd();
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
async function resolveProblemDescription(problem: string | undefined, options: { problemDescription?: string }): Promise<string> {

 
  const hasFile = !!options.problemDescription;
  const hasProblem = !!(problem && problem.trim().length > 0);

  // Validate exactly-one constraint BEFORE clearing problem (to catch explicit cases where both are provided)
  validateExactlyOneProblemSource(hasProblem, hasFile);

  if (hasFile) {
    // Handle Commander.js quirk: when --problemDescription (-p) is used as 1st option, Commander.js may also
    // assign the path to the optional positional [problem] argument. If the option is set,
    // we should ignore the positional argument entirely, as the user clearly intends to use the file option.
    problem = undefined;
  }

   // Return problem string if provided
  if (hasProblem) {
    return problem!.trim();
  }

  // Handle file-based problem description
  const filePath = path.resolve(process.cwd(), options.problemDescription!);
  validateFilePathExists(filePath);
  return await readAndValidateFileContent(filePath);
}

/**
 * Outputs a summary of a single debate round to stderr for verbose mode.
 * Lists all contributions (proposals, critiques, refinements) and summaries with metadata.
 *
 * @param {DebateRound} round - The debate round to summarize.
 */
function outputRoundSummary(round: DebateRound): void {
  writeStderr(`Round ${round.roundNumber}\n`);
  
  // Output summaries if present
  if (round.summaries && Object.keys(round.summaries).length > 0) {
    writeStderr(`  summaries:\n`);
    Object.values(round.summaries).forEach((s) => {
      const tokens = s.metadata.tokensUsed != null ? s.metadata.tokensUsed : 'N/A';
      const lat = s.metadata.latencyMs != null ? `${s.metadata.latencyMs}ms` : 'N/A';
      writeStderr(`    [${s.agentRole}] ${s.metadata.beforeChars} → ${s.metadata.afterChars} chars\n`);
      writeStderr(`      (latency=${lat}, tokens=${tokens}, method=${s.metadata.method})\n`);
    });
  }
  
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
async function outputResults(result: DebateResult, stateManager: StateManager, options: { output?: string; verbose?: boolean }): Promise<void> {
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

/**
 * Generates and writes a markdown report file for the debate.
 * 
 * This function retrieves the full debate state, generates a markdown report using
 * generateDebateReport, enforces the .md file extension, and writes the report to a file.
 * Report generation failures are caught and logged but do not fail the debate.
 * 
 * @param result - The debate result containing the debate ID and metadata.
 * @param stateManager - The state manager to retrieve the full debate state.
 * @param agentConfigs - Array of agent configurations for the report.
 * @param judgeConfig - Judge configuration for the report.
 * @param problemDescription - The full problem description text.
 * @param options - CLI options including report path and verbose flag.
 */
interface GenerateReportParams {
  result: DebateResult;
  stateManager: StateManager;
  agentConfigs: AgentConfig[];
  judgeConfig: AgentConfig;
  problemDescription: string;
  options: { report?: string | undefined; verbose?: boolean | undefined };
}

async function generateReport(params: GenerateReportParams): Promise<void> {
  const { result, stateManager, agentConfigs, judgeConfig, problemDescription, options } = params;
  try {
    // Validate and normalize report path
    let reportPath = path.resolve(process.cwd(), options.report!);
    
    // Enforce .md extension
    if (!reportPath.toLowerCase().endsWith(MARKDOWN_FILE_EXTENSION)) {
      reportPath += MARKDOWN_FILE_EXTENSION;
      warnUser(`Report path does not end with ${MARKDOWN_FILE_EXTENSION}, appending ${MARKDOWN_FILE_EXTENSION} extension: ${path.basename(reportPath)}`);
    }

    // Get full debate state
    const debateState = await stateManager.getDebate(result.debateId);
    if (!debateState) {
      throw new Error(`Debate state not found for ID: ${result.debateId}`);
    }

    // Generate report content
    const reportContent = generateDebateReport(
      debateState,
      agentConfigs,
      judgeConfig,
      problemDescription,
      { verbose: options.verbose ?? false }
    );

    // Write report file (handles path normalization and directory creation)
    const writtenPath = await writeFileWithDirectories(reportPath, reportContent);
    
    // Notify user
    infoUser(`Generated report: ${writtenPath}`);
  } catch (error: unknown) {
    const errorWithCode = error as ErrorWithCode;
    warnUser(`Failed to generate report: ${errorWithCode.message}`);
    // Don't throw - report generation failure shouldn't fail the debate
  }
}

/**
 * Extracts the problem file name from options if provided via --problemDescription.
 * 
 * @param options - Command-line options containing optional problemDescription.
 * @returns The filename if provided, undefined if problem is an inline string.
 */
function extractProblemFileName(options: { problemDescription?: string }): string | undefined {
  if (options.problemDescription) {
    return path.basename(options.problemDescription);
  }
  return undefined;
}

/**
 * Extracts the context directory name from options if provided via --context.
 * 
 * @param options - Command-line options containing optional context directory path.
 * @returns The directory name if provided, undefined if not provided.
 */
function extractContextDirectoryName(options: { context?: string }): string | undefined {
  if (options.context) {
    return path.basename(options.context);
  }
  return undefined;
}

/**
 * Initializes the Langfuse tracing context if tracing is enabled in the debate configuration.
 * Builds trace metadata, trace name, and tags, then creates the tracing context.
 * Errors during initialization are caught and logged as warnings, but do not fail the debate.
 *
 * @param debateCfg - The debate configuration (contains trace option).
 * @param debateId - Unique identifier for the debate.
 * @param debateIdDate - Date instance used for debate ID generation (also used for trace name timestamp).
 * @param options - CLI options containing problem/context file paths, verbose flag, etc.
 * @param resolvedConfigPath - Absolute path to the configuration file used.
 * @param clarificationRequested - Whether clarification phase was requested.
 * @param agentConfigs - Array of active agent configurations.
 * @param sysConfig - System configuration containing judge config.
 * @returns Tracing context if successfully initialized, undefined otherwise.
 */
interface InitializeTracingContextParams {
  debateCfg: DebateConfig;
  debateId: string;
  debateIdDate: Date;
  options: { problemDescription?: string; context?: string; verbose?: boolean, config?: string };
  clarificationRequested: boolean;
  agentConfigs: AgentConfig[];
  sysConfig: SystemConfig;
}

function initializeTracingContext(params: InitializeTracingContextParams): TracingContext | undefined {
  // const { debateCfg, debateId, debateIdDate, options, resolvedConfigPath, clarificationRequested, agentConfigs, sysConfig } = params;
  const { debateCfg, debateId, debateIdDate, options, clarificationRequested, agentConfigs, sysConfig } = params;
  const resolvedConfigPath = options.config ? path.resolve(process.cwd(), options.config) : DEFAULT_CONFIG_PATH;
  if (debateCfg.trace !== TRACE_OPTIONS.LANGFUSE) {
    return undefined;
  }

  try {
    validateLangfuseConfig();

    // Build trace metadata
    const problemFileName = extractProblemFileName(options);
    const contextDirectoryName = extractContextDirectoryName(options);
    const traceMetadata: TraceMetadata = {
      debateId,
      ...(problemFileName !== undefined && { problemFileName }),
      ...(contextDirectoryName !== undefined && { contextFileName: contextDirectoryName }),
      clarificationRequested,
      verboseRun: options.verbose === true,
      configFileName: path.basename(resolvedConfigPath),
      debateConfig: debateCfg,
      agentConfigs,
      ...(sysConfig.judge && { judgeConfig: sysConfig.judge }),
    };

    // Build trace name with timestamp
    const traceName = formatTraceNameWithTimestamp(debateIdDate);

    // Build tags
    const tags = buildTraceTags(agentConfigs, clarificationRequested);

    const tracingContext = createTracingContext(debateCfg, traceMetadata, traceName, tags);
    if (tracingContext) {
      infoUser('Langfuse tracing enabled');
    }
    return tracingContext;
  } catch (error: unknown) {
    const errorWithCode = error as ErrorWithCode;
    warnUser(`Langfuse tracing initialization failed: ${errorWithCode.message}. Continuing without tracing.`);
    return undefined;
  }
}

/**
 * Outputs verbose debate configuration information to stderr.
 * 
 * @param agentConfigs - Array of agent configurations
 * @param promptSources - Collection of prompt source metadata for agents and judge
 * @param sysConfig - System configuration containing judge settings
 * @param systemSummaryConfig - System-wide summarization configuration
 * @param orchestrator - The created orchestrator (used to emit its type when verbose)
 */
function outputVerboseDebateInfo( agentConfigs: AgentConfig[], promptSources: PromptSources,
                                  sysConfig: SystemConfig, systemSummaryConfig: SummarizationConfig, orchestrator: ADebateOrchestrator ): void {

 

  writeStderr('Running debate (verbose)\n');
  writeStderr('Active Agents:\n');
  agentConfigs.forEach(a => {
    const used = promptSources.agents.find(p => p.agentId === a.id);
    writeStderr(`  • ${a.name} (${a.model})\n`);
    writeStderr(`    - System prompt: ${used?.source === 'file' ? (used.path || 'file') : 'built-in default'}\n`);
  });
  writeStderr(`Judge: ${sysConfig.judge!.name} (${sysConfig.judge!.model})\n`);
  writeStderr(`  - System prompt: ${promptSources.judge.source === 'file' ? (promptSources.judge.path || 'file') : 'built-in default'}\n`);
  writeStderr('\nSummarization:\n');
  writeStderr(`  - Enabled: ${systemSummaryConfig.enabled}\n`);
  writeStderr(`  - Threshold: ${systemSummaryConfig.threshold} characters\n`);
  writeStderr(`  - Max summary length: ${systemSummaryConfig.maxLength} characters\n`);
  writeStderr(`  - Method: ${systemSummaryConfig.method}\n`);
  writeStderr(`  - Orchestrator: ${isStateMachineOrchestrator(orchestrator) ? 'state-machine' : 'classic'}\n`);
  writeStderr('\n');
}

/**
 * Flushes the Langfuse trace if tracing context is provided.
 * Errors during flushing are logged as warnings but do not fail the operation.
 * 
 * @param tracingContext - Optional tracing context to flush
 */
async function flushTracingContext(tracingContext: TracingContext | undefined): Promise<void> {
  if (!tracingContext) {
    return;
  }

  try {
    await tracingContext.langfuse.flushAsync();
  } catch (error: unknown) {
    const errorWithCode = error as ErrorWithCode;
    logWarning(`Failed to flush Langfuse trace: ${errorWithCode.message}`);
  }
}

/**
 * Generates a debate report if the report option is specified.
 * 
 * @param options - Command options containing optional report path
 * @param result - The debate result containing the debate ID and metadata
 * @param stateManager - The state manager to retrieve the full debate state
 * @param agentConfigs - Array of agent configurations for the report
 * @param judgeConfig - Judge configuration for the report
 * @param problemDescription - The full problem description text
 */
//eslint-disable-next-line max-params
async function generateReportIfRequested(
  options: DebateCommandOptions, result: DebateResult, stateManager: StateManager,
  agentConfigs: AgentConfig[], judgeConfig: AgentConfig, problemDescription: string
): Promise<void> {
  if (!options.report) {
    return;
  }

  await generateReport({ result, stateManager, agentConfigs, judgeConfig, problemDescription, options });
}

/**
 * Gets the system-wide summarization configuration, using defaults if not specified in the debate config.
 * 
 * @param debateCfg - Debate configuration that may contain summarization settings
 * @returns Summarization configuration, using defaults if not provided
 */
function getSystemSummaryConfig(debateCfg: DebateConfig): SummarizationConfig {
  return debateCfg.summarization || {
    enabled: DEFAULT_SUMMARIZATION_ENABLED,
    threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
    maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
    method: DEFAULT_SUMMARIZATION_METHOD,
  };
}

/**
 * Determines if the clarifications phase was requested, either via command-line option or system configuration.
 * 
 * @param options - Command options that may contain the clarify flag
 * @param sysConfig - System configuration that may have interactiveClarifications enabled
 * @returns True if clarifications were requested, false otherwise
 */
function isClarificationRequested(options: DebateCommandOptions, sysConfig: SystemConfig): boolean {
  return options.clarify === true || sysConfig.debate?.interactiveClarifications === true;
}

/**
 * Collects clarifications from agents if the clarifications phase was requested.
 * 
 * @param clarificationRequested - Whether clarifications were requested
 * @param resolvedProblem - The resolved problem statement
 * @param agents - Array of agents to collect questions from
 * @param sysConfig - System configuration containing clarifications settings
 * @returns Promise resolving to collected clarifications, or undefined if not requested
 */
async function collectFinalClarifications(
  clarificationRequested: boolean,
  resolvedProblem: string,
  agents: Agent[],
  sysConfig: SystemConfig
): Promise<AgentClarifications[] | undefined> {
  if (!clarificationRequested) {
    return undefined;
  }

  const maxPer = sysConfig.debate?.clarificationsMaxPerAgent ?? DEFAULT_CLARIFICATIONS_MAX_PER_AGENT;
  return await collectAndAnswerClarifications(resolvedProblem, agents, maxPer);
}

/**
 * Options for the debate command.
 */
interface DebateCommandOptions {
  agents?: string;
  rounds?: string;
  config?: string;
  output?: string;
  problemDescription?: string;
  context?: string;
  envFile?: string;
  verbose?: boolean;
  report?: string;
  clarify?: boolean;
}

// eslint-disable-next-line max-lines-per-function
export function debateCommand(program: Command): void {
  program
    .command('debate')
    .argument('[problem]', 'Problem statement to debate (provide exactly one of this or --problemDescription)')
    .option('-a, --agents <roles>', 'Comma-separated agent roles (architect,performance,...)')
    .option('-r, --rounds <number>', `Number of rounds (default ${DEFAULT_ROUNDS})`)
    .option('-c, --config <path>', 'Path to configuration file (default ./debate-config.json)')
    .option('-o, --output <path>', 'Output file; .json writes full state, others write final solution text')
    .option('-p, --problemDescription <path>', 'Path to a text file containing the problem description')
    .option('--context <path>', 'Path to a context directory for file access tools (default: current working directory)')
    .option('-e, --env-file <path>', 'Path to environment file (default: .env)')
    .option('-v, --verbose', 'Verbose output')
    .option('--report <path>', 'Generate markdown report file')
    .option('--clarify', 'Run a one-time pre-debate clarifications phase')
    .action(async (problem: string | undefined, options: DebateCommandOptions): Promise<void> => {
      try {
        // Load environment variables from .env file
        loadEnvironmentFile(options.envFile, options.verbose);
        
        const resolvedProblem = await resolveProblemDescription(problem, options);
        
        const contextDirectory = resolveContextDirectory(options.context);
        
        const sysConfig = await loadConfig(options.config);
        const debateCfg = debateConfigFromSysConfig(sysConfig, options);
        const agentConfigs = agentConfigsFromSysConfig(sysConfig, options);

        const promptSources: PromptSources = { agents: [], judge: { id: sysConfig.judge!.id, source: PROMPT_SOURCES.BUILT_IN }, };

        const systemSummaryConfig = getSystemSummaryConfig(debateCfg);

        // Initialize progress UI early so it can be used for agent logging
        const progressUI = new DebateProgressUI();
        progressUI.initialize(debateCfg.rounds);
        
        const agentLogger = createAgentLogger(progressUI, options.verbose || false);

        const stateManager = new StateManager();
        
        // Generate debate ID early so we can use it for tracing context
        // This ensures the trace metadata has the correct debate ID from the start
        const debateIdDate = new Date();
        const debateId = generateDebateId(debateIdDate);
        
        // Determine if clarification was requested (calculate once, reuse for trace metadata and clarifications phase)
        const clarificationRequested = isClarificationRequested(options, sysConfig);
        
        // Initialize tracing context if enabled
        const tracingContext = initializeTracingContext({
          debateCfg, debateId, debateIdDate,
          options,  clarificationRequested,
          agentConfigs, sysConfig
        });

        const agents = buildAgents({
          agentConfigs,
          configDir: sysConfig.configDir || process.cwd(),
          systemSummaryConfig,
          collect: promptSources,
          logger: agentLogger,
          tracingContext,
          contextDirectory
        });

        const orchestrator = createOrchestratorForDebate({ agents, sysConfig, systemSummaryConfig,
                                                            promptSources, tracingContext, progressUI,
                                                            options, stateManager, debateCfg,
                                                            contextDirectory, agentLogger });

        if (options.verbose) 
            outputVerboseDebateInfo( agentConfigs, promptSources, sysConfig, systemSummaryConfig, orchestrator);

        const clarificationContext: RunDebateClarificationContext = { clarificationRequested, resolvedProblem, agents, sysConfig };

        // Inform user that debate is running
        infoUser('Running debate');

        // Start progress UI and run debate; clarification phase (collect for classic, suspend/resume for state machine) is inside runDebateWithClarifications
        await progressUI.start();
        const result: DebateResult = await runDebateWithClarifications( orchestrator, resolvedProblem, 
                                                                        undefined, debateId, clarificationContext);
        await progressUI.complete();

        // Flush trace if tracing was enabled
        // Note: Traces are automatically ended when all spans are ended
        await flushTracingContext(tracingContext);

        // Persist prompt sources once per debate
        await stateManager.setPromptSources(result.debateId, promptSources);

        // Persist path notice (StateManager already persisted during run)
        infoUser(`Saved debate to ./debates/${result.debateId}.json`);

        await outputResults(result, stateManager, options);

        // Generate report if requested
        await generateReportIfRequested(options, result, stateManager, agentConfigs, sysConfig.judge!, resolvedProblem);
      } catch (err: unknown) {
        const errorWithCode = err as ErrorWithCode;
        const code = (errorWithCode && typeof errorWithCode.code === 'number') ? errorWithCode.code : EXIT_GENERAL_ERROR;
        writeStderr((errorWithCode?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(errorWithCode?.message || 'Unknown error'), { code });
      }
    });
}
