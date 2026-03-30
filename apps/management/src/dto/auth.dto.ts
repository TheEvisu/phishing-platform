import { IsEmail, IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterOrgDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationName!: string;

  @ApiProperty({ example: 'john_doe', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'john@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'strongpassword123', minLength: 6, maxLength: 128 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'INV-XXXXXX' })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;

  @ApiProperty({ example: 'jane_doe', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'jane@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'strongpassword123', minLength: 6, maxLength: 128 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentpassword123', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ example: 'newstrongpassword456', minLength: 6, maxLength: 128 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john_doe', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'strongpassword123', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
