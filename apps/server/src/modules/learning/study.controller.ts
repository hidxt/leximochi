import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { StudyNextResponse } from '@leximochi/types';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { StudyNextDto } from './dto/study-next.dto';
import { StudyService } from './study.service';

@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  /**
   * 取下一题。返回的题目**不包含正确答案**；
   * 同一题目再次提交由 `/review/submit` 判定（服务端权威）。
   */
  @Post('next')
  @HttpCode(200)
  async next(
    @Body() dto: StudyNextDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: StudyNextResponse }> {
    return { data: await this.study.next(user.userId, dto) };
  }
}
