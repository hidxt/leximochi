import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { configProvider } from './config/config.provider';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), HealthModule],
  providers: [
    configProvider,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
