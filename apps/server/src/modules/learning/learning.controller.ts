import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type {
  ReviewHistoryPage,
  ReviewStats,
  SpellingErrorSummary,
  SubmitReviewResponse,
} from '@leximochi/types';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { HistoryQueryDto } from './dto/history-query.dto';
import { SpellingErrorsQueryDto } from './dto/spelling-errors.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { LearningService } from './learning.service';

/** 默认返回的错拼词条数（客户端可调小，上限见 LIST_PAGE_MAX） */
const DEFAULT_SPELLING_LIST_LIMIT = 30;

@Controller('review')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /**
   * 提交答题。判定与调度完全在服务端完成；
   * `eventId` 作为幂等键，保证网络重试与离线补传不会重复计分。
   */
  @Post('submit')
  @HttpCode(200)
  async submit(
    @Body() dto: SubmitReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: SubmitReviewResponse }> {
    return {
      data: await this.learning.submit(dto, { userId: user.userId, source: 'web' }),
    };
  }

  /** 错拼清单与分类统计；数据范围严格限定为当前登录用户 */
  @Get('spelling-errors')
  async spellingErrors(
    @Query() query: SpellingErrorsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: SpellingErrorSummary }> {
    return {
      data: await this.learning.listSpellingErrors(
        user.userId,
        query.limit ?? DEFAULT_SPELLING_LIST_LIMIT,
      ),
    };
  }

  /** 复习历史分页（按答题时间倒序，仅本人记录） */
  @Get('history')
  async history(
    @Query() query: HistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: ReviewHistoryPage }> {
    return { data: await this.learning.listHistory(user.userId, query) };
  }

  /** 学习统计：今日量、正确率、平均用时、状态分布、近 7 日趋势 */
  @Get('stats')
  async stats(@CurrentUser() user: AuthenticatedUser): Promise<{ data: ReviewStats }> {
    return { data: await this.learning.getStats(user.userId) };
  }
}
