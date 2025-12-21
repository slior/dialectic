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
} from '@dialectic/core';

// Default configuration constants
const DEFAULT_ROUNDS = 3;
const DEFAULT_LLM_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_AGENT_TEMPERATURE = 0.5;
const DEFAULT_JUDGE_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_PER_ROUND = 300000;
const DEFAULT_MAX_CLARIFICATIONS_PER_AGENT = 5;

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
}

/**
 * Service that manages debate orchestration for the web API.
 * Uses @dialectic/core for the actual debate logic.
 */
@Injectable()
export class DebateService {
  private stateManager: StateManager;

  constructor() {
    this.stateManager = new StateManager();
  }

  /**
   * Returns the default system configuration for debates.
   */
  getDefaultConfig(): { agents: AgentConfig[]; judge: AgentConfig; debate: DebateConfig } {
    const defaultAgents: AgentConfig[] = [
      {
        id: 'agent-architect',
        name: 'System Architect',
        role: AGENT_ROLES.ARCHITECT,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
      {
        id: 'agent-performance',
        name: 'Performance Engineer',
        role: AGENT_ROLES.PERFORMANCE,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
      {
        id: 'agent-kiss',
        name: 'Simplicity Advocate',
        role: AGENT_ROLES.KISS,
        model: DEFAULT_LLM_MODEL,
        provider: LLM_PROVIDERS.OPENROUTER,
        temperature: DEFAULT_AGENT_TEMPERATURE,
        enabled: true,
      },
    ];

    const judge: AgentConfig = {
      id: 'judge-main',
      name: 'Technical Judge',
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
        threshold: 5000,
        maxLength: 2500,
        method: 'length-based',
      },
    };

    return { agents: defaultAgents, judge, debate };
  }

  /**
   * Collects clarifying questions from all agents.
   */
  async collectClarifications(problem: string): Promise<AgentClarifications[]> {
    const config = this.getDefaultConfig();
    const agents = this.buildAgents(config.agents, config.debate.summarization!);
    
    return await collectClarifications(
      problem,
      agents,
      DEFAULT_MAX_CLARIFICATIONS_PER_AGENT,
      (msg) => console.warn(msg)
    );
  }

  /**
   * Runs a full debate with the given problem and optional clarifications.
   */
  async runDebate(
    problem: string,
    hooks?: OrchestratorHooks,
    clarifications?: AgentClarifications[],
    rounds?: number
  ): Promise<DebateResult> {
    const config = this.getDefaultConfig();
    
    // Override rounds if provided
    const debateConfig: DebateConfig = {
      ...config.debate,
      rounds: rounds ?? config.debate.rounds,
    };
    
    const agents = this.buildAgents(config.agents, debateConfig.summarization!);
    const judge = this.buildJudge(config.judge, debateConfig.summarization!);

    const orchestrator = new DebateOrchestrator(
      agents,
      judge,
      this.stateManager,
      debateConfig,
      hooks
    );

    return await orchestrator.runDebate(problem, undefined, clarifications);
  }

  /**
   * Builds agent instances from configurations.
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
   */
  getAgentConfigs(): AgentConfig[] {
    return this.getDefaultConfig().agents;
  }

  /**
   * Returns the judge configuration (for UI display).
   */
  getJudgeConfig(): AgentConfig {
    return this.getDefaultConfig().judge;
  }
}

