import { IsString, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const TEMPLATE_CATEGORIES = ['IT', 'HR', 'Finance', 'Executive'] as const;

export class CreateTemplateDto {
  @ApiProperty({ example: 'Password Expiry Warning', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Action Required: Your Password Expires in 24 Hours', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    example: 'Your password will expire soon. Click {{TRACKING_LINK}} to reset it.',
    maxLength: 50_000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;

  @ApiProperty({ example: 'IT', enum: TEMPLATE_CATEGORIES })
  @IsString()
  @IsIn(TEMPLATE_CATEGORIES as unknown as string[])
  category!: string;
}
