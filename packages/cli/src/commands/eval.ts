import fs from 'fs';
import path from 'path';

import { Command } from 'commander';

// Import from dialectic-core
import {
  writeStderr,
  loadEnvironmentFile,
  EXIT_INVALID_ARGS,
  EXIT_GENERAL_ERROR,
  EvaluatorConfig,
  EvaluatorInputs,
  ParsedEvaluation,
  AggregatedJsonOutput,
  AggregatedAverages,
  clampScoreToRange,
  isEnabledEvaluator,
  isFulfilled,
  DebateState,
  EvaluatorAgent,
  resolvePrompt,
  PROMPT_SOURCES,
  LLM_PROVIDERS,
  numOrUndefined,
  averageOrNull,
  createValidationError,
  readJsonFile,
  readBuiltInPrompt,
} from 'dialectic-core';

import { extractRequirementsInfo } from './eval-requirements';

const FILE_ENCODING_UTF8 = 'utf-8';
const JSON_INDENT_SPACES = 2;
const CSV_HEADER = 'debate,Functional Completeness,Performance & Scalability,Security,Maintainability & Evolvability,Regulatory Compliance,Testability,Requirements Fulfillment,Overall Score';
const JSON_EXTENSION = '.json';
const CSV_EXTENSION = '.csv';

/**
 * Resolves a file path relative to the workspace root (original working directory).
 *
 * npm sets INIT_CWD to the original working directory before workspace commands change cwd.
 * This function uses that value if available, otherwise falls back to process.cwd().
 * Absolute paths are returned as-is, relative paths are resolved against the base directory.
 *
 * @param {string} filePath - The file path to resolve (absolute or relative).
 * @returns {string} The resolved absolute path.
 */
function resolveFilePath(filePath: string): string {
  // npm sets INIT_CWD to the original working directory before workspace commands change cwd
  const baseDir = process.env.INIT_CWD || process.cwd();
  // Resolve path relative to original working directory (workspace root)
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

/**
 * Result of loading an evaluator configuration file.
 */
type LoadedEvaluatorConfig = {
  /** Array of evaluator agent configurations */
  agents: EvaluatorConfig[];
  /** Absolute directory path containing the configuration file */
  configDir: string;
};

/**
 * Builds a Markdown-formatted string representing all clarifications exchanged during a debate.
 *
 * The output contains a sequence of agent clarification sections. Each section begins with an
 * H3 header including the agent's name and role, followed by all questions and answers exchanged
 * by that agent, formatted in code blocks for clarity.
 *
 * If there are no clarifications, returns a minimal Markdown code block separator.
 *
 * Example output (for one clarification):
 * 
 * ### Alice (Judge)
 * Question (q1):
 * 
 * ```text
 * What are the system's scalability requirements?
 * ```
 * 
 * Answer:
 * 
 * ```text
 * The system must support 10k concurrent users.
 * ```
 *
 * @param {DebateState} state - The debate state object containing clarifications.
 * @returns {string} Markdown string summarizing all clarifications for insertion into prompts.
 */
function buildClarificationsMarkdown(state: DebateState): string {
  // Handle missing or empty clarifications
  if (!state.clarifications || state.clarifications.length === 0) {
    return '``````\n``````';
  }
  
  let out = '';
  for (const group of state.clarifications) {
    // Skip invalid groups
    if (!group || !group.agentName || !group.role || !group.items || group.items.length === 0) {
      continue;
    }
    out += `### ${group.agentName} (${group.role})\n`;
    for (const item of group.items) {
      // Skip invalid items
      if (!item || !item.id || !item.question || item.answer === undefined) {
        continue;
      }
      out += `Question (${item.id}):\n\n\`\`\`text\n${item.question}\n\`\`\`\n\n`;
      out += `Answer:\n\n\`\`\`text\n${item.answer}\n\`\`\`\n\n`;
    }
  }
  
  // Return formatted output, or empty code blocks if nothing was added
  const trimmed = out.trim();
  return trimmed || '``````\n``````';
}

/**
 * Extracts and parses the first JSON object found in a string.
 *
 * This function searches the input text for the first occurrence of a substring
 * that resembles a JSON object (i.e., text between the first '{' and the matching '}').
 * It then attempts to parse this substring as JSON.
 *
 * If no curly-brace-enclosed object is found, it will attempt to parse the entire string.
 * If parsing fails at any point, the function returns null.
 *
 * @param {string} text - The input string to search for a JSON object.
 * @returns {Record<string, any> | null} The parsed object if successful, or null if parsing fails.
 */
function parseFirstJsonObject(text: string): Record<string, any> | null {
  const match = text.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : text;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Attempts to validate, clamp, and append a numeric score to an array, issuing warnings if invalid.
 *
 * This function is used to aggregate scores that may be missing or out of the valid range for evaluation metrics. 
 * - If the input value `v` is not a finite number, it issues a warning (with the given agent and label) and skips it.
 * - If the number is outside the allowed range (1 to 10), it is clamped to that range and a separate warning is issued.
 * - If the final value is valid, it is appended to the destination array `arr`.
 *
 * @param {number[]} arr - The array to which the (possibly clamped) numeric value will be appended.
 * @param {unknown} v - The value to validate and potentially append.
 * @param {string} warnLabel - The label used in warnings, describing the metric or field involved.
 * @param {string} agentId - The agent identifier used in warning messages.
 */
function pushIfValid(arr: number[], v: unknown, warnLabel: string, agentId: string) {
  const n = numOrUndefined(v);
  if (n === undefined) {
    writeStderr(`[${agentId}] Invalid or missing numeric score for ${warnLabel}; ignoring\n`);
    return;
  }
  const clamped = clampScoreToRange(n);
  if (clamped !== n) {
    writeStderr(`[${agentId}] Score for ${warnLabel} clamped to [1,10] from ${n}\n`);
  }
  if (clamped !== undefined) arr.push(clamped);
}

/**
 * Renders a markdown table displaying aggregated evaluation scores.
 *
 * This function takes an object containing aggregate scores for various evaluation metrics 
 * (such as functional completeness, performance, security, etc.) and formats them into 
 * a markdown table suitable for display or reporting.
 *
 * Each value is formatted to two decimal places if available, or "N/A" if null or undefined.
 * The table columns are:
 * - Functional Completeness
 * - Performance & Scalability
 * - Security
 * - Maintainability & Evolvability
 * - Regulatory Compliance
 * - Testability
 * - Overall Score
 *
 * @param {AggregatedAverages} agg - An object containing aggregated (averaged) scores for each metric.
 * @returns {string} The markdown table as a string.
 */
function renderMarkdownTable(agg: AggregatedAverages): string {
  const f = (v: number | null) => v == null ? 'N/A' : v.toFixed(2);
  let table = '';
  table += `| Functional Completeness | Performance & Scalability | Security | Maintainability & Evolvability | Regulatory Compliance | Testability | Requirements Fulfillment | Overall Score |\n`;
  table += `|------------------------|---------------------------|----------|-------------------------------|------------------------|------------|-------------------------|---------------|\n`;
  table += `| ${f(agg.functional_completeness)} | ${f(agg.performance_scalability)} | ${f(agg.security)} | ${f(agg.maintainability_evolvability)} | ${f(agg.regulatory_compliance)} | ${f(agg.testability)} | ${f(agg.requirements_fulfillment)} | ${f(agg.overall_score)} |\n`;
  return table;
}

/**
 * Escapes a CSV field value according to RFC 4180.
 * Fields containing commas, double quotes, or newlines must be quoted, and quotes must be escaped.
 *
 * @param {string} value - The field value to escape.
 * @returns {string} The escaped CSV field value.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formats aggregated averages and debate filename into a CSV row string.
 *
 * @param {string} debateFilename - The debate filename (without .json extension).
 * @param {AggregatedAverages} agg - An object containing aggregated (averaged) scores for each metric.
 * @returns {string} The CSV row as a string with all fields properly escaped.
 */
function formatCsvRow(debateFilename: string, agg: AggregatedAverages): string {
  const formatScore = (v: number | null): string => {
    return v == null ? '' : v.toFixed(2);
  };

  const fields = [
    debateFilename,
    formatScore(agg.functional_completeness),
    formatScore(agg.performance_scalability),
    formatScore(agg.security),
    formatScore(agg.maintainability_evolvability),
    formatScore(agg.regulatory_compliance),
    formatScore(agg.testability),
    formatScore(agg.requirements_fulfillment),
    formatScore(agg.overall_score),
  ];

  return fields.map(escapeCsvField).join(',');
}

/**
 * Builds an AggregatedJsonOutput object from aggregated averages and per-agent results.
 *
 * @param {AggregatedAverages} aggregatedAverages - The aggregated average scores across all metrics.
 * @param {Record<string, ParsedEvaluation>} perAgentResults - Per-agent parsed evaluation results, keyed by agent ID.
 * @returns {AggregatedJsonOutput} The formatted JSON output object.
 */
function buildAggregatedJsonOutput(
  aggregatedAverages: AggregatedAverages,
  perAgentResults: Record<string, ParsedEvaluation>
): AggregatedJsonOutput {
  return {
    evaluation: {
      functional_completeness: { average_score: aggregatedAverages.functional_completeness },
      non_functional: {
        performance_scalability: { average_score: aggregatedAverages.performance_scalability },
        security: { average_score: aggregatedAverages.security },
        maintainability_evolvability: { average_score: aggregatedAverages.maintainability_evolvability },
        regulatory_compliance: { average_score: aggregatedAverages.regulatory_compliance },
        testability: { average_score: aggregatedAverages.testability },
        requirements_fulfillment: { average_score: aggregatedAverages.requirements_fulfillment },
      },
    },
    overall_score: aggregatedAverages.overall_score,
    agents: perAgentResults,
  };
}

/**
 * Writes evaluation results to a CSV file, appending a data row or creating a new file with header.
 *
 * Extracts the debate filename from the debate path, removes the .json extension if present,
 * formats the aggregated averages as a CSV row, and either appends to an existing file or
 * creates a new file with header and data row.
 *
 * @param {string} resolvedPath - The absolute path to the CSV output file.
 * @param {string} debatePath - The path to the debate file (used to extract filename).
 * @param {AggregatedAverages} aggregatedAverages - The aggregated average scores across all metrics.
 * @returns {Promise<void>} A promise that resolves when the CSV file has been written.
 */
async function writeCsvOutput(
  resolvedPath: string,
  debatePath: string,
  aggregatedAverages: AggregatedAverages
): Promise<void> {
  let debateFilename = path.basename(debatePath);
  if (debateFilename.toLowerCase().endsWith(JSON_EXTENSION)) {
    debateFilename = debateFilename.slice(0, -JSON_EXTENSION.length);
  }
  const csvRow = formatCsvRow(debateFilename, aggregatedAverages);
  
  if (fs.existsSync(resolvedPath)) {
    await fs.promises.appendFile(resolvedPath, csvRow + '\n', FILE_ENCODING_UTF8);
  } else {
    await fs.promises.writeFile(resolvedPath, CSV_HEADER + '\n' + csvRow + '\n', FILE_ENCODING_UTF8);
  }
}

/**
 * Writes evaluation results as a Markdown table to a file or stdout.
 *
 * Formats aggregated averages as a Markdown table and writes to the specified file path,
 * or to stdout if no path is provided.
 *
 * @param {string | undefined} resolvedPath - The absolute path to the output file, or undefined for stdout.
 * @param {AggregatedAverages} aggregatedAverages - The aggregated average scores across all metrics.
 * @returns {Promise<void>} A promise that resolves when the Markdown output has been written.
 */
async function writeMarkdownOutput(
  resolvedPath: string | undefined,
  aggregatedAverages: AggregatedAverages
): Promise<void> {
  const md = renderMarkdownTable(aggregatedAverages);
  if (resolvedPath) {
    await fs.promises.writeFile(resolvedPath, md, FILE_ENCODING_UTF8);
  } else {
    process.stdout.write(md + '\n');
  }
}

/**
 * Writes evaluation results to a file or stdout in JSON, CSV, or Markdown format.
 *
 * This function handles the output of evaluation results based on the output path:
 * - If outputPath ends with '.json', writes a detailed JSON file containing aggregated averages and per-agent results.
 * - If outputPath ends with '.csv', writes CSV format with header (if file doesn't exist) and appends data row.
 * - Otherwise, writes a Markdown table with aggregated scores to the file or stdout (if no path provided).
 *
 * @param {AggregatedAverages} aggregatedAverages - The aggregated average scores across all metrics.
 * @param {Record<string, ParsedEvaluation>} perAgentResults - Per-agent parsed evaluation results, keyed by agent ID.
 * @param {string | undefined} outputPath - Optional output file path. If undefined, writes Markdown to stdout.
 * @param {string} debatePath - The path to the debate file (used to extract filename for CSV).
 * @returns {Promise<void>} A promise that resolves when the output has been written.
 */
async function writeEvaluationResults(
  aggregatedAverages: AggregatedAverages,
  perAgentResults: Record<string, ParsedEvaluation>,
  outputPath: string | undefined,
  debatePath: string
): Promise<void> {
  const resolvedPath = outputPath ? resolveFilePath(outputPath) : undefined;
  
  if (resolvedPath && resolvedPath.toLowerCase().endsWith(JSON_EXTENSION)) {
    const jsonOut = buildAggregatedJsonOutput(aggregatedAverages, perAgentResults);
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(resolvedPath);
      await fs.promises.mkdir(parentDir, { recursive: true });
      await fs.promises.writeFile(resolvedPath, JSON.stringify(jsonOut, null, JSON_INDENT_SPACES), FILE_ENCODING_UTF8);
    } catch (writeErr: any) {
      throw writeErr;
    }
  } else if (resolvedPath && resolvedPath.toLowerCase().endsWith(CSV_EXTENSION)) {
    await writeCsvOutput(resolvedPath, debatePath, aggregatedAverages);
  } else {
    await writeMarkdownOutput(resolvedPath, aggregatedAverages);
  }
}

/**
 * Loads and validates an evaluator configuration JSON file.
 *
 * This function reads the evaluator configuration file specified by the given path, validates
 * that it contains a non-empty array of evaluator agent definitions, and constructs an array
 * of EvaluatorConfig objects. It also determines the directory of the configuration file, which
 * can be useful for resolving relative file paths inside the configuration.
 *
 * The expected structure of the configuration file is:
 * {
 *   "agents": [
 *     {
 *       "id": string | number,
 *       "name": string,
 *       "model": string,
 *       "provider": string,
 *       "systemPromptPath"?: string,
 *       "userPromptPath"?: string,
 *       "timeout"?: number,
 *       "enabled"?: boolean
 *     },
 *     ...
 *   ]
 * }
 *
 * @param {string} configPath - The path to the evaluator configuration JSON file, relative or absolute.
 * @returns {LoadedEvaluatorConfig} An object containing the agent configurations and config directory path.
 * @throws {Error} Throws a validation error with a specific exit code if:
 *   - The config file cannot be read or parsed as valid JSON.
 *   - The agents array is missing, not an array, or has zero entries.
 */
function loadEvaluatorConfig(configPath: string): LoadedEvaluatorConfig {
  const resolvedPath = resolveFilePath(configPath);
  const cfg = readJsonFile<any>(resolvedPath, 'Evaluator config file');
  if (!cfg || !Array.isArray(cfg.agents) || cfg.agents.length === 0) {
    throw createValidationError('Invalid evaluator config: agents array required (length >= 1)', EXIT_INVALID_ARGS);
  }
  const configDir = path.dirname(resolvedPath);
  const agents: EvaluatorConfig[] = cfg.agents.map((a: unknown) => {
    // Type guard and validation for raw agent config
    if (!a || typeof a !== 'object') {
      throw createValidationError('Invalid evaluator config: agent must be an object', EXIT_INVALID_ARGS);
    }
    const agent = a as Record<string, unknown>;
    // Validate provider is a valid LLM provider
    const provider = typeof agent.provider === 'string' 
      ? (agent.provider as typeof LLM_PROVIDERS.OPENAI | typeof LLM_PROVIDERS.OPENROUTER)
      : LLM_PROVIDERS.OPENAI; // Default to openai if invalid
    
    return {
      id: String(agent.id ?? ''),
      name: String(agent.name ?? ''),
      model: String(agent.model ?? ''),
      provider,
      systemPromptPath: typeof agent.systemPromptPath === 'string' ? agent.systemPromptPath : undefined,
      userPromptPath: typeof agent.userPromptPath === 'string' ? agent.userPromptPath : undefined,
      timeout: typeof agent.timeout === 'number' ? agent.timeout : undefined,
      enabled: typeof agent.enabled === 'boolean' ? agent.enabled : undefined,
    } as EvaluatorConfig;
  });
  return { agents, configDir };
}

/**
 * Loads evaluator configuration, filters for enabled agents, and validates that at least one enabled agent exists.
 *
 * This is a convenience helper that combines loading the configuration, filtering for enabled evaluators,
 * and validating that the result is non-empty.
 *
 * @param {string} configPath - The path to the evaluator configuration JSON file.
 * @returns {{ enabledAgents: EvaluatorConfig[], configDir: string }} Object containing enabled agents and config directory.
 * @throws {Error} Throws a validation error if no enabled evaluator agents are found in the config.
 */
function loadAndValidateEnabledAgents(configPath: string): { enabledAgents: EvaluatorConfig[], configDir: string } {
  const { agents: rawAgents, configDir } = loadEvaluatorConfig(configPath);
  const enabledAgents = rawAgents.filter(isEnabledEvaluator);
  if (enabledAgents.length === 0) {
    throw createValidationError('No enabled evaluator agents found in config', EXIT_INVALID_ARGS);
  }
  return { enabledAgents, configDir };
}

/**
 * Loads and validates a debate state file, extracting required fields for evaluation.
 *
 * This function reads the debate JSON file, validates that required fields (problem and final solution)
 * are present and non-empty, and builds a Markdown representation of the clarifications.
 *
 * @param {string} debatePath - The path to the debate state JSON file.
 * @returns {EvaluatorInputs} Object containing validated debate data for evaluator input.
 * @throws {Error} Throws a validation error if:
 *   - The debate file cannot be read or parsed.
 *   - The problem field is missing or empty.
 *   - The finalSolution.description field is missing or empty.
 */
function loadAndValidateDebateState(debatePath: string): EvaluatorInputs {
  const resolvedPath = resolveFilePath(debatePath);
  const debate: DebateState = readJsonFile<DebateState>(resolvedPath, 'Debate file');
  const problem = (debate.problem || '').trim();
  const finalSolution = (debate.finalSolution && debate.finalSolution.description || '').trim();
  if (!problem) throw createValidationError('Invalid debate JSON: missing non-empty problem', EXIT_INVALID_ARGS);
  if (!finalSolution) throw createValidationError('Invalid debate JSON: missing non-empty finalSolution.description', EXIT_INVALID_ARGS);
  
  // Access clarifications directly from the parsed object to avoid type issues
  const clarificationsMarkdown = buildClarificationsMarkdown(debate);
  
  // Extract requirements information (handles missing data gracefully)
  const requirementsInfo = extractRequirementsInfo(debate);
  const requirementsInfoJson = JSON.stringify(requirementsInfo, null, 2);
  
  return { problem, finalSolution, clarificationsMarkdown, requirementsInfo: requirementsInfoJson };
}

/**
 * Validates and parses an evaluator agent's result from a Promise.allSettled outcome.
 *
 * This function checks if the promise was fulfilled, extracts the raw text output,
 * attempts to parse it as JSON, and logs warnings for any failures. If the result
 * is invalid or cannot be parsed, it returns null.
 *
 * @param {PromiseSettledResult<any>} result - The settled promise result from an evaluator agent.
 * @param {string} agentId - The agent identifier used in warning messages.
 * @returns {ParsedEvaluation | null} The parsed evaluation object, or null if validation/parsing failed.
 */
function validateAndParseEvaluatorResult(result: PromiseSettledResult<any>, agentId: string): ParsedEvaluation | null {
  if (!isFulfilled(result)) {
    writeStderr(`[${agentId}] Skipped due to error\n`);
    return null;
  }
  const rawText = result.value.rawText || '';
  const parsed = parseFirstJsonObject(rawText);
  if (parsed === null) {
    writeStderr(`[${agentId}] Invalid JSON output; skipping agent\n`);
    return null;
  }
  return parsed as ParsedEvaluation;
}

/**
 * Builds an array of EvaluatorAgent instances from enabled evaluator configurations.
 *
 * This function loads default prompts for evaluators, resolves custom prompts (if specified in the
 * configuration), and constructs EvaluatorAgent instances. It optionally logs verbose information
 * about each agent's provider, model, and prompt sources.
 *
 * @param {EvaluatorConfig[]} enabledAgents - Array of enabled evaluator configurations.
 * @param {string} configDir - Absolute path to the configuration directory (for resolving relative prompt paths).
 * @param {boolean} verbose - If true, logs detailed information about each agent to stderr.
 * @returns {EvaluatorAgent[]} Array of instantiated EvaluatorAgent instances ready for evaluation.
 */
function buildEvaluatorAgents(enabledAgents: EvaluatorConfig[], configDir: string, verbose: boolean): EvaluatorAgent[] {
  const sysDefault = readBuiltInPrompt(
    'eval/prompts/system.md',
    'You are an expert software design evaluator. Output ONLY a single JSON object as specified.'
  );
  const userDefault = readBuiltInPrompt(
    'eval/prompts/user.md',
    '{ "evaluation": {}, "overall_summary": { "overall_score": 5 } }'
  );

  return enabledAgents.map((evaluatorConfig) => {
    const sysRes = resolvePrompt({ 
      label: evaluatorConfig.name, 
      configDir, 
      ...(evaluatorConfig.systemPromptPath !== undefined && { promptPath: evaluatorConfig.systemPromptPath }), 
      defaultText: sysDefault 
    });
    const userRes = resolvePrompt({ 
      label: `${evaluatorConfig.name} (user)`, 
      configDir, 
      ...(evaluatorConfig.userPromptPath !== undefined && { promptPath: evaluatorConfig.userPromptPath }), 
      defaultText: userDefault 
    });
    
    if (verbose) {
      const sysSrc = sysRes.source === PROMPT_SOURCES.FILE ? sysRes.absPath : 'built-in default';
      const usrSrc = userRes.source === PROMPT_SOURCES.FILE ? userRes.absPath : 'built-in default';
      writeStderr(`[${evaluatorConfig.id}] provider=${evaluatorConfig.provider} model=${evaluatorConfig.model} systemPrompt=${sysSrc} userPrompt=${usrSrc}\n`);
    }
    
    return EvaluatorAgent.fromConfig(evaluatorConfig, sysRes.text, userRes.text);
  });
}

/**
 * Registers the 'eval' CLI command, which evaluates a completed debate using multiple evaluator agents.
 *
 * This command aggregates scores and outputs either a JSON or Markdown summary of the evaluation.
 *
 * @param {Command} program - Commander.js program object to which the command is added.
 *
 * Command-line Options:
 *   -c, --config <path>      Path to evaluator configuration JSON file.
 *   -d, --debate <path>      Path to debate JSON file (DebateState format).
 *   --env-file <path>        Optional: Path to .env file for environment variables.
 *   -v, --verbose            Optional: Enable verbose diagnostic output.
 *   -o, --output <path>      Optional: Output file destination; if ends with ".json" outputs as JSON, otherwise as Markdown.
 *
 * Behavior:
 *   - Loads and validates evaluator configuration and debate state files.
 *   - Constructs and runs all enabled evaluator agents in parallel on the given debate data.
 *   - Parses, validates, and aggregates the numeric outputs from each agent.
 *   - Outputs an aggregated summary (JSON or Markdown table) to file or stdout, and per-agent results to a JSON map if JSON output is selected.
 *   - Handles errors gracefully, providing error messages and exit codes.
 *
 * Output:
 *   - If --output ends with .json: writes full machine-readable output (includes per-agent data and averages).
 *   - Otherwise: outputs a Markdown table with score averages to stdout or file.
 *
 * Errors:
 *   - Exits with explicit error codes and user-friendly messages on invalid arguments, missing files, or evaluation failures.
 */
export function evalCommand(program: Command) {
  program
    .command('eval')
    .requiredOption('-c, --config <path>', 'Path to evaluator configuration JSON')
    .requiredOption('-d, --debate <path>', 'Path to debate JSON file (DebateState)')
    .option('--env-file <path>', 'Path to .env file')
    .option('-v, --verbose', 'Verbose diagnostics')
    .option('-o, --output <path>', 'Output destination (json => aggregated JSON; otherwise Markdown)')
    .description('Evaluate a completed debate using evaluator agents')
    .action(async (options: any) =>
    {
      try {

        loadEnvironmentFile(options.envFile, options.verbose);

        const { enabledAgents, configDir } = loadAndValidateEnabledAgents(options.config);
        const evaluators = buildEvaluatorAgents(enabledAgents, configDir, options.verbose);
        const inputs = loadAndValidateDebateState(options.debate);

        // Run all in parallel
        const results = await Promise.allSettled(evaluators.map((e) => e.evaluate(inputs)));

        const perAgentParsed: Record<string, ParsedEvaluation> = {};
        const arrFc: number[] = [];
        const arrPerf: number[] = [];
        const arrSec: number[] = [];
        const arrMaint: number[] = [];
        const arrReg: number[] = [];
        const arrTest: number[] = [];
        const arrReqFulfill: number[] = [];
        const arrOverall: number[] = [];

        results.forEach((res, idx) => {
          const agent = evaluators[idx];
          if (!agent) return;
          const agentId = agent.id;
          
          const parsed = validateAndParseEvaluatorResult(res, agentId);
          if (parsed === null) return;
          
          perAgentParsed[agentId] = parsed;

          const evalObj = parsed.evaluation || {};
          const func = evalObj.functional_completeness || {};
          const nonf = evalObj.non_functional || {};
          const overallSummary = parsed.overall_summary || {};

          pushIfValid(arrFc, func.score, 'functional_completeness.score', agentId);
          pushIfValid(arrPerf, nonf.performance_scalability?.score, 'non_functional.performance_scalability.score', agentId);
          pushIfValid(arrSec, nonf.security?.score, 'non_functional.security.score', agentId);
          pushIfValid(arrMaint, nonf.maintainability_evolvability?.score, 'non_functional.maintainability_evolvability.score', agentId);
          pushIfValid(arrReg, nonf.regulatory_compliance?.score, 'non_functional.regulatory_compliance.score', agentId);
          pushIfValid(arrTest, nonf.testability?.score, 'non_functional.testability.score', agentId);
          pushIfValid(arrReqFulfill, nonf.requirements_fulfillment?.score, 'non_functional.requirements_fulfillment.score', agentId);
          pushIfValid(arrOverall, overallSummary.overall_score, 'overall_summary.overall_score', agentId);
        });

        const agg: AggregatedAverages = {
          functional_completeness: averageOrNull(arrFc),
          performance_scalability: averageOrNull(arrPerf),
          security: averageOrNull(arrSec),
          maintainability_evolvability: averageOrNull(arrMaint),
          regulatory_compliance: averageOrNull(arrReg),
          testability: averageOrNull(arrTest),
          requirements_fulfillment: averageOrNull(arrReqFulfill),
          overall_score: averageOrNull(arrOverall),
        };

        await writeEvaluationResults(agg, perAgentParsed, options.output, options.debate);
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        try {
          writeStderr((err?.message || 'Unknown error') + '\n');
        } catch {
          // Ignore errors from writeStderr to prevent infinite recursion
        }
        // Rethrow for runCli catch to set process exit when direct run
        // Preserve original error if it already has a code, otherwise create new one
        if (err && typeof err.code === 'number') {
          throw err;
        }
        const error = new Error(err?.message || 'Unknown error');
        (error as any).code = code;
        throw error;
      }
    });
}


