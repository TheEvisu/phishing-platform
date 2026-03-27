import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
