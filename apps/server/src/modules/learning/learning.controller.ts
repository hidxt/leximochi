import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { SubmitReviewResponse } from '@leximochi/types';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { LearningService } from './learning.service';

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
}
