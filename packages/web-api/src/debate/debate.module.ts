import { Module } from '@nestjs/common';
import { DebateGateway } from './debate.gateway';
import { DebateService } from './debate.service';
import { DebateController } from './debate.controller';

/**
 * NestJS module for debate functionality.
 * Provides DebateGateway for WebSocket communication, DebateService for debate orchestration,
 * and DebateController for REST API endpoints.
 */
@Module({
  controllers: [DebateController],
  providers: [DebateGateway, DebateService],
  exports: [DebateService],
})
export class DebateModule {}

