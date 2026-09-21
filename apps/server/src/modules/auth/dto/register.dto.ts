import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@leximochi/types';
import { CaptchaAnswerDto } from './captcha.dto';

export class RegisterDto extends CaptchaAnswerDto {
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
