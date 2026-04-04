import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OsintScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SubdomainEntry {
  subdomain: string;
  firstSeen?: string;
  hasA: boolean;
  ip?: string;
}

export interface DnsSecurity {
  spf?: string;
  spfValid: boolean;
  dmarc?: string;
  dmarcPolicy?: string;
  mxRecords: string[];
  nameservers: string[];
}

export interface SecurityHeaderResult {
  present: boolean;
  value?: string;
  pass: boolean;
  note?: string;
}

export interface SecurityHeadersResult {
  headers: Record<string, SecurityHeaderResult>;
  passingCount: number;
  totalChecked: number;
}

export interface TechEntry {
  name: string;
  category: string;
  version?: string;
  confidence: number;
}

export interface GithubExposureEntry {
  repoFullName: string;
  fileUrl: string;
  snippet: string;
  type: string;
}

export interface WaybackResult {
  firstSeen?: string;
  lastSeen?: string;
  totalSnapshots: number;
  yearlyBreakdown: Record<string, number>;
}

export interface WhoisResult {
  registrar?: string;
  registeredAt?: string;
  expiresAt?: string;
  updatedAt?: string;
  nameservers: string[];
  status: string[];
}

export interface SensitiveEndpoint {
  host: string;
  path: string;
  status: number;
  redirectTo?: string;
  /** Inherent risk of this path type */
  risk: string;
  /** Actual risk after accounting for HTTP status (401/403 = protected = lower) */
  effectiveRisk: string;
  note: string;
  /** First 2KB of response body for non-HTML 200 responses */
  responsePreview?: string;
}

export interface EndpointsResult {
  robotsDisallowed: string[];
  sitemapUrls: string[];
  sensitiveEndpoints: SensitiveEndpoint[];
}

export interface MobileApp {
  platform: 'ios' | 'android';
  appId: string;
  name?: string;
  storeUrl?: string;
  deepLinkPaths?: string[];
}

export interface MobileResult {
  apps: MobileApp[];
  hasAppleAssociation: boolean;
  hasAndroidAssociation: boolean;
  appStoreLinksInHtml: string[];
}

export interface CloudResult {
  ip?: string;
  asn?: string;
  org?: string;
  country?: string;
  cloudProvider?: string;
  cname?: string;
  s3BucketExposed: boolean;
}

export interface SslResult {
  valid: boolean;
  expiresAt?: string;
  issuedAt?: string;
  daysUntilExpiry?: number;
  issuer?: string;
  subject?: string;
  sans: string[];
  protocol?: string;
  selfSigned: boolean;
  wildcard: boolean;
}

export interface SecretFinding {
  file: string;
  type: string;
  preview: string;
}

export interface SecretsResult {
  scannedFiles: number;
  jsFiles: string[];
  findings: SecretFinding[];
}

export interface OsintResults {
  subdomains: SubdomainEntry[];
  dns: DnsSecurity | null;
  securityHeaders: SecurityHeadersResult | null;
  techStack: TechEntry[];
  githubExposure: GithubExposureEntry[];
  wayback: WaybackResult | null;
  whois: WhoisResult | null;
  endpoints: EndpointsResult | null;
  mobile: MobileResult | null;
  cloud: CloudResult | null;
  ssl: SslResult | null;
  secrets: SecretsResult | null;
  errors: Record<string, string>;
}

@Schema({ timestamps: true, versionKey: false })
export class OsintScan extends Document {
  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  targetDomain!: string;

  @Prop({ enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' })
  status!: OsintScanStatus;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({ type: Object, default: null })
  results!: OsintResults | null;

  @Prop()
  error?: string;
}

export const OsintScanSchema = SchemaFactory.createForClass(OsintScan);
OsintScanSchema.index({ organizationId: 1, createdAt: -1 });
OsintScanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
