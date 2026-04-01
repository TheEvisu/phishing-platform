import { IsEmail, IsString, IsNotEmpty, MaxLength, IsArray, ArrayMinSize, ArrayMaxSize, IsIn, IsOptional, IsDateString, IsMongoId, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttemptStatus } from '@app/shared';

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

export class BulkPhishingAttemptDto {
  @ApiProperty({
    example: ['alice@company.com', 'bob@company.com'],
    description: 'List of recipient email addresses (1–500)',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  emails!: string[];

  @ApiProperty({ example: 'Urgent: Verify your account', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    example: 'Please click {{TRACKING_LINK}} to verify.',
    maxLength: 50_000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  content!: string;
}

export class BulkDeleteDto {
  @ApiProperty({ type: [String], description: 'Array of attempt MongoDB IDs to delete' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  ids!: string[];
}

export class UpdateAttemptStatusDto {
  @ApiProperty({ enum: AttemptStatus, example: AttemptStatus.CLICKED })
  @IsIn(Object.values(AttemptStatus))
  status!: AttemptStatus;

  @ApiProperty({ required: false, example: '2026-03-28T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  clickedAt?: string;

  @ApiProperty({ required: false, example: '2026-03-28T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  openedAt?: string;

  @ApiProperty({ required: false, description: 'Click fingerprint data from Simulation service' })
  @IsOptional()
  @IsObject()
  clickMetadata?: Record<string, unknown>;
}
