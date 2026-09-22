import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Permission, type AdminUserPage, type AdminUserSummary, type AuditLogPage } from '@leximochi/types';
import { RequirePermissions, CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import type { RequestWithId } from '../../common/middleware/request-context.middleware';
import { AdminService, type AdminRequestContext } from './admin.service';
import { BanUserDto } from './dto/ban-user.dto';
import { ListAuditDto, ListUsersDto } from './dto/list-users.dto';

function toContext(req: RequestWithId): AdminRequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @RequirePermissions(Permission.AdminUsersRead)
  @Get('users')
  async listUsers(@Query() query: ListUsersDto): Promise<{ data: AdminUserPage }> {
    return { data: await this.admin.listUsers(query) };
  }

  @RequirePermissions(Permission.AdminUsersRead)
  @Get('users/:id')
  async getUser(@Param('id') id: string): Promise<{ data: AdminUserSummary }> {
    return { data: await this.admin.getUser(id) };
  }

  @RequirePermissions(Permission.AdminUsersBan)
  @Post('users/:id/ban')
  @HttpCode(200)
  async ban(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ): Promise<{ data: { ok: boolean } }> {
    await this.admin.banUser(actor, id, dto.reason, toContext(req));
    return { data: { ok: true } };
  }

  @RequirePermissions(Permission.AdminUsersBan)
  @Post('users/:id/unban')
  @HttpCode(200)
  async unban(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: RequestWithId,
  ): Promise<{ data: { ok: boolean } }> {
    await this.admin.unbanUser(actor, id, toContext(req));
    return { data: { ok: true } };
  }

  @RequirePermissions(Permission.AdminAuditRead)
  @Get('audit-logs')
  async auditLogs(@Query() query: ListAuditDto): Promise<{ data: AuditLogPage }> {
    return { data: await this.admin.listAuditLogs(query) };
  }
}
