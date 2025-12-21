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
import { AgentClarifications, DebateResult, ContributionType, Contribution } from '@dialectic/core';

interface StartDebateDto {
  problem: string;
  clarificationsEnabled: boolean;
}

interface SubmitClarificationsDto {
  answers: Record<string, string>;
}

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
      client.emit('error', { message: 'A debate is already in progress' });
      return;
    }

    if (!dto.problem || dto.problem.trim().length === 0) {
      client.emit('error', { message: 'Problem description is required' });
      return;
    }

    this.debateInProgress = true;
    this.currentProblem = dto.problem.trim();
    
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
        client.emit('warning', { message: `Failed to collect clarifications: ${error.message}` });
        // Continue with debate without clarifications
      }
    }

    // Run debate without clarifications
    await this.runDebate(client);
  }

  @SubscribeMessage('submitClarifications')
  async handleSubmitClarifications(
    @MessageBody() dto: SubmitClarificationsDto,
    @ConnectedSocket() client: Socket
  ) {
    if (!this.debateInProgress) {
      client.emit('error', { message: 'No debate in progress' });
      return;
    }

    // Map answers to clarifications structure
    const clarificationsWithAnswers = this.mapAnswersToClarifications(dto.answers);
    
    client.emit('clarificationsSubmitted');
    
    // Run debate with clarifications
    await this.runDebate(client, clarificationsWithAnswers);
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
  private async runDebate(client: Socket, clarifications?: AgentClarifications[]) {
    const hooks = this.createHooks(client);

    try {
      const result = await this.debateService.runDebate(
        this.currentProblem,
        hooks,
        clarifications
      );

      client.emit('debateComplete', this.formatDebateResult(result));
    } catch (error: any) {
      client.emit('error', { message: `Debate failed: ${error.message}` });
    } finally {
      this.resetDebateState();
    }
  }

  /**
   * Creates orchestrator hooks that emit WebSocket events.
   */
  private createHooks(client: Socket): OrchestratorHooks {
    return {
      onRoundStart: (round: number, total: number) => {
        client.emit('roundStart', { round, total });
      },
      onPhaseStart: (round: number, phase: ContributionType, count: number) => {
        client.emit('phaseStart', { round, phase, expectedCount: count });
      },
      onAgentStart: (agentName: string, activity: string) => {
        client.emit('agentStart', { agentName, activity });
      },
      onAgentComplete: (agentName: string, activity: string) => {
        client.emit('agentComplete', { agentName, activity });
      },
      onPhaseComplete: (round: number, phase: ContributionType) => {
        client.emit('phaseComplete', { round, phase });
      },
      onSynthesisStart: () => {
        client.emit('synthesisStart');
      },
      onSynthesisComplete: () => {
        client.emit('synthesisComplete');
      },
      onSummarizationStart: (agentName: string) => {
        client.emit('summarizationStart', { agentName });
      },
      onSummarizationComplete: (agentName: string, beforeChars: number, afterChars: number) => {
        client.emit('summarizationComplete', { agentName, beforeChars, afterChars });
      },
      onSummarizationEnd: (agentName: string) => {
        client.emit('summarizationEnd', { agentName });
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
  }
}

