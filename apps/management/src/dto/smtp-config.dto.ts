import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SmtpConfigDto {
  @ApiProperty({ example: 'smtp.gmail.com', maxLength: 253 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  host!: string;

  @ApiProperty({ example: 587, minimum: 1, maximum: 65535 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port!: number;

  @ApiProperty({ example: false, description: 'Use SSL/TLS (true = port 465, false = STARTTLS)' })
  @IsBoolean()
  secure!: boolean;

  @ApiProperty({ example: 'user@gmail.com', maxLength: 254 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  user!: string;

  @ApiProperty({ example: 'app-password', maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;

  @ApiProperty({ example: 'security@company.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  fromAddress!: string;

  @ApiProperty({ example: 'IT Security Team', maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromName?: string;
}
