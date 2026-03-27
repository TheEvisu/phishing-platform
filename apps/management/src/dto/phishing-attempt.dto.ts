import { IsEmail, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePhishingAttemptDto {
  @ApiProperty({ example: 'target@company.com', description: 'Recipient email address', maxLength: 254 })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Urgent: Verify your account', description: 'Email subject line', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    example: 'Please click {{TRACKING_LINK}} to verify.',
    description: 'Email body. Use {{TRACKING_LINK}} as tracking link placeholder.',
    maxLength: 50_000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;
}
