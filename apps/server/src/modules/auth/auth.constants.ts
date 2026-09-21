/**
 * 固定的 Argon2id 哈希，用于「用户不存在」时做一次等价耗时的校验，
 * 避免通过响应时间枚举账号是否存在。值本身对应一个随机口令，无任何用途。
 */
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$T8IJUkk/XugK24tr+mi1qA$Hd0R+eP0QdaXgFvi9z/JASzFEt2++85ddAIIXYCLyj0';
