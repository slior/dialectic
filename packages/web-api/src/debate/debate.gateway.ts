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

interface StartDebateDto {
  problem: string;
  clarificationsEnabled: boolean;
  rounds?: number;
}

interface SubmitClarificationsDto {
  answers: Record<string, string>;
}

const DEFAULT_ROUNDS = 3;

/**
 * WebSocket gateway for real-time debate communication.
 * Handles debate lifecycle, clarifications, and progress events.
 */
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
    console.log(`Client connected: ${client.id}`);
    
    // Send current state to newly connected client
    client.emit('connectionEstablished', {
      debateInProgress: this.debateInProgress,
      agents: this.debateService.getAgentConfigs(),
      judge: this.debateService.getJudgeConfig(),
    });
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('startDebate')
  async handleStartDebate(
    @MessageBody() dto: StartDebateDto,
    @ConnectedSocket() client: Socket
  ) {
    if (this.debateInProgress) {
      logWarning('A debate is already in progress');
      client.emit('error', { message: 'A debate is already in progress' });
      return;
    }

    if (!dto.problem || dto.problem.trim().length === 0) {
      logWarning('Problem description is required');
      client.emit('error', { message: 'Problem description is required' });
      return;
    }

    // Validate rounds if provided
    const rounds = dto.rounds ?? DEFAULT_ROUNDS;
    if (rounds < 1) {
      logWarning('Invalid rounds value');
      client.emit('error', { message: 'Number of rounds must be >= 1' });
      return;
    }

    this.debateInProgress = true;
    this.currentProblem = dto.problem.trim();
    this.configuredRounds = rounds;
    
    logInfo('Debate started');
    client.emit('debateStarted', { problem: this.currentProblem });

    // If clarifications enabled, collect questions first
    if (dto.clarificationsEnabled) {
      try {
        client.emit('collectingClarifications');
        const questions = await this.debateService.collectClarifications(this.currentProblem);
        this.pendingClarifications = questions;
        
        if (questions.some(q => q.items.length > 0)) {
          client.emit('clarificationsRequired', { questions });
          return; // Wait for submitClarifications event
        }
        // No questions generated, proceed with debate
      } catch (error: any) {
        logWarning(`Failed to collect clarifications: ${error.message}`);
        client.emit('warning', { message: `Failed to collect clarifications: ${error.message}` });
        // Continue with debate without clarifications
      }
    }

    // Run debate without clarifications
    await this.runDebate(client, undefined, rounds);
  }

  @SubscribeMessage('submitClarifications')
  async handleSubmitClarifications(
    @MessageBody() dto: SubmitClarificationsDto,
    @ConnectedSocket() client: Socket
  ) {
    if (!this.debateInProgress) {
      logWarning('No debate in progress');
      client.emit('error', { message: 'No debate in progress' });
      return;
    }

    // Map answers to clarifications structure
    const clarificationsWithAnswers = this.mapAnswersToClarifications(dto.answers);
    
    client.emit('clarificationsSubmitted');
    
    // Run debate with clarifications (use stored rounds from handleStartDebate)
    await this.runDebate(client, clarificationsWithAnswers, this.configuredRounds);
  }

  @SubscribeMessage('cancelDebate')
  handleCancelDebate(@ConnectedSocket() client: Socket) {
    if (this.debateInProgress) {
      this.resetDebateState();
      client.emit('debateCancelled');
    }
  }

  /**
   * Maps user answers to the clarifications structure.
   */
  private mapAnswersToClarifications(answers: Record<string, string>): AgentClarifications[] {
    return this.pendingClarifications.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        answer: answers[item.id] || 'NA',
      })),
    }));
  }

  /**
   * Runs the debate and emits progress events via WebSocket.
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

      logSuccess('Debate completed');
      client.emit('debateComplete', this.formatDebateResult(result));
    } catch (error: any) {
      logWarning(`Debate failed: ${error.message}`);
      client.emit('error', { message: `Debate failed: ${error.message}` });
    } finally {
      this.resetDebateState();
    }
  }

  /**
   * Creates orchestrator hooks that emit WebSocket events and log to console.
   */
  private createHooks(client: Socket): OrchestratorHooks {
    return {
      onRoundStart: (round: number, total: number) => {
        this.currentRound = round;
        this.totalRounds = total;
        logInfo(`Round ${round}/${total} starting`);
        client.emit('roundStart', { round, total });
      },
      onPhaseStart: (round: number, phase: ContributionType, count: number) => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase starting`, round);
        logInfo(message);
        client.emit('phaseStart', { round, phase, expectedCount: count });
      },
      onAgentStart: (agentName: string, activity: string) => {
        const message = this.formatMessageWithRound(`${agentName} is ${activity}...`, this.currentRound);
        logInfo(message);
        client.emit('agentStart', { agentName, activity });
      },
      onAgentComplete: (agentName: string, activity: string) => {
        const message = this.formatMessageWithRound(`${agentName} completed ${activity}`, this.currentRound);
        logSuccess(message);
        client.emit('agentComplete', { agentName, activity });
      },
      onPhaseComplete: (round: number, phase: ContributionType) => {
        const phaseLabel = this.getPhaseLabel(phase);
        const message = this.formatMessageWithRound(`${phaseLabel} phase completed`, round);
        logSuccess(message);
        client.emit('phaseComplete', { round, phase });
      },
      onSynthesisStart: () => {
        logInfo('Synthesis starting');
        client.emit('synthesisStart');
      },
      onSynthesisComplete: () => {
        logSuccess('Synthesis completed');
        client.emit('synthesisComplete');
      },
      onSummarizationStart: (agentName: string) => {
        const message = this.formatMessageWithRound(`${agentName} is summarizing context...`, this.currentRound);
        logInfo(message);
        client.emit('summarizationStart', { agentName });
      },
      onSummarizationComplete: (agentName: string, beforeChars: number, afterChars: number) => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        client.emit('summarizationComplete', { agentName, beforeChars, afterChars });
      },
      onSummarizationEnd: (agentName: string) => {
        const message = this.formatMessageWithRound(`${agentName} completed summarizing context`, this.currentRound);
        logSuccess(message);
        client.emit('summarizationEnd', { agentName });
      },
      onContributionCreated: (contribution: Contribution, roundNumber: number) => {
        // Look up agent name from agent configs
        const agentConfigs = this.debateService.getAgentConfigs();
        const agentConfig = agentConfigs.find(a => a.id === contribution.agentId);
        const agentName = agentConfig?.name || contribution.agentId;
        
        client.emit('contributionCreated', {
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
   * Formats the debate result for client consumption.
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
   * Maps contribution type to phase label.
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
   */
  private formatMessageWithRound(message: string, round: number): string {
    if (round > 0) {
      return `[Round ${round}] ${message}`;
    }
    return message;
  }
}

