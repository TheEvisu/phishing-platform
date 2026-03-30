import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SmtpPayloadDto {
  @IsString() @IsNotEmpty() host!: string;
  @IsInt() @Min(1) @Max(65535) @Type(() => Number) port!: number;
  @IsBoolean() secure!: boolean;
  @IsString() @IsNotEmpty() user!: string;
  @IsString() @IsNotEmpty() password!: string;
  @IsEmail() fromAddress!: string;
  @IsOptional() @IsString() fromName?: string;
}

export class SendPhishingDto {
  @ApiProperty({ example: 'target@company.com', maxLength: 254 })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  recipientEmail!: string;

  @ApiProperty({ example: 'Urgent: Verify your account', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ example: 'Click {{TRACKING_LINK}} to verify.', maxLength: 50_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', maxLength: 36 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  attemptId!: string;

  @ApiProperty({ required: false, description: 'Per-org SMTP config. Falls back to env vars if omitted.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmtpPayloadDto)
  smtp?: SmtpPayloadDto;
}
