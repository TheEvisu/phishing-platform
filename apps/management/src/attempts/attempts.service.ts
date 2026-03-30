import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable, Subject, merge, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import axios from 'axios';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { CreatePhishingAttemptDto, BulkPhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { AttemptStatus } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationService } from '../organization/organization.service';

/** In production, strip internal server details from error messages. */
function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV === 'production') return 'Delivery failed';
  return err instanceof Error ? err.message : 'Unknown error';
}

export interface BulkEmailResult {
  email: string;
  success: boolean;
  attemptId: string;
  error?: string;
}

interface StatusEvent {
  attemptId: string;
  status: AttemptStatus;
  organizationId: string;
  createdBy: string;
  email?: string;
  clickedAt?: Date;
}

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@Injectable()
export class AttemptsService {
  private readonly statusBus$ = new Subject<StatusEvent>();

  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
    private orgService: OrganizationService,
  ) {}

  // ─── SSE ──────────────────────────────────────────────────────────────────

  watchAttempts(user: UserCtx): Observable<MessageEvent> {
    const orgId = user.organizationId.toString();

    const events$ = this.statusBus$.pipe(
      filter((e) =>
        e.organizationId === orgId &&
        (user.role === 'org_admin' || e.createdBy === user.username),
      ),
      map((e) => ({
        data: { type: 'status_change', attemptId: e.attemptId, status: e.status, email: e.email, clickedAt: e.clickedAt },
      } as MessageEvent)),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );

    return merge(events$, heartbeat$);
  }

  // ─── Internal (called by Simulation service) ───────────────────────────────

  async updateAttemptStatus(attemptId: string, status: AttemptStatus, clickedAt?: string) {
    const update: Partial<PhishingAttempt> = { status };
    if (clickedAt) update.clickedAt = new Date(clickedAt);

    const attempt = await this.phishingAttemptModel.findOneAndUpdate(
      { attemptId }, update, { new: true },
    );

    if (attempt) {
      this.statusBus$.next({
        attemptId, status,
        organizationId: attempt.organizationId.toString(),
        createdBy: attempt.createdBy,
        email: attempt.email,
        clickedAt: update.clickedAt,
      });
    }

    return attempt;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildFilter(user: UserCtx, extra: Record<string, unknown> = {}) {
    const f: Record<string, unknown> = { organizationId: user.organizationId, ...extra };
    if (user.role !== 'org_admin') f.createdBy = user.username;
    return f;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async getAllAttempts(user: UserCtx, page: number, limit: number, status?: AttemptStatus, email?: string) {
    const f = this.buildFilter(user);
    if (status) f.status = status;
    if (email) f.email = { $regex: email, $options: 'i' };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.phishingAttemptModel.find(f).select('-content').sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.phishingAttemptModel.countDocuments(f),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createAttempt(dto: CreatePhishingAttemptDto, user: UserCtx) {
    const attemptId = uuidv4();
    const attempt = new this.phishingAttemptModel({
      ...dto, attemptId, createdBy: user.username, organizationId: user.organizationId,
    });
    await attempt.save();

    try {
      const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';
      const smtp = await this.orgService.getSmtpForSend(user.organizationId);
      await axios.post(
        `${simulationUrl}/phishing/send`,
        { recipientEmail: dto.email, subject: dto.subject, content: dto.content, attemptId, smtp },
        { timeout: 5_000 },
      );
      return attempt;
    } catch (error) {
      attempt.status = AttemptStatus.FAILED;
      await attempt.save();
      this.statusBus$.next({ attemptId, status: AttemptStatus.FAILED, organizationId: user.organizationId.toString(), createdBy: user.username });
      throw error;
    }
  }

  async bulkCreateAttempts(dto: BulkPhishingAttemptDto, user: UserCtx) {
    const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';
    const smtp = await this.orgService.getSmtpForSend(user.organizationId);

    const results = await Promise.all(
      dto.emails.map(async (email): Promise<BulkEmailResult> => {
        const attemptId = uuidv4();
        const attempt = new this.phishingAttemptModel({
          email, subject: dto.subject, content: dto.content,
          attemptId, createdBy: user.username, organizationId: user.organizationId,
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
          this.statusBus$.next({ attemptId, status: AttemptStatus.FAILED, organizationId: user.organizationId.toString(), createdBy: user.username });
          return { email, success: false, attemptId, error: sanitizeError(err) };
        }
      }),
    );

    const sent   = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return { sent, failed, total: dto.emails.length, results };
  }

  async exportAttempts(user: UserCtx) {
    return this.phishingAttemptModel
      .find(this.buildFilter(user))
      .sort({ createdAt: -1 })
      .select('email subject status attemptId clickedAt createdAt createdBy')
      .lean()
      .exec();
  }

  async getTimeline(user: UserCtx, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const raw = await this.phishingAttemptModel.aggregate([
      { $match: { ...this.buildFilter(user), createdAt: { $gte: since } } },
      {
        $group: {
          _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, status: '$status' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    const map: Record<string, { sent: number; clicked: number; failed: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      map[d.toISOString().slice(0, 10)] = { sent: 0, clicked: 0, failed: 0 };
    }
    for (const row of raw) {
      const { date, status } = row._id as { date: string; status: string };
      if (map[date] && (status === 'sent' || status === 'clicked' || status === 'failed')) {
        map[date][status as 'sent' | 'clicked' | 'failed'] += row.count as number;
      }
    }

    return Object.entries(map).map(([date, counts]) => ({ date, ...counts }));
  }

  async getStats(user: UserCtx) {
    const f = this.buildFilter(user);
    const [total, sent, clicked, failed] = await Promise.all([
      this.phishingAttemptModel.countDocuments(f),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.SENT }),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.CLICKED }),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.FAILED }),
    ]);
    const clickRate = sent + clicked > 0 ? Math.round((clicked / (sent + clicked)) * 100) : 0;
    return { total, sent, clicked, failed, clickRate };
  }

  async getAttemptById(id: string, user: UserCtx) {
    const attempt = await this.phishingAttemptModel.findOne({ _id: id, ...this.buildFilter(user) });
    if (!attempt) throw new NotFoundException('Phishing attempt not found');
    return attempt;
  }

  async deleteAttempt(id: string, user: UserCtx) {
    const attempt = await this.phishingAttemptModel.findOne({ _id: id, ...this.buildFilter(user) });
    if (!attempt) throw new ForbiddenException('Access denied');
    await this.phishingAttemptModel.findByIdAndDelete(id);
    return { message: 'Phishing attempt deleted successfully' };
  }

  async bulkDeleteAttempts(ids: string[], user: UserCtx) {
    const result = await this.phishingAttemptModel.deleteMany({
      _id: { $in: ids },
      ...this.buildFilter(user),
    });
    return { deleted: result.deletedCount };
  }
}
