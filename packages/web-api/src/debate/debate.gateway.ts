import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { DebateService, OrchestratorHooks } from './debate.service';
import {
  AgentClarifications,
  DebateResult,
  ContributionType,
  Contribution,
  CONTRIBUTION_TYPES,
  logInfo,
  logSuccess,
  logWarning,
} from '@dialectic/core';

/**
 * DTO for starting a debate via WebSocket.
 */
interface StartDebateDto {
  problem: string;
  clarificationsEnabled: boolean;
  rounds?: number;
}

/**
 * DTO for submitting clarification answers via WebSocket.
 */
interface SubmitClarificationsDto {
  answers: Record<string, string>;
}

// Configuration constants
const DEFAULT_ROUNDS = 3;
const MIN_ROUNDS = 1;
const DEFAULT_MISSING_ANSWER = 'NA';

// CORS configuration
const CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'] as const;

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
} as const;

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

  constructor(private readonly debateService: DebateService) {}

  /**
   * Writes a message directly to stderr for immediate console output.
   * Ensures progress messages are visible in NestJS server console.
   *
   * @param message - The message to write to console.
   */
  private writeToConsole(message: string): void {
    process.stderr.write(message + '\n');
  }

  /**
   * Handles new WebSocket client connections.
   * Sends current debate state to the newly connected client.
   *
   * @param client - The connected WebSocket client socket.
   */
  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
    logInfo(`Client connected: ${client.id}`);
    this.writeToConsole(`[INFO] Client connected: ${client.id}`);
    
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
  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    logInfo(`Client disconnected: ${client.id}`);
    this.writeToConsole(`[INFO] Client disconnected: ${client.id}`);
  }

  /**
   * Handles the startDebate WebSocket message.
   * Validates input, collects clarifications if enabled, and starts the debate.
   *
   * @param dto - The debate start request data.
   * @param client - The WebSocket client socket.
   */
  @SubscribeMessage('startDebate')
  async handleStartDebate(
    @MessageBody() dto: StartDebateDto,
    @ConnectedSocket() client: Socket
  ) {
    if (this.debateInProgress) {
      this.emitError(client, ERROR_MESSAGES.DEBATE_IN_PROGRESS);
      return;
    }

    if (!dto.problem || dto.problem.trim().length === 0) {
      this.emitError(client, ERROR_MESSAGES.PROBLEM_REQUIRED);
      return;
    }

    // Validate rounds if provided
    const rounds = dto.rounds ?? DEFAULT_ROUNDS;
    if (rounds < MIN_ROUNDS) {
      this.emitError(client, ERROR_MESSAGES.INVALID_ROUNDS);
      return;
    }

    this.debateInProgress = true;
    this.currentProblem = dto.problem.trim();
    this.configuredRounds = rounds;
    
    const startMessage = 'Debate started';
    logInfo(startMessage);
    this.writeToConsole(`[INFO] ${startMessage}`);
    client.emit(WS_EVENTS.DEBATE_STARTED, { problem: this.currentProblem });

    // If clarifications enabled, collect questions first
    if (dto.clarificationsEnabled) {
      try {
        client.emit(WS_EVENTS.COLLECTING_CLARIFICATIONS);
        const questions = await this.debateService.collectClarifications(this.currentProblem);
        this.pendingClarifications = questions;
        
        if (questions.some(q => q.items.length > 0)) {
          client.emit(WS_EVENTS.CLARIFICATIONS_REQUIRED, { questions });
          return; // Wait for submitClarifications event
        }
        // No questions generated, proceed with debate
      } catch (error: any) {
        logWarning(`Failed to collect clarifications: ${error.message}`);
        client.emit(WS_EVENTS.WARNING, { message: `Failed to collect clarifications: ${error.message}` });
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
  async handleSubmitClarifications(
    @MessageBody() dto: SubmitClarificationsDto,
    @ConnectedSocket() client: Socket
  ) {
    if (!this.debateInProgress) {
      this.emitError(client, ERROR_MESSAGES.NO_DEBATE_IN_PROGRESS);
      return;
    }

    // Map answers to clarifications structure
    const clarificationsWithAnswers = this.mapAnswersToClarifications(dto.answers);
    
    client.emit(WS_EVENTS.CLARIFICATIONS_SUBMITTED);
    
    // Run debate with clarifications (use stored rounds from handleStartDebate)
    await this.runDebate(client, clarificationsWithAnswers, this.configuredRounds);
  }

  /**
   * Handles the cancelDebate WebSocket message.
   * Resets debate state and notifies the client.
   *
   * @param client - The WebSocket client socket.
   */
  @SubscribeMessage('cancelDebate')
  handleCancelDebate(@ConnectedSocket() client: Socket) {
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
  private async runDebate(client: Socket, clarifications?: AgentClarifications[], rounds?: number) {
    const hooks = this.createHooks(client);

    try {
      const result = await this.debateService.runDebate(
        this.currentProblem,
        hooks,
        clarifications,
        rounds
      );

      const completionMessage = 'Debate completed';
      logSuccess(completionMessage);
      this.writeToConsole(`[SUCCESS] ${completionMessage}`);
      client.emit(WS_EVENTS.DEBATE_COMPLETE, this.formatDebateResult(result));
    } catch (error: any) {
      const errorMessage = `${ERROR_MESSAGES.DEBATE_FAILED}: ${error.message}`;
      logWarning(errorMessage);
      this.emitError(client, errorMessage);
    } finally {
      this.resetDebateState();
    }
  }

  /**
   * Creates orchestrator hooks that emit WebSocket events and log to console.
   *
   * @param client - The WebSocket client socket.
   * @returns OrchestratorHooks implementation that emits events and logs progress.
   */
  private createHooks(client: Socket): OrchestratorHooks {
    return {
      onRoundStart: (round: number, total: number) => {
        this.currentRound = round;
        this.totalRounds = total;
        const message = `Round ${round}/${total} starting`;
        logInfo(message);
        this.writeToConsole(`[INFO] ${message}`);
        client.emit(WS_EVENTS.ROUND_START, { round, total });
      },
      onPhaseStart: (round: number, phase: ContributionType, count: number) => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase starting`, round);
        logInfo(message);
        this.writeToConsole(`[INFO] ${message}`);
        client.emit(WS_EVENTS.PHASE_START, { round, phase, expectedCount: count });
      },
      onAgentStart: (agentName: string, activity: string) => {
        const message = this.formatMessageWithRound(`${agentName} is ${activity}...`, this.currentRound);
        logInfo(message);
        this.writeToConsole(`[INFO] ${message}`);
        client.emit(WS_EVENTS.AGENT_START, { agentName, activity });
      },
      onAgentComplete: (agentName: string, activity: string) => {
        const message = this.formatMessageWithRound(`${agentName} completed ${activity}`, this.currentRound);
        logSuccess(message);
        this.writeToConsole(`[SUCCESS] ${message}`);
        client.emit(WS_EVENTS.AGENT_COMPLETE, { agentName, activity });
      },
      onPhaseComplete: (round: number, phase: ContributionType) => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase completed`, round);
        logSuccess(message);
        this.writeToConsole(`[SUCCESS] ${message}`);
        client.emit(WS_EVENTS.PHASE_COMPLETE, { round, phase });
      },
      onSynthesisStart: () => {
        const message = 'Synthesis starting';
        logInfo(message);
        this.writeToConsole(`[INFO] ${message}`);
        client.emit(WS_EVENTS.SYNTHESIS_START);
      },
      onSynthesisComplete: () => {
        const message = 'Synthesis completed';
        logSuccess(message);
        this.writeToConsole(`[SUCCESS] ${message}`);
        client.emit(WS_EVENTS.SYNTHESIS_COMPLETE);
      },
      onSummarizationStart: (agentName: string) => {
        const message = this.formatMessageWithRound(`${agentName} is summarizing context...`, this.currentRound);
        logInfo(message);
        this.writeToConsole(`[INFO] ${message}`);
        client.emit(WS_EVENTS.SUMMARIZATION_START, { agentName });
      },
      onSummarizationComplete: (agentName: string, beforeChars: number, afterChars: number) => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        this.writeToConsole(`[SUCCESS] ${message}`);
        client.emit(WS_EVENTS.SUMMARIZATION_COMPLETE, { agentName, beforeChars, afterChars });
      },
      onSummarizationEnd: (agentName: string) => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        this.writeToConsole(`[SUCCESS] ${message}`);
        client.emit(WS_EVENTS.SUMMARIZATION_END, { agentName });
      },
      onContributionCreated: (contribution: Contribution, roundNumber: number) => {
        // Look up agent name from agent configs
        const agentConfigs = this.debateService.getAgentConfigs();
        const agentConfig = agentConfigs.find(a => a.id === contribution.agentId);
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
  private formatDebateResult(result: DebateResult) {
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
  private resetDebateState() {
    this.debateInProgress = false;
    this.currentProblem = '';
    this.pendingClarifications = [];
    this.currentRound = 0;
    this.totalRounds = 0;
    this.configuredRounds = DEFAULT_ROUNDS;
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

