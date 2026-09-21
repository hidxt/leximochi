import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig, type ServerConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  let config: ServerConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    // 只输出变量名与原因，绝不输出秘密值
    logger.error(`配置校验失败: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port);
  logger.log(`服务已启动，端口 ${config.port}，环境 ${config.env}`);
}

void bootstrap();
