import { Module } from '@nestjs/common';
import { DebateModule } from './debate/debate.module';

/**
 * Root application module for the Dialectic Web API.
 * Imports and configures all feature modules.
 */
@Module({
  imports: [DebateModule],
})
export class AppModule {}

