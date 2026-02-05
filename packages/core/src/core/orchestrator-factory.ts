import { Agent, AgentLogger } from './agent';
import { JudgeAgent } from './judge';
import { StateManager } from './state-manager';
import { DebateConfig, OrchestratorType, ORCHESTRATOR_TYPES } from '../types/debate.types';
import { TracingContext } from '../types/tracing.types';
import { OrchestratorHooks } from './orchestrator';
import { DebateOrchestrator } from './orchestrator';
import { StateMachineOrchestrator } from '../state-machine/state-machine-orchestrator';
import { writeStderr } from '../utils/console';

/**
 * Parameters for creating an orchestrator.
 */
export interface OrchestratorFactoryParams {
  agents: Agent[];
  judge: JudgeAgent;
  stateManager: StateManager;
  config: DebateConfig;
  hooks?: OrchestratorHooks | undefined;
  tracingContext?: TracingContext | undefined;
  contextDirectory?: string | undefined;
  /** Optional logger; when provided to StateMachineOrchestrator, transition logs are emitted at verbose level. */
  logger?: AgentLogger | undefined;
}

/**
 * Determines the orchestrator type from the explicit config property.
 * Only `orchestratorType` is used; when omitted, defaults to classic.
 *
 * @param config - The debate configuration
 * @returns The orchestrator type to use
 */
function determineOrchestratorType(config: DebateConfig): OrchestratorType {
  const type = config.orchestratorType ?? ORCHESTRATOR_TYPES.CLASSIC;
  writeStderr(`Orchestrator type: ${type}\n`);
  return type;
}

/** Orchestrator instance returned by createOrchestrator (classic or state-machine). */
export type ADebateOrchestrator = DebateOrchestrator | StateMachineOrchestrator;

/**
 * Type guard: true if the orchestrator is StateMachineOrchestrator (has suspend/resume).
 */
export function isStateMachineOrchestrator(orchestrator: ADebateOrchestrator): orchestrator is StateMachineOrchestrator {
  return orchestrator instanceof StateMachineOrchestrator;
}

/**
 * Creates an orchestrator instance based on the config's orchestratorType.
 * Emits the chosen type to stderr. Callers (e.g. CLI, Web API) set orchestratorType when
 * they need state-machine (e.g. for interactive clarifications or suspend/resume).
 *
 * @param params - Parameters for constructing the orchestrator
 * @returns An instance of DebateOrchestrator or StateMachineOrchestrator
 */
export function createOrchestrator(params: OrchestratorFactoryParams): ADebateOrchestrator {
  const { agents, judge, stateManager, config, hooks, tracingContext, contextDirectory, logger } = params;

  const orchestratorType = determineOrchestratorType(config);

  if (orchestratorType === ORCHESTRATOR_TYPES.CLASSIC) {
    return new DebateOrchestrator( agents, judge, stateManager, config, hooks, tracingContext, contextDirectory );
  } else { // Default to state-machine

    return new StateMachineOrchestrator( agents, judge, stateManager, config, hooks, tracingContext, contextDirectory, logger );
  }
}
