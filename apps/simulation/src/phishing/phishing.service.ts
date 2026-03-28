import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { SendPhishingDto } from '../dto/send-phishing.dto';
import { AttemptStatus } from '@app/shared';

@Injectable()
export class PhishingService {
  private readonly logger = new Logger(PhishingService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPhishingEmail(sendPhishingDto: SendPhishingDto) {
    const { recipientEmail, subject, content, attemptId } = sendPhishingDto;

    const phishingAttempt = new this.phishingAttemptModel({
      recipientEmail,
      subject,
      content,
      attemptId,
      status: AttemptStatus.SENT,
    });

    try {
      const trackingUrl = `${process.env.APP_URL || 'http://localhost:3000'}/phishing/click/${attemptId}`;
      const emailContent = content.replace(
        '{{TRACKING_LINK}}',
        `<a href="${trackingUrl}">Click here to verify your account</a>`,
      );

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@phishingtest.com',
        to: recipientEmail,
        subject,
        html: emailContent,
      });

      await phishingAttempt.save();
      return { success: true, attemptId };
    } catch (error) {
      phishingAttempt.status = AttemptStatus.FAILED;
      await phishingAttempt.save();
      throw error;
    }
  }

  async trackClick(attemptId: string) {
    const clickedAt = new Date();

    const attempt = await this.phishingAttemptModel.findOneAndUpdate(
      { attemptId },
      { status: AttemptStatus.CLICKED, clickedAt },
      { new: true },
    );

    // Notify Management service so Dashboard updates in real-time via SSE
    this.notifyManagement(attemptId, AttemptStatus.CLICKED, clickedAt).catch((err) => {
      this.logger.warn(`Failed to notify management of click for ${attemptId}: ${err?.message}`);
    });

    return attempt;
  }

  private async notifyManagement(attemptId: string, status: AttemptStatus, clickedAt?: Date) {
    const managementUrl = process.env.MANAGEMENT_URL || 'http://localhost:3001';
    const secret = process.env.INTERNAL_SECRET;

    await axios.patch(
      `${managementUrl}/attempts/internal/${attemptId}/status`,
      { status, clickedAt: clickedAt?.toISOString() },
      {
        timeout: 3_000,
        headers: secret ? { 'x-service-key': secret } : {},
      },
    );
  }
}
