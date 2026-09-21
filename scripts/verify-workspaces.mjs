import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = ['apps/*', 'packages/*'];
const missing = expected.filter((w) => !root.workspaces?.includes(w));
if (missing.length > 0) {
  console.error(`缺少 workspaces 配置: ${missing.join(', ')}`);
  process.exit(1);
}
for (const key of ['typecheck', 'lint', 'test', 'build']) {
  if (!root.scripts?.[key]) {
    console.error(`缺少根脚本: ${key}`);
    process.exit(1);
  }
}
if (root.engines?.node !== '>=24.3.0') {
  console.error('engines.node 必须为 >=24.3.0');
  process.exit(1);
}
console.log('workspaces 校验通过');
