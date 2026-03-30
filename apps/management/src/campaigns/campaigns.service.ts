import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Campaign } from '../schemas/campaign.schema';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { LaunchCampaignDto } from '../dto/campaign.dto';
import { AttemptStatus } from '@app/shared';

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
  ) {}

  private buildFilter(user: UserCtx) {
    const f: Record<string, unknown> = { organizationId: user.organizationId };
    if (user.role !== 'org_admin') f.createdBy = user.username;
    return f;
  }

  async launch(dto: LaunchCampaignDto, user: UserCtx) {
    const campaign = new this.campaignModel({
      name: dto.name,
      organizationId: user.organizationId,
      createdBy: user.username,
      totalEmails: dto.emails.length,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
    });
    await campaign.save();

    const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';

    const results = await Promise.all(
      dto.emails.map(async (email): Promise<EmailResult> => {
        const attemptId = uuidv4();
        const attempt = new this.attemptModel({
          email, subject: dto.subject, content: dto.content,
          attemptId, createdBy: user.username,
          organizationId: user.organizationId,
          campaignId: campaign._id,
        });
        await attempt.save();

        try {
          await axios.post(
            `${simulationUrl}/phishing/send`,
            { recipientEmail: email, subject: dto.subject, content: dto.content, attemptId },
            { timeout: 5_000 },
          );
          return { email, success: true, attemptId };
        } catch (err: unknown) {
          attempt.status = AttemptStatus.FAILED;
          await attempt.save();
          const message = err instanceof Error ? err.message : 'Unknown error';
          return { email, success: false, attemptId, error: message };
        }
      }),
    );

    const sent   = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return { campaign, sent, failed, total: dto.emails.length, results };
  }

  async getAll(user: UserCtx) {
    const campaigns = await this.campaignModel
      .find(this.buildFilter(user))
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!campaigns.length) return [];

    const ids = campaigns.map((c) => c._id);
    const stats = await this.attemptModel.aggregate([
      { $match: { campaignId: { $in: ids } } },
      {
        $group: {
          _id: '$campaignId',
          sent:    { $sum: { $cond: [{ $eq: ['$status', AttemptStatus.SENT] },    1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$status', AttemptStatus.CLICKED] }, 1, 0] } },
          failed:  { $sum: { $cond: [{ $eq: ['$status', AttemptStatus.FAILED] },  1, 0] } },
        },
      },
    ]);

    const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));
    return campaigns.map((c) => {
      const s = statsMap.get((c._id as Types.ObjectId).toString()) ?? { sent: 0, clicked: 0, failed: 0 };
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

    return { ...campaign, attempts };
  }

  async delete(id: string, user: UserCtx) {
    const campaign = await this.campaignModel.findOne({ _id: id, ...this.buildFilter(user) });
    if (!campaign) throw new ForbiddenException('Campaign not found or access denied');
    await this.campaignModel.findByIdAndDelete(id);
    return { message: 'Campaign deleted' };
  }
}
