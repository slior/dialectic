import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
// Optional chalk import to avoid ESM issues under Jest
let chalk: any;
try { chalk = require('chalk'); } catch { chalk = null; }
function color(method: string, msg: string) { return chalk && chalk[method] ? chalk[method](msg) : msg; }
import { EXIT_CONFIG_ERROR, EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../../utils/exit-codes';
import { SystemConfig } from '../../types/config.types';
import { AgentConfig } from '../../types/agent.types';
import { DebateConfig, DebateResult } from '../../types/debate.types';
import { OpenAIProvider } from '../../providers/openai-provider';
import { ArchitectAgent } from '../../agents/architect-agent';
import { PerformanceAgent } from '../../agents/performance-agent';
import { JudgeAgent } from '../../core/judge';
import { StateManager } from '../../core/state-manager';
import { DebateOrchestrator } from '../../core/orchestrator';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'debate-config.json');

function builtInDefaults(): SystemConfig {
  const defaultAgents: AgentConfig[] = [
    { id: 'agent-architect', name: 'System Architect', role: 'architect', model: 'gpt-4', provider: 'openai', temperature: 0.5, enabled: true },
    { id: 'agent-performance', name: 'Performance Engineer', role: 'performance', model: 'gpt-4', provider: 'openai', temperature: 0.5, enabled: true },
  ];
  const judge: AgentConfig = { id: 'judge-main', name: 'Technical Judge', role: 'generalist', model: 'gpt-4', provider: 'openai', temperature: 0.3 } as any;
  const debate: DebateConfig = { rounds: 3, terminationCondition: { type: 'fixed' }, synthesisMethod: 'judge', includeFullHistory: true, timeoutPerRound: 300000 };
  return { agents: defaultAgents, judge, debate } as SystemConfig;
}

export async function loadConfig(configPath?: string): Promise<SystemConfig> {
  const finalPath = configPath ? path.resolve(process.cwd(), configPath) : DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(finalPath)) {
    process.stderr.write(color('yellow', `Config not found at ${finalPath}. Using built-in defaults.`) + '\n');
    return builtInDefaults();
  }
  const raw = await fs.promises.readFile(finalPath, 'utf-8');
  const parsed = JSON.parse(raw);
  // Ensure shape minimal
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    process.stderr.write(color('yellow', 'Config missing agents. Using built-in defaults.') + '\n');
    return builtInDefaults();
  }
  if (!parsed.judge) {
    process.stderr.write(color('yellow', 'Config missing judge. Using default judge.') + '\n');
    parsed.judge = builtInDefaults().judge;
  }
  if (!parsed.debate) {
    parsed.debate = builtInDefaults().debate;
  }
  return parsed as SystemConfig;
}

function buildAgents(agentConfigs: AgentConfig[], provider: OpenAIProvider) {
  return agentConfigs.map((cfg) => {
    if (cfg.role === 'architect') return new ArchitectAgent(cfg, provider);
    if (cfg.role === 'performance') return new PerformanceAgent(cfg, provider);
    // Default to architect for unknown roles in Flow 1
    return new ArchitectAgent(cfg, provider);
  });
}

export function debateCommand(program: Command) {
  program
    .command('debate')
    .argument('<problem>', 'Problem statement to debate')
    .option('-a, --agents <roles>', 'Comma-separated agent roles (architect,performance,...)')
    .option('-r, --rounds <number>', 'Number of rounds (default 3)')
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
        const debateCfg: DebateConfig = {
          ...sysConfig.debate!,
          rounds: options.rounds ? parseInt(options.rounds, 10) : (sysConfig.debate?.rounds ?? 3),
        } as DebateConfig;
        if (!debateCfg.rounds || debateCfg.rounds < 1) {
          const err: any = new Error('Invalid arguments: --rounds must be >= 1');
          err.code = EXIT_INVALID_ARGS;
          throw err;
        }

        let agentConfigs = sysConfig.agents.filter((a) => a.enabled !== false);
        if (options.agents) {
          const roles = String(options.agents).split(',').map((r: string) => r.trim());
          agentConfigs = agentConfigs.filter((a) => roles.includes(a.role));
        }
        if (agentConfigs.length === 0) {
          process.stderr.write(color('yellow', 'No agents selected; defaulting to architect,performance.') + '\n');
          const defaults = builtInDefaults();
          agentConfigs = defaults.agents;
        }

        const provider = new OpenAIProvider(apiKey);
        const agents = buildAgents(agentConfigs, provider);
        const judge = new JudgeAgent(sysConfig.judge!, provider);
        const stateManager = new StateManager();
        const orchestrator = new DebateOrchestrator(agents as any, judge, stateManager, debateCfg);

        const result: DebateResult = await orchestrator.runDebate(problem);

        // Persist path notice (StateManager already persisted during run)
        process.stderr.write(color('gray', `Saved debate to ./debates/${result.debateId}.json`) + '\n');

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
      } catch (err: any) {
        const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
        process.stderr.write((err?.message || 'Unknown error') + '\n');
        // Rethrow for runCli catch to set process exit when direct run
        throw Object.assign(new Error(err?.message || 'Unknown error'), { code });
      }
    });
}
