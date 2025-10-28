import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { writeStderr } from '../index';
import { loadEnvironmentFile } from '../../utils/env-loader';
import { EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { EvaluatorConfig, ParsedEvaluation, AggregatedJsonOutput, clampScoreToRange, round2, isEnabledEvaluator } from '../../types/eval.types';
import { DebateState } from '../../types/debate.types';
import { EvaluatorAgent } from '../../eval/evaluator-agent';
import { resolvePrompt } from '../../utils/prompt-loader';
import { PROMPT_SOURCES } from '../../types/agent.types';

const FILE_ENCODING_UTF8 = 'utf-8';
const JSON_INDENT_SPACES = 2;

function createValidationError(message: string, code: number) {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

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

function readBuiltInPrompt(relFromThisFile: string, fallbackText: string): string {
  try {
    return fs.readFileSync(path.resolve(__dirname, relFromThisFile), FILE_ENCODING_UTF8);
  } catch (_e1) {
    try {
      // Secondary attempt relative to project root (useful under ts-jest)
      const alt = relFromThisFile.replace(/^\.\.\//, 'src/');
      return fs.readFileSync(path.resolve(process.cwd(), alt), FILE_ENCODING_UTF8);
    } catch (_e2) {
      return fallbackText;
    }
  }
}

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

function parseFirstJsonObject(text: string): any | null {
  const match = text.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : text;
  try { return JSON.parse(json); } catch { return null; }
}

function numOrUndefined(x: any): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

function pushIfValid(arr: number[], v: any, warnLabel: string, agentId: string) {
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

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return round2(sum / values.length);
}

function renderMarkdownTable(agg: { fc: number | null; perf: number | null; sec: number | null; maint: number | null; reg: number | null; test: number | null; overall: number | null; }): string {
  const f = (v: number | null) => v == null ? 'N/A' : v.toFixed(2);
  let table = '';
  table += `| Functional Completeness | Performance & Scalability | Security | Maintainability & Evolvability | Regulatory Compliance | Testability | Overall Score |\n`;
  table += `|------------------------|---------------------------|----------|-------------------------------|------------------------|------------|---------------|\n`;
  table += `| ${f(agg.fc)} | ${f(agg.perf)} | ${f(agg.sec)} | ${f(agg.maint)} | ${f(agg.reg)} | ${f(agg.test)} | ${f(agg.overall)} |\n`;
  return table;
}

function loadEvaluatorConfig(configPath: string): { agents: EvaluatorConfig[]; configDir: string } {
  const abs = path.resolve(process.cwd(), configPath);
  const cfg = readJsonFile<any>(configPath);
  if (!cfg || !Array.isArray(cfg.agents) || cfg.agents.length === 0) {
    throw createValidationError('Invalid evaluator config: agents array required (length >= 1)', EXIT_INVALID_ARGS);
  }
  const configDir = path.dirname(abs);
  const agents: EvaluatorConfig[] = cfg.agents.map((a: any) => ({
    id: String(a.id),
    name: String(a.name),
    model: String(a.model),
    provider: a.provider,
    systemPromptPath: a.systemPromptPath,
    userPromptPath: a.userPromptPath,
    timeout: a.timeout,
    enabled: a.enabled,
  }));
  return { agents, configDir };
}

export function evalCommand(program: Command) {
  program
    .command('eval')
    .requiredOption('-c, --config <path>', 'Path to evaluator configuration JSON')
    .requiredOption('-d, --debate <path>', 'Path to debate JSON file (DebateState)')
    .option('--env-file <path>', 'Path to .env file')
    .option('-v, --verbose', 'Verbose diagnostics')
    .option('-o, --output <path>', 'Output destination (json => aggregated JSON; otherwise Markdown)')
    .description('Evaluate a completed debate using evaluator agents')
    .action(async (options: any) => {
      try {
        // env
        loadEnvironmentFile(options.envFile, options.verbose);

        const { agents: rawAgents, configDir } = loadEvaluatorConfig(options.config);
        const enabledAgents = rawAgents.filter(isEnabledEvaluator);
        if (enabledAgents.length === 0) {
          throw createValidationError('No enabled evaluator agents found in config', EXIT_INVALID_ARGS);
        }

        const debate: DebateState = readJsonFile<DebateState>(options.debate);
        const problem = (debate.problem || '').trim();
        const finalSolution = (debate.finalSolution && debate.finalSolution.description || '').trim();
        if (!problem) throw createValidationError('Invalid debate JSON: missing non-empty problem', EXIT_INVALID_ARGS);
        if (!finalSolution) throw createValidationError('Invalid debate JSON: missing non-empty finalSolution.description', EXIT_INVALID_ARGS);

        const clarMd = buildClarificationsMarkdown(debate);

        // Resolve prompts and build agents
        const sysDefault = readBuiltInPrompt(
          '../../eval/prompts/system.md',
          'You are an expert software design evaluator. Output ONLY a single JSON object as specified.'
        );
        const userDefault = readBuiltInPrompt(
          '../../eval/prompts/user.md',
          '{ "evaluation": {}, "overall_summary": { "overall_score": 5 } }'
        );

        const evaluators = enabledAgents.map((cfg) => {
          // Resolve system prompt
          const sysRes = resolvePrompt({ label: cfg.name, configDir, ...(cfg.systemPromptPath !== undefined && { promptPath: cfg.systemPromptPath }), defaultText: sysDefault });
          const userRes = resolvePrompt({ label: `${cfg.name} (user)`, configDir, ...(cfg.userPromptPath !== undefined && { promptPath: cfg.userPromptPath }), defaultText: userDefault });
          if (options.verbose) {
            const sysSrc = sysRes.source === PROMPT_SOURCES.FILE ? sysRes.absPath : 'built-in default';
            const usrSrc = userRes.source === PROMPT_SOURCES.FILE ? userRes.absPath : 'built-in default';
            writeStderr(`[${cfg.id}] provider=${cfg.provider} model=${cfg.model} systemPrompt=${sysSrc} userPrompt=${usrSrc}\n`);
          }
          return EvaluatorAgent.fromConfig(cfg, sysRes.text, userRes.text);
        });

        // Inputs
        const inputs = { problem, clarificationsMarkdown: clarMd, finalSolution };

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
          if (res.status !== 'fulfilled') {
            writeStderr(`[${agentId}] Skipped due to error\n`);
            return;
          }
          const rawText = res.value.rawText || '';
          const parsed = parseFirstJsonObject(rawText);
          if (!parsed) {
            writeStderr(`[${agentId}] Invalid JSON output; skipping agent\n`);
            return;
          }
          perAgentParsed[agentId] = parsed as ParsedEvaluation;

          const evalObj = (parsed as any).evaluation || {};
          const func = evalObj.functional_completeness || {};
          const nonf = evalObj.non_functional || {};
          const overallSummary = (parsed as any).overall_summary || {};

          pushIfValid(arrFc, func.score, 'functional_completeness.score', agentId);
          pushIfValid(arrPerf, nonf.performance_scalability?.score, 'non_functional.performance_scalability.score', agentId);
          pushIfValid(arrSec, nonf.security?.score, 'non_functional.security.score', agentId);
          pushIfValid(arrMaint, nonf.maintainability_evolvability?.score, 'non_functional.maintainability_evolvability.score', agentId);
          pushIfValid(arrReg, nonf.regulatory_compliance?.score, 'non_functional.regulatory_compliance.score', agentId);
          pushIfValid(arrTest, nonf.testability?.score, 'non_functional.testability.score', agentId);
          pushIfValid(arrOverall, overallSummary.overall_score, 'overall_summary.overall_score', agentId);
        });

        const agg = {
          fc: averageOrNull(arrFc),
          perf: averageOrNull(arrPerf),
          sec: averageOrNull(arrSec),
          maint: averageOrNull(arrMaint),
          reg: averageOrNull(arrReg),
          test: averageOrNull(arrTest),
          overall: averageOrNull(arrOverall),
        };

        const outPath: string | undefined = options.output ? path.resolve(process.cwd(), options.output) : undefined;
        if (outPath && outPath.toLowerCase().endsWith('.json')) {
          const jsonOut: AggregatedJsonOutput = {
            evaluation: {
              functional_completeness: { average_score: agg.fc },
              non_functional: {
                performance_scalability: { average_score: agg.perf },
                security: { average_score: agg.sec },
                maintainability_evolvability: { average_score: agg.maint },
                regulatory_compliance: { average_score: agg.reg },
                testability: { average_score: agg.test },
              },
            },
            overall_score: agg.overall,
            agents: perAgentParsed,
          };
          await fs.promises.writeFile(outPath, JSON.stringify(jsonOut, null, JSON_INDENT_SPACES), FILE_ENCODING_UTF8);
        } else {
          const md = renderMarkdownTable(agg);
          if (outPath) {
            await fs.promises.writeFile(outPath, md, FILE_ENCODING_UTF8);
          } else {
            process.stdout.write(md + '\n');
          }
        }
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        writeStderr((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}


