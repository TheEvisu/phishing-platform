import { IsString, IsNotEmpty, IsOptional, IsArray, IsEmail, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LaunchCampaignDto {
  @ApiProperty({ example: 'Q1 Security Awareness', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: ['alice@company.com', 'bob@company.com'], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  emails!: string[];

  @ApiProperty({ example: 'Action Required: Your Password Expires in 24 Hours', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ maxLength: 50_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;

  @ApiPropertyOptional({ description: 'Template ID used as source (for reference)' })
  @IsOptional()
  @IsString()
  templateId?: string;
}
