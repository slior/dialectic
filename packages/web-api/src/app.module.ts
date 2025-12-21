import { Module } from '@nestjs/common';
import { DebateModule } from './debate/debate.module';

@Module({
  imports: [DebateModule],
})
export class AppModule {}

