import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getCorsOrigins } from './utils/cors';

async function bootstrap() {
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
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Dialectic Web API running on http://localhost:${port}`);
  console.log(`CORS enabled for origins: ${corsOrigins.join(', ')}`);
}
bootstrap();

