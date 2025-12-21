import { Module } from '@nestjs/common';
import { DebateGateway } from './debate.gateway';
import { DebateService } from './debate.service';

@Module({
  providers: [DebateGateway, DebateService],
  exports: [DebateService],
})
export class DebateModule {}

