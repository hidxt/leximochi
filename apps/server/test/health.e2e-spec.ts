import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildTestEnv } from './helpers/test-env';
import { buildTestApp } from './helpers/test-app';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CONFIG')
      .useValue(buildTestEnv())
      .compile();
    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('返回 200 与 ok 状态', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('未知路由返回统一错误格式且不泄露内部信息', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\.ts:|at Object/);
    expect(typeof res.body.error.requestId).toBe('string');
  });
});
