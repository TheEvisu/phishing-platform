import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class CreatePhishingAttemptDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}
