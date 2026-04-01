import { IsOptional, IsIn, IsString, MaxLength } from 'class-validator';

const VALID_THEMES = ['light', 'dark', 'system'] as const;
const SUPPORTED_LANGS = ['en', 'ru', 'he', 'es', 'de', 'fr'] as const;

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(VALID_THEMES)
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGS)
  @MaxLength(10)
  language?: string;
}
