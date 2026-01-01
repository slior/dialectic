import { Injectable } from '@nestjs/common';
import {
  DebateOrchestrator,
  StateManager,
  JudgeAgent,
  RoleBasedAgent,
  Agent,
  AgentConfig,
  DebateConfig,
  SummarizationConfig,
  AgentClarifications,
  DebateResult,
  AGENT_ROLES,
  LLM_PROVIDERS,
  TERMINATION_TYPES,
  SYNTHESIS_METHODS,
  createProvider,
  collectClarifications,
  resolvePrompt,
  PROMPT_SOURCES,
  buildToolRegistry,
  ContributionType,
  Contribution,
  logWarning,
} from 'dialectic-core';

// Default configuration constants
const DEFAULT_ROUNDS = 3;
const DEFAULT_LLM_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_AGENT_TEMPERATURE = 0.5;
const DEFAULT_JUDGE_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_PER_ROUND = 300000;
const DEFAULT_MAX_CLARIFICATIONS_PER_AGENT = 5;

// Error messages
const ERROR_MESSAGES = {
  NO_AGENTS_CONFIGURED: 'No agents configured',
} as const;

// Summarization configuration constants
const DEFAULT_SUMMARIZATION_THRESHOLD = 5000;
const DEFAULT_SUMMARIZATION_MAX_LENGTH = 2500;
const DEFAULT_SUMMARIZATION_METHOD = 'length-based';

// Agent configuration constants
const AGENT_IDS = {
  ARCHITECT: 'agent-architect',
  PERFORMANCE: 'agent-performance',
  KISS: 'agent-kiss',
  JUDGE: 'judge-main',
} as const;

const AGENT_NAMES = {
  ARCHITECT: 'System Architect',
  PERFORMANCE: 'Performance Engineer',
  KISS: 'Simplicity Advocate',
  JUDGE: 'Technical Judge',
} as const;

/**
 * Orchestrator hooks interface for real-time progress notifications.
 */
export interface OrchestratorHooks {
  onRoundStart?: (roundNumber: number, totalRounds: number) => void;
  onPhaseStart?: (roundNumber: number, phase: ContributionType, expectedTaskCount: number) => void;
  onAgentStart?: (agentName: string, activity: string) => void;
  onAgentComplete?: (agentName: string, activity: string) => void;
  onPhaseComplete?: (roundNumber: number, phase: ContributionType) => void;
  onSynthesisStart?: () => void;
  onSynthesisComplete?: () => void;
  onSummarizationStart?: (agentName: string) => void;
  onSummarizationComplete?: (agentName: string, beforeChars: number, afterChars: number) => void;
  onSummarizationEnd?: (agentName: string) => void;
  onContributionCreated?: (contribution: Contribution, roundNumber: number) => void;
}

/**
 * Service that manages debate orchestration for the web API.
 * Uses dialectic-core for the actual debate logic.
 */
@Injectable()
export class DebateService {
  private stateManager: StateManager;

  constructor() {
    this.stateManager = new StateManager();
  }

  /**
   * Returns the default system configuration for debates.
   *
   * @returns Object containing default agent configurations, judge configuration, and debate configuration.
   */
  getDefaultConfig(): { agents: AgentConfig[]; judge: AgentConfig; debate: DebateConfig } {
    const defaultAgents: AgentConfig[] = [
      {
        id: AGENT_IDS.ARCHITECT,
        name: AGENT_NAMES.ARCHITECT,
        role: AGENT_ROLES.ARCHITECT,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
      {
        id: AGENT_IDS.PERFORMANCE,
        name: AGENT_NAMES.PERFORMANCE,
        role: AGENT_ROLES.PERFORMANCE,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
      {
        id: AGENT_IDS.KISS,
        name: AGENT_NAMES.KISS,
        role: AGENT_ROLES.KISS,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
    ];

    const judge: AgentConfig = {
      id: AGENT_IDS.JUDGE,
      name: AGENT_NAMES.JUDGE,
      role: AGENT_ROLES.GENERALIST,
      model: DEFAULT_LLM_MODEL,
      provider: LLM_PROVIDERS.OPENROUTER,
      temperature: DEFAULT_JUDGE_TEMPERATURE,
    };

    const debate: DebateConfig = {
      rounds: DEFAULT_ROUNDS,
      terminationCondition: { type: TERMINATION_TYPES.FIXED },
      synthesisMethod: SYNTHESIS_METHODS.JUDGE,
      includeFullHistory: true,
      timeoutPerRound: DEFAULT_TIMEOUT_PER_ROUND,
      summarization: {
        enabled: true,
        threshold: DEFAULT_SUMMARIZATION_THRESHOLD,
        maxLength: DEFAULT_SUMMARIZATION_MAX_LENGTH,
        method: DEFAULT_SUMMARIZATION_METHOD,
      },
    };

    return { agents: defaultAgents, judge, debate };
  }

  /**
   * Collects clarifying questions from all agents.
   *
   * @param problem - The problem statement to collect clarifications for.
   * @param agents - Array of agent configurations (required, no fallback).
   * @returns Promise resolving to an array of agent clarifications with questions.
   * @throws {Error} If agents array is empty or invalid.
   */
  async collectClarifications(problem: string, agents: AgentConfig[]): Promise<AgentClarifications[]> {
    if (!agents || agents.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_AGENTS_CONFIGURED);
    }

    const config = this.getDefaultConfig();
    if (!config.debate.summarization) {
      throw new Error('Summarization configuration is required');
    }
    const agentInstances = this.buildAgents(agents, config.debate.summarization);
    
    return await collectClarifications(
      problem,
      agentInstances,
      DEFAULT_MAX_CLARIFICATIONS_PER_AGENT,
      (msg) => logWarning(msg)
    );
  }

  /**
   * Runs a full debate with the given problem and optional clarifications.
   *
   * @param problem - The problem statement to debate.
   * @param hooks - Optional orchestrator hooks for progress notifications.
   * @param clarifications - Optional clarifications with answers from agents.
   * @param rounds - Optional number of debate rounds (overrides default if provided).
   * @param agents - Array of agent configurations (required, no fallback).
   * @returns Promise resolving to the debate result.
   * @throws {Error} If agents array is empty or invalid.
   */
  async runDebate(
    problem: string,
    hooks?: OrchestratorHooks,
    clarifications?: AgentClarifications[],
    rounds?: number,
    agents: AgentConfig[] = []
  ): Promise<DebateResult> {
    if (!agents || agents.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_AGENTS_CONFIGURED);
    }

    const config = this.getDefaultConfig();
    
    // Override rounds if provided
    const debateConfig: DebateConfig = {
      ...config.debate,
      rounds: rounds ?? config.debate.rounds,
    };
    
    // Use summarization from default config (always defined)
    const summarizationConfig = config.debate.summarization!;
    const agentInstances = this.buildAgents(agents, summarizationConfig);
    const judge = this.buildJudge(config.judge, summarizationConfig);

    const orchestrator = new DebateOrchestrator(
      agentInstances,
      judge,
      this.stateManager,
      debateConfig,
      hooks
    );

    return await orchestrator.runDebate(problem, undefined, clarifications);
  }

  /**
   * Builds agent instances from configurations.
   *
   * @param configs - Array of agent configurations to build.
   * @param summaryConfig - Summarization configuration for context management.
   * @returns Array of constructed agent instances.
   */
  private buildAgents(configs: AgentConfig[], summaryConfig: SummarizationConfig): Agent[] {
    return configs.map((cfg) => {
      const provider = createProvider(cfg.provider);
      const defaultSystemPrompt = RoleBasedAgent.defaultSystemPrompt(cfg.role);
      
      const systemPromptRes = resolvePrompt({
        label: cfg.name,
        configDir: process.cwd(),
        defaultText: defaultSystemPrompt,
      });

      const toolRegistry = buildToolRegistry(cfg);
      
      return RoleBasedAgent.create(
        cfg,
        provider,
        systemPromptRes.text,
        { source: PROMPT_SOURCES.BUILT_IN },
        summaryConfig,
        { source: PROMPT_SOURCES.BUILT_IN },
        '',
        toolRegistry
      );
    });
  }

  /**
   * Builds the judge agent from configuration.
   *
   * @param config - Judge agent configuration.
   * @param summaryConfig - Summarization configuration for context management.
   * @returns Constructed judge agent instance.
   */
  private buildJudge(config: AgentConfig, summaryConfig: SummarizationConfig): JudgeAgent {
    const provider = createProvider(config.provider);
    const defaultSystemPrompt = JudgeAgent.defaultSystemPrompt();
    
    const systemPromptRes = resolvePrompt({
      label: config.name,
      configDir: process.cwd(),
      defaultText: defaultSystemPrompt,
    });

    return new JudgeAgent(
      config,
      provider,
      systemPromptRes.text,
      { source: PROMPT_SOURCES.BUILT_IN },
      summaryConfig,
      { source: PROMPT_SOURCES.BUILT_IN }
    );
  }

  /**
   * Returns the agent configurations (for UI display).
   *
   * @returns Array of agent configurations.
   */
  getAgentConfigs(): AgentConfig[] {
    return this.getDefaultConfig().agents;
  }

  /**
   * Returns the judge configuration (for UI display).
   *
   * @returns Judge agent configuration.
   */
  getJudgeConfig(): AgentConfig {
    return this.getDefaultConfig().judge;
  }
}

