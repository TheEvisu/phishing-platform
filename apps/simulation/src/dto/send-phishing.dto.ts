import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPhishingDto {
  @ApiProperty({ example: 'target@company.com' })
  @IsEmail()
  @IsNotEmpty()
  recipientEmail!: string;

  @ApiProperty({ example: 'Urgent: Verify your account' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ example: 'Click {{TRACKING_LINK}} to verify.' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  @IsNotEmpty()
  attemptId!: string;
}
