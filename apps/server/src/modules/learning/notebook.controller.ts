import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { NotebookAddResponse, NotebookPage } from '@leximochi/types';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AddNotebookDto, ListNotebookDto } from './dto/notebook.dto';
import { NotebookService } from './notebook.service';

/** 生词本：所有操作都以当前登录用户为范围（越权返回 404） */
@Controller('notebook')
export class NotebookController {
  constructor(private readonly notebook: NotebookService) {}

  @Get()
  async list(
    @Query() query: ListNotebookDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: NotebookPage }> {
    return { data: await this.notebook.list(user.userId, query) };
  }

  /** 加入生词本（幂等：重复加入返回既有条目且 created=false） */
  @Post()
  @HttpCode(200)
  async add(
    @Body() dto: AddNotebookDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: NotebookAddResponse }> {
    return { data: await this.notebook.add(user.userId, dto) };
  }

  @Delete(':wordId')
  @HttpCode(200)
  async remove(
    @Param('wordId') wordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: { removed: true } }> {
    await this.notebook.remove(user.userId, wordId);
    return { data: { removed: true } };
  }
}
