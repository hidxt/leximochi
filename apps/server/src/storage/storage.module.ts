import { Global, Module } from '@nestjs/common';
import type { ServerConfig } from '../config/configuration';
import { LocalStorageProvider, STORAGE_PROVIDER, uploadsRootDir } from './local-storage.provider';

/**
 * 文件存储：默认本地实现。业务代码只依赖 STORAGE_PROVIDER 接口，
 * 未来切换 S3 兼容对象存储时只需替换这里的工厂，不改业务逻辑。
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig) =>
        new LocalStorageProvider({ rootDir: uploadsRootDir(config.dataDir) }),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
