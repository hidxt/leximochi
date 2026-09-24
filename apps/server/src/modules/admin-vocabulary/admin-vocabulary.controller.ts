import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AUDIO_MAX_BYTES,
  Permission,
  type AdminAudioUploadResponse,
  type AdminWordPage,
  type WordDetail,
} from '@leximochi/types';
import { RequirePermissions, CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import type { RequestWithId } from '../../common/middleware/request-context.middleware';
import { AdminVocabularyService, type AdminActionContext } from './admin-vocabulary.service';
import {
  ConfirmDto,
  CreateWordDto,
  CreateWordbookDto,
  ImportWordsDto,
  ListAdminWordsDto,
  UpdateWordbookDto,
  UploadAudioDto,
  WordContentDto,
} from './dto/admin-vocabulary.dto';

function toContext(req: RequestWithId): AdminActionContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

/**
 * 管理后台的词库与词条管理。
 * 权限由服务端逐接口校验（`@RequirePermissions`），前端隐藏按钮不作为安全边界；
 * 所有写操作都会写审计日志，高风险删除必须带 `confirm: true`。
 */
@Controller('admin')
export class AdminVocabularyController {
  constructor(private readonly vocabulary: AdminVocabularyService) {}

  // ---------- 词库 ----------

  @RequirePermissions(Permission.AdminWordbooksRead)
  @Get('wordbooks')
  async listWordbooks() {
    return { data: await this.vocabulary.listWordbooks() };
  }

  @RequirePermissions(Permission.AdminWordbooksRead)
  @Get('wordbooks/:id')
  async getWordbook(@Param('id') id: string) {
    return { data: await this.vocabulary.getWordbook(id) };
  }

  @RequirePermissions(Permission.AdminWordbooksWrite)
  @Post('wordbooks')
  @HttpCode(201)
  async createWordbook(
    @Body() dto: CreateWordbookDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.createWordbook(actor, dto, toContext(req)) };
  }

  @RequirePermissions(Permission.AdminWordbooksWrite)
  @Patch('wordbooks/:id')
  async updateWordbook(
    @Param('id') id: string,
    @Body() dto: UpdateWordbookDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.updateWordbook(actor, id, dto, toContext(req)) };
  }

  @RequirePermissions(Permission.AdminWordbooksWrite)
  @Delete('wordbooks/:id')
  async deleteWordbook(
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.deleteWordbook(actor, id, dto.confirm, toContext(req)) };
  }

  // ---------- 词条 ----------

  @RequirePermissions(Permission.AdminWordsRead)
  @Get('words')
  async listWords(@Query() query: ListAdminWordsDto): Promise<{ data: AdminWordPage }> {
    return { data: await this.vocabulary.listWords(query) };
  }

  @RequirePermissions(Permission.AdminWordsRead)
  @Get('words/:id')
  async getWord(@Param('id') id: string): Promise<{ data: WordDetail }> {
    return { data: await this.vocabulary.getWord(id) };
  }

  @RequirePermissions(Permission.AdminWordsImport)
  @Post('words/import')
  @HttpCode(200)
  async importWords(
    @Body() dto: ImportWordsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.importWords(actor, dto, toContext(req)) };
  }

  @RequirePermissions(Permission.AdminWordsWrite)
  @Post('words')
  @HttpCode(201)
  async createWord(
    @Body() dto: CreateWordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.createWord(actor, dto, toContext(req)) };
  }

  @RequirePermissions(Permission.AdminWordsWrite)
  @Patch('words/:id')
  async updateWord(
    @Param('id') id: string,
    @Body() dto: WordContentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.updateWord(actor, id, dto, toContext(req)) };
  }

  @RequirePermissions(Permission.AdminWordsWrite)
  @Delete('words/:id')
  async deleteWord(
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ) {
    return { data: await this.vocabulary.deleteWord(actor, id, dto.confirm, toContext(req)) };
  }

  /**
   * 上传发音音频（multipart/form-data：`file` + `kind`）。
   * 大小、扩展名、真实 MIME、文件名全部在服务端校验；存储 key 由服务端生成。
   */
  @RequirePermissions(Permission.AdminWordsAudio)
  @Post('words/:id/audio')
  // 先由 multer 在解析阶段拦住超大请求体，业务校验再复核一次（纵深防御）
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AUDIO_MAX_BYTES, files: 1 } }))
  @HttpCode(200)
  async uploadAudio(
    @Param('id') id: string,
    @Body() dto: UploadAudioDto,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ): Promise<{ data: AdminAudioUploadResponse }> {
    return { data: await this.vocabulary.uploadAudio(actor, id, dto.kind, file, toContext(req)) };
  }
}
