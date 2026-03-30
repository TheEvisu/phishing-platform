import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Client-side fingerprint collected via JS on the intermediate landing page.
 * All fields are optional — we never fail the request if a field is missing.
 */
export class ClickBeaconDto {
  @IsOptional() @IsString() @MaxLength(20)
  screenResolution?: string;   // e.g. "1920x1080"

  @IsOptional() @IsString() @MaxLength(20)
  viewportSize?: string;       // e.g. "1280x720"

  @IsOptional() @IsString() @MaxLength(60)
  timezone?: string;           // e.g. "Europe/Berlin"

  @IsOptional() @IsString() @MaxLength(30)
  language?: string;           // e.g. "en-US"

  @IsOptional() @IsString() @MaxLength(200)
  languages?: string;          // comma-separated

  @IsOptional() @IsString() @MaxLength(60)
  platform?: string;           // e.g. "MacIntel"

  @IsOptional() @IsInt() @Min(1) @Max(256)
  cpuCores?: number;

  @IsOptional() @IsInt() @Min(1) @Max(64)
  colorDepth?: number;

  @IsOptional() @IsBoolean()
  touchSupport?: boolean;

  @IsOptional() @IsBoolean()
  doNotTrack?: boolean;
}
