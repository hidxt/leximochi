import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  convertKyleBingJsonl,
} from '../modules/vocabulary/import/source-converters';
import { WordImportService } from '../modules/vocabulary/import/word-import.service';

const USAGE = `用法: node --env-file-if-exists=.env dist/scripts/import-wordbook.js \\
  --file <源文件路径(.jsonl)> --key <词库标识> --name <词库名称> [--description <说明>] [--system]

说明:
  - 源格式为 KyleBing/english-vocabulary 的 full_line_jsonl/full/正序/*.jsonl
  - 导入是幂等的：重复导入同一文件不会产生重复词条，只会更新并递增词库版本
  - --system 标记为系统词库（内置词库）
  - 数据来源与授权：见 docs/asset-licenses.md`;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const file = readArg('file');
  const key = readArg('key');
  const name = readArg('name');
  const description = readArg('description');
  const isSystem = process.argv.includes('--system');

  if (!file || !key || !name) {
    console.error(USAGE);
    process.exit(1);
  }

  const text = readFileSync(file, 'utf8');
  const { words, skipped } = convertKyleBingJsonl(text);
  console.log(`源文件 ${file}：可转换词条 ${words.length}，跳过 ${skipped} 行`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const importer = app.get(WordImportService);
    const summary = await importer.importWordbook({ key, name, description, isSystem }, words);

    console.log('导入完成：');
    console.log(`  词库        ${summary.wordbookKey}（版本 ${summary.version}）`);
    console.log(`  词条总数    ${summary.wordCount}`);
    console.log(`  新增        ${summary.created}`);
    console.log(`  更新        ${summary.updated}`);
    console.log(`  校验失败    ${summary.failed.length}`);
    for (const failure of summary.failed.slice(0, 5)) {
      console.log(`    - 第 ${failure.index} 行（${failure.headword ?? '无词形'}）：${failure.reason}`);
    }
    if (summary.failed.length > 5) {
      console.log(`    …以及另外 ${summary.failed.length - 5} 条`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`导入失败：${error instanceof Error ? error.message : 'unknown'}`);
  process.exit(1);
});
