import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * `Algorithm` 是 ambient const enum，在 isolatedModules 下不可访问，
 * 因此这里使用其数值：Argon2d = 0，Argon2i = 1，Argon2id = 2。
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(hashedPassword: string, password: string): Promise<boolean> {
    try {
      return await verify(hashedPassword, password);
    } catch {
      // 哈希串损坏或被篡改时按校验失败处理，不抛出内部错误
      return false;
    }
  }
}
