import { Module } from '@nestjs/common';
import { DebateGateway } from './debate.gateway';
import { DebateService } from './debate.service';

/**
 * NestJS module for debate functionality.
 * Provides DebateGateway for WebSocket communication and DebateService for debate orchestration.
 */
@Module({
  providers: [DebateGateway, DebateService],
  exports: [DebateService],
})
export class DebateModule {}

