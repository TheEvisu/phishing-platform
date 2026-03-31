import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ClickBeaconDto {
  @IsOptional() @IsString() @MaxLength(20)
  screenResolution?: string;

  @IsOptional() @IsString() @MaxLength(20)
  viewportSize?: string;

  @IsOptional() @IsString() @MaxLength(60)
  timezone?: string;

  @IsOptional() @IsString() @MaxLength(30)
  language?: string;

  @IsOptional() @IsString() @MaxLength(200)
  languages?: string;

  @IsOptional() @IsString() @MaxLength(60)
  platform?: string;

  @IsOptional() @IsInt() @Min(1) @Max(256)
  cpuCores?: number;

  @IsOptional() @IsInt() @Min(1) @Max(64)
  colorDepth?: number;

  @IsOptional() @IsBoolean()
  touchSupport?: boolean;

  @IsOptional() @IsBoolean()
  doNotTrack?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  webglVendor?: string;

  @IsOptional() @IsString() @MaxLength(300)
  webglRenderer?: string;

  @IsOptional() @IsString() @MaxLength(64)
  canvasFingerprint?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(128)
  deviceMemory?: number;

  @IsOptional() @IsNumber() @Min(0.1) @Max(10)
  devicePixelRatio?: number;

  @IsOptional() @IsString() @MaxLength(20)
  connectionType?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(10000)
  connectionDownlink?: number;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  connectionRtt?: number;

  @IsOptional() @IsString() @MaxLength(500)
  plugins?: string;

  @IsOptional() @IsString() @MaxLength(50)
  orientation?: string;

  @IsOptional() @IsBoolean()
  pdfViewerEnabled?: boolean;

  @IsOptional() @IsString() @MaxLength(45)
  localIp?: string;
}
