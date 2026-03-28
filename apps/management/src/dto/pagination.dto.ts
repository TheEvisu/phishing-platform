import { IsOptional, IsInt, Min, Max, IsString, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttemptStatus } from '@app/shared';

export class PaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class AttemptsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AttemptStatus, description: 'Filter by status' })
  @IsOptional()
  @IsIn(Object.values(AttemptStatus))
  status?: AttemptStatus;

  @ApiPropertyOptional({ example: 'alice', description: 'Search by recipient email (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;
}
