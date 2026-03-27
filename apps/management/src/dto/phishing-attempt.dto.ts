import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePhishingAttemptDto {
  @ApiProperty({ example: 'target@company.com', description: 'Recipient email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Urgent: Verify your account', description: 'Email subject line' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({
    example: 'Please click {{TRACKING_LINK}} to verify.',
    description: 'Email body. Use {{TRACKING_LINK}} as tracking link placeholder.',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;
}
