import * as path from 'path';

import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';

import { AppModule } from './app.module';
import { getCorsOrigins } from './utils/cors';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  // Load environment variables from workspace root
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for the web UI
  const corsOrigins = getCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  });
  
  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  await app.listen(port);
  console.log(`Dialectic Web API running on http://localhost:${port}`);
  console.log(`CORS enabled for origins: ${corsOrigins.join(', ')}`);
}
bootstrap();

