import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

// ─── Create ───────────────────────────────────────────────────────────────────

export class CreateRecipientDto {
  @ApiProperty({ example: 'alice@company.com' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email!: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ example: ['vip', 'executive'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

// ─── Update ───────────────────────────────────────────────────────────────────

export class UpdateRecipientDto {
  @ApiPropertyOptional({ example: 'alice@company.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email?: string;

  @ApiPropertyOptional({ example: 'Alice' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ example: ['vip'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

// ─── Bulk import ──────────────────────────────────────────────────────────────

export class ImportRecipientsDto {
  @ApiProperty({ type: [CreateRecipientDto], minItems: 1, maxItems: 2000 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipientDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  recipients!: CreateRecipientDto[];
}

// ─── Bulk delete ──────────────────────────────────────────────────────────────

export class BulkDeleteRecipientsDto {
  @ApiProperty({ example: ['507f1f77bcf86cd799439011'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  ids!: string[];
}

// ─── Query ────────────────────────────────────────────────────────────────────

export class RecipientQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'alice', description: 'Search by email, first or last name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 'Engineering', description: 'Filter by department' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
