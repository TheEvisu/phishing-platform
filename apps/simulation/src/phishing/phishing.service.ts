import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { SendPhishingDto } from '../dto/send-phishing.dto';
import { AttemptStatus } from '@app/shared';

@Injectable()
export class PhishingService {
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
      const trackingUrl = `${
        process.env.APP_URL || 'http://localhost:3001'
      }/phishing/click/${attemptId}`;

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
    const attempt = await this.phishingAttemptModel.findOne({ attemptId });

    if (attempt) {
      attempt.status = AttemptStatus.CLICKED;
      attempt.clickedAt = new Date();
      await attempt.save();
    }

    return attempt;
  }
}
