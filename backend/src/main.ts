import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as express from 'express';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ limit: '25mb', extended: true }));
  // ALLOWED_ORIGINS (comma-separated) restricts CORS in production, e.g.
  // "https://academix.now,https://www.academix.now". Unset keeps the old
  // permissive dev behavior (any origin) so local setups aren't broken.
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true });
  app.use('/uploads', express.static(path.join(process.cwd(), 'local-data', 'uploads')));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server listening on http://localhost:${port}`);
}

bootstrap();
