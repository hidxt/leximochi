import { Global, Module } from '@nestjs/common';
import { configProvider } from './config.provider';

/**
 * 全局配置模块：`CONFIG` 需要被 DatabaseModule、AuthModule 等模块注入，
 * 因此必须由全局模块导出，而不是只放在 AppModule 的 providers 里。
 */
@Global()
@Module({ providers: [configProvider], exports: ['CONFIG'] })
export class AppConfigModule {}
