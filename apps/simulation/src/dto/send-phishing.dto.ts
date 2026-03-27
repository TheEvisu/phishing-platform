import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class SendPhishingDto {
  @IsEmail()
  @IsNotEmpty()
  recipientEmail!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsNotEmpty()
  attemptId!: string;
}
