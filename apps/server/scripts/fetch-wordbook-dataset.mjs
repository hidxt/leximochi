#!/usr/bin/env node
/**
 * 下载词库源数据到本地（不进入 Git）。
 *
 * 用法：
 *   node apps/server/scripts/fetch-wordbook-dataset.mjs [--out data/imports] [--only cet4,cet6] [--no-proxy]
 *
 * 网络规则（与项目约定一致）：优先使用代理 127.0.0.1:10808，代理不可用时改直连，
 * 两者都失败即报告并停止（不无限重试，也不修改任何全局代理配置）。
 *
 * 依赖：系统 `curl`（Windows 10+ 与 Git Bash 自带）。Node 自带的 fetch 不支持指定代理，
 * 因此这里通过 curl 实现代理切换。
 *
 * 数据来源与授权状态：见 docs/asset-licenses.md。**授权未登记前不要用于生产库。**
 */
import { execFile } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PROXY = 'http://127.0.0.1:10808';
const REPO = 'KyleBing/english-vocabulary';
const REF = 'master';
const FILES = {
  cet4: 'full_line_jsonl/full/正序/四级.jsonl',
  cet6: 'full_line_jsonl/full/正序/六级.jsonl',
};

function parseArgs(argv) {
  const out = { outDir: 'data/imports', only: Object.keys(FILES), useProxy: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') out.outDir = argv[i + 1];
    else if (arg === '--only') out.only = String(argv[i + 1]).split(',').map((s) => s.trim());
    else if (arg === '--no-proxy') out.useProxy = false;
  }
  return out;
}

async function downloadWithCurl(url, destination, { useProxy }) {
  const attempts = useProxy
    ? [
        { label: `代理 ${PROXY}`, args: ['-x', PROXY] },
        { label: '直连', args: [] },
      ]
    : [{ label: '直连', args: [] }];

  let lastError = 'unknown';
  for (const attempt of attempts) {
    try {
      process.stdout.write(`  ${attempt.label} … `);
      await run('curl', ['-fsSL', '--max-time', '600', ...attempt.args, '-o', destination, url], {
        maxBuffer: 1024 * 1024,
      });
      const size = statSync(destination).size;
      if (size < 1024) throw new Error(`返回内容过小（${size} 字节）`);
      console.log(`成功（${(size / 1024 / 1024).toFixed(2)} MB）`);
      return;
    } catch (error) {
      lastError = error.stderr?.toString().trim() || error.message;
      console.log(`失败：${lastError.split('\n')[0]}`);
    }
  }
  throw new Error(`下载失败：${url}\n最后错误：${lastError}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`数据源：https://github.com/${REPO}`);
  console.log(`授权状态：见 docs/asset-licenses.md（导入前必须已登记）`);
  for (const key of args.only) {
    const relativePath = FILES[key];
    if (!relativePath) {
      console.error(`未知词库标识：${key}（可选 ${Object.keys(FILES).join('/')}）`);
      process.exitCode = 1;
      continue;
    }
    const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${encodeURI(relativePath)}`;
    const destination = join(args.outDir, `${key}.jsonl`);
    mkdirSync(dirname(destination), { recursive: true });
    console.log(`- ${key} → ${destination}`);
    await downloadWithCurl(url, destination, { useProxy: args.useProxy });
  }
  console.log('完成。导入命令：');
  console.log('  npm run import:wordbook -w @leximochi/server -- --file data/imports/cet4.jsonl --key cet4 --name "四级核心词" --system');
}

main().catch((error) => {
  console.error(error.message);
  console.error('代理与直连均不可用时：请检查网络，或在他处准备数据文件后手动导入；不要修改全局代理配置。');
  process.exit(1);
});
