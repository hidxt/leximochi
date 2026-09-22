import { IsString, MaxLength, MinLength } from 'class-validator';

export class BanUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}
