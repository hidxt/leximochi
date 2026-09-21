/**
 * 归一化 IP：把 IPv4-mapped IPv6（`::ffff:127.0.0.1`）还原为 IPv4，
 * 避免同一客户端因表示形式不同而被当作不同来源（验证码绑定与限流计数都会受影响）。
 * 注意：`req.ip` 只有在部署时正确配置 `trust proxy` 才代表真实客户端地址。
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.length === 0) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped ? mapped[1]! : trimmed;
}
