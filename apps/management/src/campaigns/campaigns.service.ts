import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Campaign } from '../schemas/campaign.schema';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { LaunchCampaignDto } from '../dto/campaign.dto';
import { AttemptStatus } from '@app/shared';
import { OrganizationService } from '../organization/organization.service';

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV === 'production') return 'Delivery failed';
  return err instanceof Error ? err.message : 'Unknown error';
}

export interface EmailResult {
  email: string;
  success: boolean;
  attemptId: string;
  error?: string;
}

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    @InjectModel(PhishingAttempt.name) private attemptModel: Model<PhishingAttempt>,
    private orgService: OrganizationService,
  ) {}

  private buildFilter(user: UserCtx) {
    const f: Record<string, unknown> = { organizationId: user.organizationId };
    if (user.role !== 'org_admin') f.createdBy = user.username;
    return f;
  }

  async launch(dto: LaunchCampaignDto, user: UserCtx) {
    // Subject and content stored once on Campaign, not duplicated per attempt
    const campaign = new this.campaignModel({
      name: dto.name,
      subject: dto.subject,
      content: dto.content,
      organizationId: user.organizationId,
      createdBy: user.username,
      totalEmails: dto.emails.length,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
    });
    await campaign.save();

    const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';
    const smtp = await this.orgService.getSmtpForSend(user.organizationId);

    const results = await Promise.all(
      dto.emails.map(async (email): Promise<EmailResult> => {
        const attemptId = uuidv4();
        // content is omitted - lives on Campaign; subject kept for export/display
        const attempt = new this.attemptModel({
          email,
          subject: dto.subject,
          attemptId,
          createdBy: user.username,
          organizationId: user.organizationId,
          campaignId: campaign._id,
        });
        await attempt.save();

        try {
          await axios.post(
            `${simulationUrl}/phishing/send`,
            { recipientEmail: email, subject: dto.subject, content: dto.content, attemptId, smtp },
            { timeout: 5_000 },
          );
          return { email, success: true, attemptId };
        } catch (err: unknown) {
          attempt.status = AttemptStatus.FAILED;
          await attempt.save();
          // Direct failure (network/timeout) - simulation never called back, update stats inline
          await this.campaignModel.updateOne(
            { _id: campaign._id },
            { $inc: { 'stats.failed': 1 } },
          );
          return { email, success: false, attemptId, error: sanitizeError(err) };
        }
      }),
    );

    const sent   = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return { campaign, sent, failed, total: dto.emails.length, results };
  }

  async getAll(user: UserCtx) {
    // Stats are denormalized onto Campaign - no aggregation needed
    const campaigns = await this.campaignModel
      .find(this.buildFilter(user))
      .select('-content') // content can be large, skip in list view
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return campaigns.map((c) => {
      const s = c.stats ?? { sent: 0, clicked: 0, failed: 0 };
      const clickRate = s.sent + s.clicked > 0
        ? Math.round((s.clicked / (s.sent + s.clicked)) * 100)
        : 0;
      return { ...c, stats: { sent: s.sent, clicked: s.clicked, failed: s.failed, clickRate } };
    });
  }

  async getById(id: string, user: UserCtx) {
    const campaign = await this.campaignModel
      .findOne({ _id: id, ...this.buildFilter(user) })
      .lean()
      .exec();
    if (!campaign) throw new NotFoundException('Campaign not found');

    const attemptFilter: Record<string, unknown> = { campaignId: new Types.ObjectId(id) };
    if (user.role !== 'org_admin') attemptFilter.createdBy = user.username;

    const attempts = await this.attemptModel
      .find(attemptFilter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Inject campaign content into attempts that don't store their own copy
    const campaignContent = campaign.content;
    const enrichedAttempts = attempts.map((a) => ({
      ...a,
      content: a.content ?? campaignContent,
    }));

    return { ...campaign, attempts: enrichedAttempts };
  }

  async delete(id: string, user: UserCtx) {
    const campaign = await this.campaignModel.findOne({ _id: id, ...this.buildFilter(user) });
    if (!campaign) throw new ForbiddenException('Campaign not found or access denied');
    await this.campaignModel.findByIdAndDelete(id);
    return { message: 'Campaign deleted' };
  }
}
