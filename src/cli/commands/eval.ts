import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { writeStderr } from '../index';
import { loadEnvironmentFile } from '../../utils/env-loader';
import { EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { EvaluatorConfig, ParsedEvaluation, AggregatedJsonOutput, AggregatedAverages, clampScoreToRange, isEnabledEvaluator } from '../../types/eval.types';
import { DebateState } from '../../types/debate.types';
import { EvaluatorAgent } from '../../eval/evaluator-agent';
import { resolvePrompt, readBuiltInPrompt } from '../../utils/prompt-loader';
import { PROMPT_SOURCES } from '../../types/agent.types';
import { numOrUndefined, averageOrNull } from '../../utils/common';

const FILE_ENCODING_UTF8 = 'utf-8';
const JSON_INDENT_SPACES = 2;

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
 * Creates a validation error with a custom error code.
 *
 * @param {string} message - The error message to associate with the error.
 * @param {number} code - The numeric error code indicating the exit or validation type.
 * @returns {Error} An Error object with the specified message and an added 'code' property.
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
 * @param {string} p - The path to the JSON file, relative to the current working directory.
 * @returns {T} The parsed JSON object of type T.
 * @throws {Error} Throws a validation error with a specific exit code if:
 *   - The file does not exist (EXIT_INVALID_ARGS).
 *   - The path is not a file (EXIT_INVALID_ARGS).
 *   - The file contains invalid JSON (EXIT_INVALID_ARGS).
 */
function readJsonFile<T>(p: string): T {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    throw createValidationError(`File not found: ${abs}`, EXIT_INVALID_ARGS);
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw createValidationError(`Path is not a file: ${abs}`, EXIT_INVALID_ARGS);
  }
  const raw = fs.readFileSync(abs, FILE_ENCODING_UTF8);
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    throw createValidationError(`Invalid JSON: ${abs}`, EXIT_INVALID_ARGS);
  }
}

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
  if (!state.clarifications || state.clarifications.length === 0) return '``````\n``````';
  let out = '';
  for (const group of state.clarifications) {
    out += `### ${group.agentName} (${group.role})\n`;
    for (const item of group.items) {
      out += `Question (${item.id}):\n\n\`\`\`text\n${item.question}\n\`\`\`\n\n`;
      out += `Answer:\n\n\`\`\`text\n${item.answer}\n\`\`\`\n\n`;
    }
  }
  return out.trim();
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
  table += `| Functional Completeness | Performance & Scalability | Security | Maintainability & Evolvability | Regulatory Compliance | Testability | Overall Score |\n`;
  table += `|------------------------|---------------------------|----------|-------------------------------|------------------------|------------|---------------|\n`;
  table += `| ${f(agg.functional_completeness)} | ${f(agg.performance_scalability)} | ${f(agg.security)} | ${f(agg.maintainability_evolvability)} | ${f(agg.regulatory_compliance)} | ${f(agg.testability)} | ${f(agg.overall_score)} |\n`;
  return table;
}

/**
 * Writes evaluation results to a file or stdout in JSON or Markdown format.
 *
 * This function handles the output of evaluation results based on the output path:
 * - If outputPath ends with '.json', writes a detailed JSON file containing aggregated averages and per-agent results.
 * - Otherwise, writes a Markdown table with aggregated scores to the file or stdout (if no path provided).
 *
 * @param {AggregatedAverages} aggregatedAverages - The aggregated average scores across all metrics.
 * @param {Record<string, ParsedEvaluation>} perAgentResults - Per-agent parsed evaluation results, keyed by agent ID.
 * @param {string | undefined} outputPath - Optional output file path. If undefined, writes Markdown to stdout.
 * @returns {Promise<void>} A promise that resolves when the output has been written.
 */
async function writeEvaluationResults(
  aggregatedAverages: AggregatedAverages,
  perAgentResults: Record<string, ParsedEvaluation>,
  outputPath: string | undefined
): Promise<void> {
  const resolvedPath = outputPath ? path.resolve(process.cwd(), outputPath) : undefined;
  
  if (resolvedPath && resolvedPath.toLowerCase().endsWith('.json')) {
    const jsonOut: AggregatedJsonOutput = {
      evaluation: {
        functional_completeness: { average_score: aggregatedAverages.functional_completeness },
        non_functional: {
          performance_scalability: { average_score: aggregatedAverages.performance_scalability },
          security: { average_score: aggregatedAverages.security },
          maintainability_evolvability: { average_score: aggregatedAverages.maintainability_evolvability },
          regulatory_compliance: { average_score: aggregatedAverages.regulatory_compliance },
          testability: { average_score: aggregatedAverages.testability },
        },
      },
      overall_score: aggregatedAverages.overall_score,
      agents: perAgentResults,
    };
    await fs.promises.writeFile(resolvedPath, JSON.stringify(jsonOut, null, JSON_INDENT_SPACES), FILE_ENCODING_UTF8);
  } else {
    const md = renderMarkdownTable(aggregatedAverages);
    if (resolvedPath) {
      await fs.promises.writeFile(resolvedPath, md, FILE_ENCODING_UTF8);
    } else {
      process.stdout.write(md + '\n');
    }
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
  const abs = path.resolve(process.cwd(), configPath);
  const cfg = readJsonFile<any>(configPath);
  if (!cfg || !Array.isArray(cfg.agents) || cfg.agents.length === 0) {
    throw createValidationError('Invalid evaluator config: agents array required (length >= 1)', EXIT_INVALID_ARGS);
  }
  const configDir = path.dirname(abs);
  const agents: EvaluatorConfig[] = cfg.agents.map((a: any) => ({
    id: String(a.id), name: String(a.name), model: String(a.model),
    provider: a.provider, systemPromptPath: a.systemPromptPath, userPromptPath: a.userPromptPath,
    timeout: a.timeout, enabled: a.enabled,
  }));
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
 * @returns {{ problem: string, finalSolution: string, clarificationsMarkdown: string }} Object containing validated debate data.
 * @throws {Error} Throws a validation error if:
 *   - The debate file cannot be read or parsed.
 *   - The problem field is missing or empty.
 *   - The finalSolution.description field is missing or empty.
 */
function loadAndValidateDebateState(debatePath: string): { problem: string, finalSolution: string, clarificationsMarkdown: string } {
  const debate: DebateState = readJsonFile<DebateState>(debatePath);
  const problem = (debate.problem || '').trim();
  const finalSolution = (debate.finalSolution && debate.finalSolution.description || '').trim();
  if (!problem) throw createValidationError('Invalid debate JSON: missing non-empty problem', EXIT_INVALID_ARGS);
  if (!finalSolution) throw createValidationError('Invalid debate JSON: missing non-empty finalSolution.description', EXIT_INVALID_ARGS);
  
  const clarificationsMarkdown = buildClarificationsMarkdown(debate);
  
  return { problem, finalSolution, clarificationsMarkdown };
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
  if (result.status !== 'fulfilled') {
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
        const { problem, finalSolution, clarificationsMarkdown } = loadAndValidateDebateState(options.debate);

        const inputs = { problem, clarificationsMarkdown, finalSolution };

        // Run all in parallel
        const results = await Promise.allSettled(evaluators.map((e) => e.evaluate(inputs)));

        const perAgentParsed: Record<string, ParsedEvaluation> = {};
        const arrFc: number[] = [];
        const arrPerf: number[] = [];
        const arrSec: number[] = [];
        const arrMaint: number[] = [];
        const arrReg: number[] = [];
        const arrTest: number[] = [];
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
          pushIfValid(arrOverall, overallSummary.overall_score, 'overall_summary.overall_score', agentId);
        });

        const agg: AggregatedAverages = {
          functional_completeness: averageOrNull(arrFc),
          performance_scalability: averageOrNull(arrPerf),
          security: averageOrNull(arrSec),
          maintainability_evolvability: averageOrNull(arrMaint),
          regulatory_compliance: averageOrNull(arrReg),
          testability: averageOrNull(arrTest),
          overall_score: averageOrNull(arrOverall),
        };

        await writeEvaluationResults(agg, perAgentParsed, options.output);
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        writeStderr((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}


