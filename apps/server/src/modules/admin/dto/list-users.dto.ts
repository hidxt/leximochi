import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  query?: string;

  @IsOptional()
  @IsIn(['active', 'banned'])
  status?: 'active' | 'banned';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;
}

export class ListAuditDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  targetType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;
}
