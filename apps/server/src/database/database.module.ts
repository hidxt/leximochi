import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { ServerConfig } from '../config/configuration';
import { DATABASE, MIGRATIONS_FOLDER } from './database.constants';
import { createDatabase, type DatabaseService } from './database.service';
import { runMigrations } from './migrate';
import { seedSystemRoles } from './seed/roles.seed';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: ['CONFIG'],
      useFactory: (config: ServerConfig): DatabaseService => {
        const db = createDatabase(config.databasePath);
        runMigrations(db, `${__dirname}/../../${MIGRATIONS_FOLDER}`);
        seedSystemRoles(db);
        return db;
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: DatabaseService) {}

  onApplicationShutdown(): void {
    this.db.close();
  }
}
