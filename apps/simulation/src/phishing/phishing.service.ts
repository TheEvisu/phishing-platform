import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import { UAParser } from 'ua-parser-js';
import { Request } from 'express';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { SendPhishingDto, SmtpPayloadDto } from '../dto/send-phishing.dto';
import { ClickBeaconDto } from '../dto/click-beacon.dto';
import { AttemptStatus } from '@app/shared';


export interface ClickMetadata {
  // Server-side
  ip?: string;
  userAgent?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: string;
  language?: string;
  referer?: string;
  // Client-side
  screenResolution?: string;
  viewportSize?: string;
  timezone?: string;
  platform?: string;
  cpuCores?: number;
  colorDepth?: number;
  touchSupport?: boolean;
  doNotTrack?: boolean;
  languages?: string;
  webglVendor?: string;
  webglRenderer?: string;
  canvasFingerprint?: string;
  deviceMemory?: number;
  devicePixelRatio?: number;
  connectionType?: string;
  connectionDownlink?: number;
  connectionRtt?: number;
  plugins?: string;
  orientation?: string;
  pdfViewerEnabled?: boolean;
  localIp?: string;
}


function extractIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0];
    return first.trim();
  }
  return req.ip ?? (req.socket as { remoteAddress?: string })?.remoteAddress;
}

function extractLanguage(header?: string): string | undefined {
  if (!header) return undefined;
  // "en-US,en;q=0.9,ru;q=0.8" → "en-US"
  return header.split(',')[0]?.split(';')[0]?.trim();
}

function cleanReferer(ref?: string): string | undefined {
  if (!ref) return undefined;
  try {
    const url = new URL(ref);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function parseUserAgent(ua: string): Pick<ClickMetadata, 'browser' | 'browserVersion' | 'os' | 'osVersion' | 'deviceType'> {
  const result = new UAParser(ua).getResult();
  return {
    browser:        result.browser.name,
    browserVersion: result.browser.version,
    os:             result.os.name,
    osVersion:      result.os.version,
    deviceType:     result.device.type ?? 'desktop',
  };
}


@Injectable()
export class PhishingService {
  private readonly logger = new Logger(PhishingService.name);
  private readonly fallbackTransporter: nodemailer.Transporter;

  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
  ) {
    this.fallbackTransporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  private buildTransporter(smtp: SmtpPayloadDto): nodemailer.Transporter {
    return nodemailer.createTransport({
      host:   smtp.host,
      port:   smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    });
  }

  private buildFromAddress(smtp?: SmtpPayloadDto): string {
    if (!smtp) return process.env.SMTP_FROM || 'noreply@phishingtest.com';
    return smtp.fromName
      ? `"${smtp.fromName}" <${smtp.fromAddress}>`
      : smtp.fromAddress;
  }


  async sendPhishingEmail(sendPhishingDto: SendPhishingDto) {
    const { recipientEmail, subject, content, attemptId, smtp } = sendPhishingDto;

    const phishingAttempt = new this.phishingAttemptModel({
      attemptId,
      status: AttemptStatus.SENT,
    });

    const transporter = smtp ? this.buildTransporter(smtp) : this.fallbackTransporter;

    try {
      const trackingUrl = `${process.env.APP_URL || 'http://localhost:3000'}/phishing/click/${attemptId}`;
      const emailContent = content.replace(
        '{{TRACKING_LINK}}',
        `<a href="${trackingUrl}">Click here to verify your account</a>`,
      );

      await transporter.sendMail({
        from:    this.buildFromAddress(smtp),
        to:      recipientEmail,
        subject,
        html:    emailContent,
      });

      await phishingAttempt.save();
      return { success: true, attemptId };
    } catch (error) {
      phishingAttempt.status = AttemptStatus.FAILED;
      await phishingAttempt.save();
      throw error;
    } finally {
      if (smtp) transporter.close();
    }
  }


  async trackClick(attemptId: string, req: Request): Promise<{ metadata: ClickMetadata }> {
    const clickedAt  = new Date();
    const userAgent  = req.headers['user-agent'] ?? '';
    const parsedUa   = parseUserAgent(userAgent);

    const metadata: ClickMetadata = {
      ip:             extractIp(req),
      userAgent,
      language:       extractLanguage(req.headers['accept-language']),
      referer:        cleanReferer(req.headers['referer'] as string | undefined),
      ...parsedUa,
    };

    await this.phishingAttemptModel.findOneAndUpdate(
      { attemptId },
      { status: AttemptStatus.CLICKED, clickedAt, clickMetadata: metadata },
      { new: true },
    );

    // Notify management immediately with server-side data
    this.notifyManagement(attemptId, AttemptStatus.CLICKED, clickedAt, metadata).catch((err) => {
      this.logger.warn(`Failed to notify management of click for ${attemptId}: ${err?.message}`);
    });

    return { metadata };
  }


  async mergeBeaconData(attemptId: string, dto: ClickBeaconDto): Promise<void> {
    const clientData: Partial<ClickMetadata> = {
      screenResolution:  dto.screenResolution,
      viewportSize:      dto.viewportSize,
      timezone:          dto.timezone,
      language:          dto.language ?? undefined,
      languages:         dto.languages,
      platform:          dto.platform,
      cpuCores:          dto.cpuCores,
      colorDepth:        dto.colorDepth,
      touchSupport:      dto.touchSupport,
      doNotTrack:        dto.doNotTrack,
      webglVendor:       dto.webglVendor,
      webglRenderer:     dto.webglRenderer,
      canvasFingerprint: dto.canvasFingerprint,
      deviceMemory:      dto.deviceMemory,
      devicePixelRatio:  dto.devicePixelRatio,
      connectionType:    dto.connectionType,
      connectionDownlink: dto.connectionDownlink,
      connectionRtt:     dto.connectionRtt,
      plugins:           dto.plugins,
      orientation:       dto.orientation,
      pdfViewerEnabled:  dto.pdfViewerEnabled,
      localIp:           dto.localIp,
    };

    // Remove undefined keys
    (Object.keys(clientData) as (keyof ClickMetadata)[]).forEach((k) => {
      if (clientData[k] === undefined) delete clientData[k];
    });

    const attempt = await this.phishingAttemptModel
      .findOneAndUpdate(
        { attemptId },
        { $set: Object.fromEntries(Object.entries(clientData).map(([k, v]) => [`clickMetadata.${k}`, v])) },
        { new: true },
      )
      .lean()
      .exec();

    if (attempt?.clickMetadata) {
      // Re-notify management with the complete merged metadata
      this.notifyManagement(
        attemptId,
        AttemptStatus.CLICKED,
        attempt.clickedAt,
        attempt.clickMetadata as ClickMetadata,
      ).catch((err) => {
        this.logger.warn(`Failed to sync beacon data to management for ${attemptId}: ${err?.message}`);
      });
    }
  }


  private async notifyManagement(
    attemptId: string,
    status: AttemptStatus,
    clickedAt?: Date,
    clickMetadata?: ClickMetadata,
  ) {
    const managementUrl = process.env.MANAGEMENT_URL || 'http://localhost:3001';
    const secret        = process.env.INTERNAL_SECRET;

    await axios.patch(
      `${managementUrl}/attempts/internal/${attemptId}/status`,
      {
        status,
        clickedAt:     clickedAt?.toISOString(),
        clickMetadata: clickMetadata ?? undefined,
      },
      {
        timeout: 3_000,
        headers: secret ? { 'x-service-key': secret } : {},
      },
    );
  }
}
