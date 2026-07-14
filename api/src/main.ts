import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationExceptionFactory } from './common/validation/validation-exception.factory';
import { SUPPORT_SESSION_HEADER } from './support/support-session.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Dietro il proxy di Railway: fidati del primo hop per leggere l'IP reale
  // (X-Forwarded-For) usato dal rate limiter. Nessun trust oltre il proxy.
  app.set('trust proxy', 1);

  // Header di sicurezza (HSTS, nosniff, frame deny, ecc. — regole-sicurezza).
  // L'API e' solo JSON: niente CSP da servire qui, ma HSTS e referrer policy stretti.
  app.use(
    helmet({
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // Filtro errori globale: niente stack trace o dettagli interni al client.
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS: solo origini in lista bianca, mai wildcard con credenziali.
  const config = app.get(ConfigService);
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    allowedHeaders: ['Content-Type', 'Authorization', SUPPORT_SESSION_HEADER],
  });

  // Validazione payload globale: whitelist (campi sconosciuti rimossi),
  // forbidNonWhitelisted (payload sospetti rifiutati), transform per i DTO.
  // exceptionFactory: mai esporre al client nomi di proprietà/vincoli tecnici
  // del DTO (es. "property xyz should not exist") — solo un messaggio
  // generico in italiano. Il dettaglio originale resta nei log server-side
  // (vedi common/validation/validation-exception.factory.ts).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: createValidationExceptionFactory(),
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
