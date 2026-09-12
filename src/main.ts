import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Application } from 'express';
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /*
   * Trust the reverse proxy in front of us.
   *
   * In production nginx terminates TLS and forwards to this process, so the
   * socket address Express sees is nginx's, not the visitor's. Without this,
   * every request appears to come from the same IP — which quietly breaks two
   * things that both depend on knowing who is calling:
   *
   *   - the login throttle (5 per minute) becomes one shared bucket, so a
   *     handful of people signing in together start getting 429s. It reads
   *     like an outage rather than a misconfiguration.
   *   - spam_check's ip_hash records a hash of the proxy, identically for
   *     everyone, making the signal worthless.
   *
   * `1` means trust exactly one hop. Higher values would let a client forge
   * X-Forwarded-For entries and impersonate another address.
   */
  const expressApp = app.getHttpAdapter().getInstance() as Application;
  expressApp.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(
    new TransformResponseInterceptor(app.get(Reflector)),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Explicit allowlist — `origin: true` would reflect any origin back, which is
  // unsafe on a public site combined with credentials: true.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Origin',
      'X-Requested-With',
      'Access-Control-Allow-Headers',
    ],
    exposedHeaders: ['Authorization', 'Content-Length', 'Content-Range'],
    credentials: true,
    maxAge: 86400, // cache preflight response for 24h
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Veltrixair.com API')
    .setDescription(
      'Backend for the veltrixair.com corporate site.\n\n' +
        'Click the **Authorize** button (top-right) and paste a token to test protected endpoints.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT bearer token',
      },
      'jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;

  // `nest start --watch` is three nested processes, and killing only the one
  // holding the port leaves the watcher above it alive to grab it again. The
  // raw EADDRINUSE stack trace says none of that, so say it here instead.
  try {
    await app.listen(port);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `\n  Port ${port} is already in use — most likely a dev server from an ` +
          `earlier run.\n\n  Free it with:  npm run dev:stop\n  Or start clean with:  npm run dev\n`,
      );
      process.exit(1);
    }
    throw error;
  }

  console.log(`🚀 Veltrixair.com backend running on port ${port}`);
  console.log(`📚 Swagger docs:  http://localhost:${port}/api/docs`);
  console.log(`📄 OpenAPI JSON:  http://localhost:${port}/api/docs-json`);
}
void bootstrap();
