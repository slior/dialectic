import {
  WebSocketGateway, SubscribeMessage, MessageBody,
  ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import {
  AgentClarifications, DebateResult, ContributionType, Contribution,
  CONTRIBUTION_TYPES, AgentConfig, AgentRole, LLM_PROVIDERS,
  logInfo, logSuccess, logWarning,
} from 'dialectic-core';
import { Socket } from 'socket.io';

import { getCorsOrigins } from '../utils/cors';

import { DebateService, OrchestratorHooks } from './debate.service';

/**
 * Agent configuration input from client (matches AgentConfigInput from UI).
 */
export interface AgentConfigInput {
  id: string;
  name: string;
  role: string;
  model: string;
  provider: string;
  temperature: number;
}

/**
 * DTO for starting a debate via WebSocket.
 */
export interface StartDebateDto {
  problem: string;
  clarificationsEnabled: boolean;
  rounds?: number;
  agents: AgentConfigInput[]; // Required field - no fallback to defaults
}

/**
 * DTO for submitting clarification answers via WebSocket.
 */
interface SubmitClarificationsDto {
  answers: Record<string, string>;
}

/**
 * Formatted contribution for WebSocket transmission.
 */
interface FormattedContribution {
  agentId: string;
  agentRole: string;
  type: ContributionType;
  content: string;
  targetAgentId?: string;
}

/**
 * Formatted round for WebSocket transmission.
 */
interface FormattedRound {
  roundNumber: number;
  contributions: FormattedContribution[];
}

/**
 * Formatted debate result for WebSocket transmission.
 */
interface FormattedDebateResult {
  debateId: string;
  solution: DebateResult['solution'];
  rounds: FormattedRound[];
  metadata: DebateResult['metadata'];
}

// Configuration constants
const DEFAULT_ROUNDS = 3;
const MIN_ROUNDS = 1;
const DEFAULT_MISSING_ANSWER = 'NA';

// CORS configuration
const CORS_ORIGINS = getCorsOrigins();

// WebSocket event names
const WS_EVENTS = {
  CONNECTION_ESTABLISHED: 'connectionEstablished',
  DEBATE_STARTED: 'debateStarted',
  DEBATE_COMPLETE: 'debateComplete',
  DEBATE_CANCELLED: 'debateCancelled',
  COLLECTING_CLARIFICATIONS: 'collectingClarifications',
  CLARIFICATIONS_REQUIRED: 'clarificationsRequired',
  CLARIFICATIONS_SUBMITTED: 'clarificationsSubmitted',
  ROUND_START: 'roundStart',
  PHASE_START: 'phaseStart',
  PHASE_COMPLETE: 'phaseComplete',
  AGENT_START: 'agentStart',
  AGENT_COMPLETE: 'agentComplete',
  SYNTHESIS_START: 'synthesisStart',
  SYNTHESIS_COMPLETE: 'synthesisComplete',
  SUMMARIZATION_START: 'summarizationStart',
  SUMMARIZATION_COMPLETE: 'summarizationComplete',
  SUMMARIZATION_END: 'summarizationEnd',
  CONTRIBUTION_CREATED: 'contributionCreated',
  ERROR: 'error',
  WARNING: 'warning',
} as const;

// Error messages
const ERROR_MESSAGES = {
  DEBATE_IN_PROGRESS: 'A debate is already in progress',
  PROBLEM_REQUIRED: 'Problem description is required',
  INVALID_ROUNDS: 'Number of rounds must be >= 1',
  NO_DEBATE_IN_PROGRESS: 'No debate in progress',
  DEBATE_FAILED: 'Debate failed',
  NO_AGENTS_CONFIGURED: 'No agents configured',
  INVALID_AGENTS: 'Invalid agent configuration',
  AGENT_ID_REQUIRED: 'All agents must have a non-empty ID',
  AGENT_NAME_REQUIRED: 'All agents must have a non-empty name',
  AGENT_ROLE_REQUIRED: 'All agents must have a role',
  AGENT_MODEL_REQUIRED: 'All agents must have a model',
  AGENT_PROVIDER_REQUIRED: 'All agents must have a provider',
  DUPLICATE_AGENT_ID: (id: string) => `Duplicate agent ID: ${id}`,
  DUPLICATE_AGENT_NAME: (name: string) => `Duplicate agent name: ${name}`,
  TEMPERATURE_OUT_OF_RANGE: (min: number, max: number) => `Temperature must be between ${min} and ${max}`,
  MIN_AGENTS_REQUIRED: (min: number) => `At least ${min} agent is required`,
  MAX_AGENTS_EXCEEDED: (max: number) => `Maximum ${max} agents allowed`,
  CLARIFICATIONS_COLLECTION_FAILED: (message: string) => `Failed to collect clarifications: ${message}`,
} as const;

// Log messages
const LOG_MESSAGES = {
  DEBATE_STARTED: 'Debate started',
  DEBATE_COMPLETED: 'Debate completed',
  CLIENT_CONNECTED: (id: string) => `Client connected: ${id}`,
  CLIENT_DISCONNECTED: (id: string) => `Client disconnected: ${id}`,
  ROUND_STARTING: (round: number, total: number) => `Round ${round}/${total} starting`,
} as const;

// Agent validation constants
const MIN_AGENTS = 1;
const MAX_AGENTS = 8;
const MIN_TEMPERATURE = 0.0;
const MAX_TEMPERATURE = 1.0;

/**
 * WebSocket gateway for real-time debate communication.
 * Handles debate lifecycle, clarifications, and progress events.
 */
@WebSocketGateway({
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
})
export class DebateGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private debateInProgress = false;
  private currentProblem = '';
  private pendingClarifications: AgentClarifications[] = [];
  private connectedClients: Set<string> = new Set();
  private currentRound = 0;
  private totalRounds = 0;
  private configuredRounds = DEFAULT_ROUNDS;
  private configuredAgents: AgentConfig[] | null = null;

  constructor(private readonly debateService: DebateService) {}

  /**
   * Handles new WebSocket client connections.
   * Sends current debate state to the newly connected client.
   *
   * @param client - The connected WebSocket client socket.
   */
  handleConnection(client: Socket): void {
    this.connectedClients.add(client.id);
    const message = LOG_MESSAGES.CLIENT_CONNECTED(client.id);
    logInfo(message);
    
    // Send current state to newly connected client
    client.emit(WS_EVENTS.CONNECTION_ESTABLISHED, {
      debateInProgress: this.debateInProgress,
      agents: this.debateService.getAgentConfigs(),
      judge: this.debateService.getJudgeConfig(),
    });
  }

  /**
   * Handles WebSocket client disconnections.
   *
   * @param client - The disconnected WebSocket client socket.
   */
  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    const message = LOG_MESSAGES.CLIENT_DISCONNECTED(client.id);
    logInfo(message);
  }

  /**
   * Converts AgentConfigInput[] to AgentConfig[] (adds enabled field and validates role).
   *
   * @param inputs - Array of agent configuration inputs from client.
   * @returns Array of agent configurations compatible with core.
   */
  private convertToAgentConfig(inputs: AgentConfigInput[]): AgentConfig[] {
    return inputs.map(input => ({
      id: input.id,
      name: input.name,
      role: input.role as AgentRole, // Client sends string, cast to AgentRole
      model: input.model,
      provider: input.provider as typeof LLM_PROVIDERS.OPENAI | typeof LLM_PROVIDERS.OPENROUTER, // Cast to valid provider type
      temperature: input.temperature,
      enabled: true, // Ensure enabled is set
    }));
  }

  /**
   * Validates that a string property is non-empty after trimming.
   *
   * @param value - The string value to validate.
   * @param errorMessage - The error message to return if validation fails.
   * @returns Error message if invalid, undefined if valid.
   */
  private validateNonEmptyString(value: string | undefined, errorMessage: string): string | undefined {
    if (!value || !value.trim()) {
      return errorMessage;
    }
    return undefined;
  }

  /**
   * Validates agent property values (id, name, role, model, provider, temperature).
   *
   * @param agent - The agent configuration to validate.
   * @returns Error message if invalid, undefined if valid.
   */
  private validateAgentProperties(agent: AgentConfigInput): string | undefined {
    const idError = this.validateNonEmptyString(agent.id, ERROR_MESSAGES.AGENT_ID_REQUIRED);
    if (idError) {
      return idError;
    }

    const nameError = this.validateNonEmptyString(agent.name, ERROR_MESSAGES.AGENT_NAME_REQUIRED);
    if (nameError) {
      return nameError;
    }

    if (!agent.role) {
      return ERROR_MESSAGES.AGENT_ROLE_REQUIRED;
    }

    const modelError = this.validateNonEmptyString(agent.model, ERROR_MESSAGES.AGENT_MODEL_REQUIRED);
    if (modelError) {
      return modelError;
    }

    if (!agent.provider) {
      return ERROR_MESSAGES.AGENT_PROVIDER_REQUIRED;
    }
    if (isNaN(agent.temperature) || agent.temperature < MIN_TEMPERATURE || agent.temperature > MAX_TEMPERATURE) {
      return ERROR_MESSAGES.TEMPERATURE_OUT_OF_RANGE(MIN_TEMPERATURE, MAX_TEMPERATURE);
    }

    return undefined;
  }

  /**
   * Validates that agent ID and name are not duplicates of existing agents.
   *
   * @param agent - The agent configuration to validate.
   * @param ids - Set of existing agent IDs to check for duplicates.
   * @param names - Set of existing agent names to check for duplicates.
   * @returns Error message if duplicate found, undefined if valid.
   */
  private validateNonDuplicateIDAndName(agent: AgentConfigInput, ids: Set<string>, names: Set<string>): string | undefined {
    if (ids.has(agent.id)) {
      return ERROR_MESSAGES.DUPLICATE_AGENT_ID(agent.id);
    }
    if (names.has(agent.name)) {
      return ERROR_MESSAGES.DUPLICATE_AGENT_NAME(agent.name);
    }
    return undefined;
  }

  /**
   * Validates a single agent configuration and checks for duplicate IDs/names.
   *
   * @param agent - The agent configuration to validate.
   * @param ids - Set of existing agent IDs to check for duplicates.
   * @param names - Set of existing agent names to check for duplicates.
   * @returns Error message if invalid, undefined if valid.
   */
  private validateSingleAgent(agent: AgentConfigInput, ids: Set<string>, names: Set<string>): string | undefined {
    const propertyError = this.validateAgentProperties(agent);
    if (propertyError) {
      return propertyError;
    }

    const duplicateError = this.validateNonDuplicateIDAndName(agent, ids, names);
    if (duplicateError) {
      return duplicateError;
    }

    ids.add(agent.id);
    names.add(agent.name);
    return undefined;
  }

  /**
   * Validates agent configuration array.
   *
   * @param agents - Array of agent configurations to validate.
   * @returns Error message if invalid, undefined if valid.
   */
  private validateAgents(agents: AgentConfigInput[]): string | undefined {
    if (!agents || agents.length === 0) {
      return ERROR_MESSAGES.NO_AGENTS_CONFIGURED;
    }

    if (agents.length < MIN_AGENTS) {
      return ERROR_MESSAGES.MIN_AGENTS_REQUIRED(MIN_AGENTS);
    }

    if (agents.length > MAX_AGENTS) {
      return ERROR_MESSAGES.MAX_AGENTS_EXCEEDED(MAX_AGENTS);
    }

    // Check for unique IDs and names
    const ids = new Set<string>();
    const names = new Set<string>();

    for (const agent of agents) {
      const validationError = this.validateSingleAgent(agent, ids, names);
      if (validationError) {
        return validationError;
      }
    }

    return undefined;
  }

  /**
   * Validates debate parameters (problem and rounds) and emits errors to client if validation fails.
   *
   * @param problem - The problem description to validate.
   * @param rounds - Optional number of rounds to validate.
   * @param client - The WebSocket client socket to emit errors to.
   * @returns True if validation passed, false if validation failed (error emitted to client).
   */
  private validateDebateParameters(problem: string | undefined, rounds: number | undefined, client: Socket): boolean {
    if (!problem || problem.trim().length === 0) {
      this.emitError(client, ERROR_MESSAGES.PROBLEM_REQUIRED);
      return false;
    }

    const validatedRounds = rounds ?? DEFAULT_ROUNDS;
    if (validatedRounds < MIN_ROUNDS) {
      this.emitError(client, ERROR_MESSAGES.INVALID_ROUNDS);
      return false;
    }

    return true;
  }

  /**
   * Validates agents for debate start and emits errors to client if validation fails.
   *
   * @param agents - Array of agent configurations to validate, or undefined.
   * @param client - The WebSocket client socket to emit errors to.
   * @returns True if validation passed, false if validation failed (error emitted to client).
   */
  private validateAgentsForDebateStart(agents: AgentConfigInput[] | undefined, client: Socket): boolean {
    if (!agents || agents.length === 0) {
      this.emitError(client, ERROR_MESSAGES.NO_AGENTS_CONFIGURED);
      return false;
    }

    const agentValidationError = this.validateAgents(agents);
    if (agentValidationError) {
      this.emitError(client, agentValidationError);
      return false;
    }

    return true;
  }

  /**
   * Handles the startDebate WebSocket message.
   * Validates input, collects clarifications if enabled, and starts the debate.
   *
   * @param dto - The debate start request data.
   * @param client - The WebSocket client socket.
   */
  @SubscribeMessage('startDebate')
  async handleStartDebate(@MessageBody() dto: StartDebateDto, @ConnectedSocket() client: Socket): Promise<void> {
    if (this.debateInProgress) {
      this.emitError(client, ERROR_MESSAGES.DEBATE_IN_PROGRESS);
      return;
    }

    if (!this.validateDebateParameters(dto.problem, dto.rounds, client)) {
      return;
    }

    const rounds = dto.rounds ?? DEFAULT_ROUNDS;

    if (!this.validateAgentsForDebateStart(dto.agents, client)) {
      return;
    }

    // Store agents for use in collectClarifications and runDebate
    this.configuredAgents = this.convertToAgentConfig(dto.agents);

    this.debateInProgress = true;
    this.currentProblem = dto.problem.trim();
    this.configuredRounds = rounds;
    
    const startMessage = LOG_MESSAGES.DEBATE_STARTED;
    logInfo(startMessage);
    client.emit(WS_EVENTS.DEBATE_STARTED, { problem: this.currentProblem });

    // If clarifications enabled, collect questions first
    if (dto.clarificationsEnabled) {
      try {
        client.emit(WS_EVENTS.COLLECTING_CLARIFICATIONS);
        if (!this.configuredAgents) {
          this.emitError(client, ERROR_MESSAGES.NO_AGENTS_CONFIGURED);
          return;
        }
        const questions = await this.debateService.collectClarifications(this.currentProblem, this.configuredAgents);
        this.pendingClarifications = questions;
        
        if (questions.some(q => q.items.length > 0)) {
          client.emit(WS_EVENTS.CLARIFICATIONS_REQUIRED, { questions });
          return; // Wait for submitClarifications event
        }
        // No questions generated, proceed with debate
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const warningMessage = ERROR_MESSAGES.CLARIFICATIONS_COLLECTION_FAILED(errorMessage);
        logWarning(warningMessage);
        client.emit(WS_EVENTS.WARNING, { message: warningMessage });
        // Continue with debate without clarifications
      }
    }

    // Run debate without clarifications
    await this.runDebate(client, undefined, rounds);
  }

  /**
   * Handles the submitClarifications WebSocket message.
   * Maps user answers to clarifications and starts the debate.
   *
   * @param dto - The clarification answers data.
   * @param client - The WebSocket client socket.
   */
  @SubscribeMessage('submitClarifications')
  async handleSubmitClarifications(@MessageBody() dto: SubmitClarificationsDto, @ConnectedSocket() client: Socket): Promise<void> {
    if (!this.debateInProgress) {
      this.emitError(client, ERROR_MESSAGES.NO_DEBATE_IN_PROGRESS);
      return;
    }

    // Map answers to clarifications structure
    const clarificationsWithAnswers = this.mapAnswersToClarifications(dto.answers);
    
    client.emit(WS_EVENTS.CLARIFICATIONS_SUBMITTED);
    
    // Run debate with clarifications (use stored rounds and agents from handleStartDebate)
    await this.runDebate(client, clarificationsWithAnswers, this.configuredRounds);
  }

  /**
   * Handles the cancelDebate WebSocket message.
   * Resets debate state and notifies the client.
   *
   * @param client - The WebSocket client socket.
   */
  @SubscribeMessage('cancelDebate')
  handleCancelDebate(@ConnectedSocket() client: Socket): void {
    if (this.debateInProgress) {
      this.resetDebateState();
      client.emit(WS_EVENTS.DEBATE_CANCELLED);
    }
  }

  /**
   * Maps user answers to the clarifications structure.
   *
   * @param answers - Record mapping clarification item IDs to user-provided answers.
   * @returns Array of agent clarifications with answers populated.
   */
  private mapAnswersToClarifications(answers: Record<string, string>): AgentClarifications[] {
    return this.pendingClarifications.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        answer: answers[item.id] || DEFAULT_MISSING_ANSWER,
      })),
    }));
  }

  /**
   * Runs the debate and emits progress events via WebSocket.
   *
   * @param client - The WebSocket client socket.
   * @param clarifications - Optional clarifications with answers.
   * @param rounds - Optional number of debate rounds (uses configured rounds if not provided).
   */
  private async runDebate(client: Socket, clarifications?: AgentClarifications[], rounds?: number): Promise<void> {
    if (!this.configuredAgents) {
      this.emitError(client, ERROR_MESSAGES.NO_AGENTS_CONFIGURED);
      return;
    }

    const hooks = this.createHooks(client, this.configuredAgents);

    try {
      const result = await this.debateService.runDebate(
        this.currentProblem,
        hooks,
        clarifications,
        rounds,
        this.configuredAgents
      );

      const completionMessage = LOG_MESSAGES.DEBATE_COMPLETED;
      logSuccess(completionMessage);
      client.emit(WS_EVENTS.DEBATE_COMPLETE, this.formatDebateResult(result));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullErrorMessage = `${ERROR_MESSAGES.DEBATE_FAILED}: ${errorMessage}`;
      logWarning(fullErrorMessage);
      this.emitError(client, fullErrorMessage);
    } finally {
      this.resetDebateState();
    }
  }

  /**
   * Creates orchestrator hooks that emit WebSocket events and log to console.
   *
   * @param client - The WebSocket client socket.
   * @param agents - The configured agents for agent name lookup.
   * @returns OrchestratorHooks implementation that emits events and logs progress.
   */
  private createHooks(client: Socket, agents: AgentConfig[]): OrchestratorHooks {
    return {
      onRoundStart: (round: number, total: number): void => {
        this.currentRound = round;
        this.totalRounds = total;
        const message = LOG_MESSAGES.ROUND_STARTING(round, total);
        logInfo(message);
        client.emit(WS_EVENTS.ROUND_START, { round, total });
      },
      onPhaseStart: (round: number, phase: ContributionType, count: number): void => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase starting`, round);
        logInfo(message);
        client.emit(WS_EVENTS.PHASE_START, { round, phase, expectedCount: count });
      },
      onAgentStart: (agentName: string, activity: string): void => {
        const message = this.formatMessageWithRound(`${agentName} is ${activity}...`, this.currentRound);
        logInfo(message);
        client.emit(WS_EVENTS.AGENT_START, { agentName, activity });
      },
      onAgentComplete: (agentName: string, activity: string): void => {
        const message = this.formatMessageWithRound(`${agentName} completed ${activity}`, this.currentRound);
        logSuccess(message);
        client.emit(WS_EVENTS.AGENT_COMPLETE, { agentName, activity });
      },
      onPhaseComplete: (round: number, phase: ContributionType): void => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase completed`, round);
        logSuccess(message);
        client.emit(WS_EVENTS.PHASE_COMPLETE, { round, phase });
      },
      onSynthesisStart: (): void => {
        const message = 'Synthesis starting';
        logInfo(message);
        client.emit(WS_EVENTS.SYNTHESIS_START);
      },
      onSynthesisComplete: (): void => {
        const message = 'Synthesis completed';
        logSuccess(message);
        client.emit(WS_EVENTS.SYNTHESIS_COMPLETE);
      },
      onSummarizationStart: (agentName: string): void => {
        const message = this.formatMessageWithRound(`${agentName} is summarizing context...`, this.currentRound);
        logInfo(message);
        client.emit(WS_EVENTS.SUMMARIZATION_START, { agentName });
      },
      onSummarizationComplete: (agentName: string, beforeChars: number, afterChars: number): void => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        client.emit(WS_EVENTS.SUMMARIZATION_COMPLETE, { agentName, beforeChars, afterChars });
      },
      onSummarizationEnd: (agentName: string): void => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        client.emit(WS_EVENTS.SUMMARIZATION_END, { agentName });
      },
      onContributionCreated: (contribution: Contribution, roundNumber: number): void => {
        // Look up agent name from configured agents (captured in closure)
        const agentConfig = agents.find(a => a.id === contribution.agentId);
        const agentName = agentConfig?.name || contribution.agentId;
        
        client.emit(WS_EVENTS.CONTRIBUTION_CREATED, {
          agentId: contribution.agentId,
          agentName: agentName,
          agentRole: contribution.agentRole,
          type: contribution.type,
          content: contribution.content,
          round: roundNumber,
          targetAgentId: contribution.targetAgentId,
        });
      },
    };
  }

  /**
   * Emits an error event to the client and logs a warning.
   *
   * @param client - The WebSocket client socket.
   * @param message - The error message to send.
   */
  private emitError(client: Socket, message: string): void {
    logWarning(message);
    client.emit(WS_EVENTS.ERROR, { message });
  }

  /**
   * Formats the debate result for client consumption.
   *
   * @param result - The debate result from the orchestrator.
   * @returns Formatted result object suitable for WebSocket transmission.
   */
  private formatDebateResult(result: DebateResult): FormattedDebateResult {
    return {
      debateId: result.debateId,
      solution: result.solution,
      rounds: result.rounds.map(round => ({
        roundNumber: round.roundNumber,
        contributions: round.contributions.map((c: Contribution) => ({
          agentId: c.agentId,
          agentRole: c.agentRole,
          type: c.type,
          content: c.content,
          targetAgentId: c.targetAgentId,
        })),
      })),
      metadata: result.metadata,
    };
  }

  /**
   * Resets the debate state after completion or cancellation.
   */
  private resetDebateState(): void {
    this.debateInProgress = false;
    this.currentProblem = '';
    this.pendingClarifications = [];
    this.currentRound = 0;
    this.totalRounds = 0;
    this.configuredRounds = DEFAULT_ROUNDS;
    this.configuredAgents = null;
  }

  /**
   * Maps contribution type to a human-readable phase label.
   *
   * @param phase - The contribution type to map.
   * @returns Human-readable label for the phase.
   */
  private getPhaseLabel(phase: ContributionType): string {
    const labels: Record<ContributionType, string> = {
      [CONTRIBUTION_TYPES.PROPOSAL]: 'Proposals',
      [CONTRIBUTION_TYPES.CRITIQUE]: 'Critiques',
      [CONTRIBUTION_TYPES.REFINEMENT]: 'Refinements',
    };
    return labels[phase];
  }

  /**
   * Formats a message with round prefix if inside an active round.
   *
   * @param message - The message to format.
   * @param round - The current round number (0 if not in a round).
   * @returns Formatted message with optional round prefix.
   */
  private formatMessageWithRound(message: string, round: number): string {
    if (round > 0) {
      return `[Round ${round}] ${message}`;
    }
    return message;
  }
}

