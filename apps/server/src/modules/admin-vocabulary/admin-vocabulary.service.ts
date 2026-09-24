import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type AdminAudioUploadResponse, type WordDetail } from '@leximochi/types';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { WORD_REPOSITORY, type WordRepository } from '../vocabulary/domain/word.repository';
import {
  WORDBOOK_REPOSITORY,
  type WordbookRepository,
} from '../vocabulary/domain/wordbook.repository';
import { WordImportService } from '../vocabulary/import/word-import.service';
import type { ImportWordInput } from '../vocabulary/import/import.types';
import { WordWriteService } from '../vocabulary/word-write.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../storage/local-storage.provider';
import { buildAudioStorageKey, validateAudioUpload } from '../../storage/file-validation';
import type {
  CreateWordDto,
  CreateWordbookDto,
  UpdateWordbookDto,
  WordContentDto,
} from './dto/admin-vocabulary.dto';

/** 后台操作请求上下文，用于审计（不含任何秘密） */
export interface AdminActionContext {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

const DEFAULT_ADMIN_WORD_LIMIT = 30;
const AUDIO_KEY_PREFIX = 'word-audio';

/** 后台词库与词条管理：写操作全部落审计，高风险删除必须显式二次确认 */
@Injectable()
export class AdminVocabularyService {
  constructor(
    @Inject(WORDBOOK_REPOSITORY) private readonly wordbooks: WordbookRepository,
    @Inject(WORD_REPOSITORY) private readonly words: WordRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly writer: WordWriteService,
    private readonly importer: WordImportService,
    private readonly audit: AuditService,
  ) {}

  // ---------- 词库 ----------

  async listWordbooks() {
    return this.wordbooks.list();
  }

  async getWordbook(id: string) {
    const book = await this.wordbooks.findById(id);
    if (!book) throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
    return book;
  }

  async createWordbook(
    actor: AuthenticatedUser,
    dto: CreateWordbookDto,
    ctx: AdminActionContext,
  ) {
    if (await this.wordbooks.findByKey(dto.key)) {
      throw new AppError(ErrorCode.WORDBOOK_KEY_TAKEN, '该词库 key 已被占用', 409);
    }
    const created = await this.wordbooks.create({
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      language: dto.language,
      isSystem: dto.isSystem,
    });
    await this.record(actor, 'admin.wordbook.created', 'wordbook', created.id, ctx, {
      key: created.key,
    });
    return created;
  }

  async updateWordbook(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateWordbookDto,
    ctx: AdminActionContext,
  ) {
    const updated = await this.wordbooks.update(id, {
      name: dto.name,
      description: dto.description,
      language: dto.language,
      isSystem: dto.isSystem,
    });
    if (!updated) throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
    await this.record(actor, 'admin.wordbook.updated', 'wordbook', id, ctx, {
      fields: Object.keys(dto).join(','),
    });
    return updated;
  }

  /** 高风险：删除词库只解除词库与词条的关联，共享词条本身保留 */
  async deleteWordbook(
    actor: AuthenticatedUser,
    id: string,
    confirm: boolean,
    ctx: AdminActionContext,
  ) {
    this.assertConfirmed(confirm, '删除词库');
    const book = await this.wordbooks.findById(id);
    if (!book) throw new AppError(ErrorCode.WORDBOOK_NOT_FOUND, '词库不存在', 404);
    await this.wordbooks.delete(id);
    await this.record(actor, 'admin.wordbook.deleted', 'wordbook', id, ctx, { key: book.key });
    return { deleted: true };
  }

  // ---------- 词条 ----------

  async listWords(query: { query?: string; wordbookId?: string; cursor?: string; limit?: number }) {
    if (query.wordbookId) await this.getWordbook(query.wordbookId);
    return this.words.listForAdmin({
      query: query.query,
      wordbookId: query.wordbookId,
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_ADMIN_WORD_LIMIT,
    });
  }

  async getWord(id: string): Promise<WordDetail> {
    const detail = await this.words.findDetailById(id);
    if (!detail) throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    return { ...detail, state: null };
  }

  async createWord(actor: AuthenticatedUser, dto: CreateWordDto, ctx: AdminActionContext) {
    const result = await this.writer.writeWord({
      wordbookId: dto.wordbookId,
      word: toImportWord(dto),
      mode: 'create',
    });
    await this.record(actor, 'admin.word.created', 'word', result.wordId, ctx, {
      headword: dto.headword,
      wordbookId: dto.wordbookId,
    });
    return result;
  }

  /** 更新：以提交内容为准整段替换词典内容（可删减义项），AI 补充独立表不受影响 */
  async updateWord(
    actor: AuthenticatedUser,
    id: string,
    dto: WordContentDto,
    ctx: AdminActionContext,
  ) {
    const existing = await this.words.findDetailById(id);
    if (!existing) throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    const result = await this.writer.replaceWordById(id, toImportWord(dto));
    await this.record(actor, 'admin.word.updated', 'word', id, ctx, {
      headword: dto.headword,
    });
    return result;
  }

  async deleteWord(
    actor: AuthenticatedUser,
    id: string,
    confirm: boolean,
    ctx: AdminActionContext,
  ) {
    this.assertConfirmed(confirm, '删除词条');
    const existing = await this.words.findDetailById(id);
    if (!existing) throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    const result = await this.writer.deleteWord(id);
    await this.record(actor, 'admin.word.deleted', 'word', id, ctx, {
      headword: existing.headword,
      wordbooks: result.affectedWordbookIds.length,
    });
    return result;
  }

  async importWords(
    actor: AuthenticatedUser,
    input: {
      wordbookKey: string;
      wordbookName: string;
      description?: string;
      items: Array<Record<string, unknown>>;
    },
    ctx: AdminActionContext,
  ) {
    const summary = await this.importer.importWordbook(
      {
        key: input.wordbookKey,
        name: input.wordbookName,
        description: input.description ?? null,
      },
      input.items as unknown as ImportWordInput[],
    );
    await this.record(actor, 'admin.words.imported', 'wordbook', input.wordbookKey, ctx, {
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed.length,
      wordCount: summary.wordCount,
    });
    return summary;
  }

  // ---------- 音频 ----------

  /**
   * 上传发音音频：大小/扩展名/真实 MIME/文件名全部校验通过后才落盘；
   * 存储 key 由服务端生成（不采纳用户输入），DB 更新失败则回滚已写入的文件。
   */
  async uploadAudio(
    actor: AuthenticatedUser,
    wordId: string,
    kind: 'uk' | 'us',
    file: { originalname: string; buffer: Buffer } | undefined,
    ctx: AdminActionContext,
  ): Promise<AdminAudioUploadResponse> {
    const word = await this.words.findDetailById(wordId);
    if (!word) throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, '缺少音频文件', 400);
    }

    const validated = validateAudioUpload({ filename: file.originalname, data: file.buffer });
    if (!validated.ok) {
      throw new AppError(ErrorCode[validated.code], validated.reason, validated.code === 'PAYLOAD_TOO_LARGE' ? 413 : 415);
    }

    const key = buildAudioStorageKey({ prefix: AUDIO_KEY_PREFIX, extension: validated.extension });
    await this.storage.put({ key, data: file.buffer, contentType: validated.contentType });

    const applied = await this.writer.setAudioKey(wordId, kind, key);
    if (!applied) {
      await this.storage.delete(key);
      throw new AppError(ErrorCode.WORD_NOT_FOUND, '词条不存在', 404);
    }

    await this.record(actor, 'admin.word.audio_uploaded', 'word', wordId, ctx, {
      kind,
      bytes: file.buffer.length,
    });
    return { wordId, kind, audioKey: key };
  }

  // ---------- 内部 ----------

  private assertConfirmed(confirm: boolean, action: string): void {
    if (!confirm) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, `${action}属于高风险操作，需要二次确认`, 400);
    }
  }

  private async record(
    actor: AuthenticatedUser,
    action: string,
    targetType: string,
    targetId: string,
    ctx: AdminActionContext,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: actor.userId,
      actorType: 'admin',
      action,
      targetType,
      targetId,
      result: 'success',
      ...(metadata ? { metadata } : {}),
      ...ctx,
    });
  }
}

function toImportWord(dto: WordContentDto): ImportWordInput {
  return {
    headword: dto.headword,
    phoneticUk: dto.phoneticUk ?? null,
    phoneticUs: dto.phoneticUs ?? null,
    rank: dto.rank ?? null,
    tags: dto.tags ?? [],
    senses: dto.senses.map((sense) => ({
      partOfSpeech: sense.partOfSpeech ?? null,
      definitionZh: sense.definitionZh,
      definitionEn: sense.definitionEn ?? null,
      examMeaning: sense.examMeaning ?? null,
    })),
    examples: (dto.examples ?? []).map((example) => ({ textEn: example.textEn, textZh: example.textZh })),
    phrases: (dto.phrases ?? []).map((phrase) => ({
      kind: phrase.kind,
      text: phrase.text,
      translation: phrase.translation,
    })),
    forms: (dto.forms ?? []).map((form) => ({ formType: form.formType, value: form.value })),
    relations: (dto.relations ?? []).map((relation) => ({
      relationType: relation.relationType,
      targetWordId: relation.targetWordId ?? null,
      targetText: relation.targetText ?? null,
    })),
    aiNotes: dto.aiNotes
      ? {
          memoryTip: dto.aiNotes.memoryTip ?? null,
          usageNote: dto.aiNotes.usageNote ?? null,
          confusableNote: dto.aiNotes.confusableNote ?? null,
          provider: dto.aiNotes.provider ?? null,
          model: dto.aiNotes.model ?? null,
        }
      : null,
  };
}
