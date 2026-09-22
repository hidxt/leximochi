import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { normalizeUsername, validatePassword, validateUsername } from '@leximochi/core';
import { RoleKey } from '@leximochi/types';
import { AppModule } from '../app.module';
import { AuditService } from '../modules/audit/audit.service';
import { PasswordHasher } from '../modules/auth/password-hasher';
import { ROLE_REPOSITORY, type RoleRepository } from '../modules/users/domain/role.repository';
import { USER_REPOSITORY, type UserRepository } from '../modules/users/domain/user.repository';

const USAGE = `用法: ADMIN_PASSWORD='<强密码>' npm run create-admin -w @leximochi/server -- --username <用户名> [--allow-existing]

说明:
  - 密码仅从环境变量 ADMIN_PASSWORD 读取（不通过命令行参数，避免进入命令历史）
  - --allow-existing 表示用户名已存在时只补齐 admin 角色，不修改其密码`;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const username = readArg('username');
  const allowExisting = process.argv.includes('--allow-existing');
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(USAGE);
    process.exit(1);
  }

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) {
    console.error(`用户名不符合要求: ${usernameCheck.reason}`);
    process.exit(1);
  }
  const passwordCheck = validatePassword(password, { username });
  if (!passwordCheck.ok) {
    console.error(`密码不符合要求: ${passwordCheck.reason}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const users = app.get<UserRepository>(USER_REPOSITORY);
    const roles = app.get<RoleRepository>(ROLE_REPOSITORY);
    const hasher = app.get(PasswordHasher);
    const audit = app.get(AuditService);

    const adminRole = await roles.findByKey(RoleKey.Admin);
    if (!adminRole) {
      console.error('系统角色缺失：请确认数据库 migration 与种子数据已执行');
      process.exit(1);
    }

    const canonical = normalizeUsername(username);
    const existing = await users.findByUsernameCanonical(canonical);

    if (existing) {
      if (!allowExisting) {
        console.error(`用户已存在: ${existing.username}（如需仅补齐 admin 角色，请加 --allow-existing）`);
        process.exit(1);
      }
      await roles.assignRole(existing.id, adminRole.id, {
        grantedBy: null,
        now: Date.now(),
      });
      await audit.record({
        actorUserId: null,
        actorType: 'system',
        action: 'admin.bootstrap.role_granted',
        targetType: 'user',
        targetId: existing.id,
        result: 'success',
      });
      console.log(`已为现有用户补齐 admin 角色: ${existing.username}`);
      return;
    }

    const now = Date.now();
    const passwordHash = await hasher.hash(password);
    const created = await users.create({
      username: username.trim(),
      usernameCanonical: canonical,
      passwordHash,
      now,
    });
    await roles.assignRole(created.id, adminRole.id, { grantedBy: null, now });
    await audit.record({
      actorUserId: null,
      actorType: 'system',
      action: 'admin.bootstrap.created',
      targetType: 'user',
      targetId: created.id,
      result: 'success',
    });

    // 只输出用户名；密码与任何凭证都不打印
    console.log(`已创建管理员: ${created.username}`);
    console.log('注意：该引导账号未生成恢复码，请尽早在应用内完善账号恢复方式。');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`创建管理员失败: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exit(1);
});
