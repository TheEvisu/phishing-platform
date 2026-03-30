import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class UpdateTemplateDto {
  @ApiPropertyOptional({ example: 'Password Expiry Warning', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Action Required: Your Password Expires in 24 Hours', maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ maxLength: 50_000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content?: string;

  @ApiPropertyOptional({ example: 'IT', enum: TEMPLATE_CATEGORIES })
  @IsOptional()
  @IsString()
  @IsIn(TEMPLATE_CATEGORIES as unknown as string[])
  category?: string;
}
