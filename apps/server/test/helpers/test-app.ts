import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

export async function buildTestApp(moduleRef: TestingModule): Promise<INestApplication> {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}
