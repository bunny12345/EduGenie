import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS for local development so the web UI can call the API from a different origin
  app.enableCors({ origin: true, credentials: true });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server listening on http://localhost:${port}`);
}

bootstrap();
