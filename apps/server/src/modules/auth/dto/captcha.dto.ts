import { IsString, MaxLength, MinLength } from 'class-validator';

export class CaptchaAnswerDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  captchaToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  captchaAnswer!: string;
}
