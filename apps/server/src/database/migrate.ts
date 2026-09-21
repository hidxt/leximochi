import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseService } from './database.service';

export function runMigrations(db: DatabaseService, migrationsFolder: string): void {
  migrate(db.db, { migrationsFolder });
}
