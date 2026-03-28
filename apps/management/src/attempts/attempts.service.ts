import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, Subject, merge, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import axios from 'axios';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { CreatePhishingAttemptDto, BulkPhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { AttemptStatus } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';

interface StatusEvent {
  attemptId: string;
  status: AttemptStatus;
  createdBy: string;
  email?: string;
  clickedAt?: Date;
}

@Injectable()
export class AttemptsService {
  // In-memory event bus — broadcasts status changes to all active SSE connections.
  private readonly statusBus$ = new Subject<StatusEvent>();

  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
  ) {}

  // ─── SSE stream ───────────────────────────────────────────────────────────

  /** Returns an Observable that emits MessageEvents for a specific user's attempts.
   *  A heartbeat fires every 25 s to prevent proxy timeouts. */
  watchAttempts(username: string): Observable<MessageEvent> {
    const events$ = this.statusBus$.pipe(
      filter((e) => e.createdBy === username),
      map((e) => ({
        data: { type: 'status_change', attemptId: e.attemptId, status: e.status, email: e.email, clickedAt: e.clickedAt },
      } as MessageEvent)),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );

    return merge(events$, heartbeat$);
  }

  // ─── Internal status update (called by Simulation service) ────────────────

  async updateAttemptStatus(attemptId: string, status: AttemptStatus, clickedAt?: string) {
    const update: Partial<PhishingAttempt> = { status };
    if (clickedAt) update.clickedAt = new Date(clickedAt);

    const attempt = await this.phishingAttemptModel.findOneAndUpdate(
      { attemptId },
      update,
      { new: true },
    );

    if (attempt) {
      this.statusBus$.next({
        attemptId,
        status,
        createdBy: attempt.createdBy,
        email: attempt.email,
        clickedAt: update.clickedAt,
      });
    }

    return attempt;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async getAllAttempts(
    username: string,
    page: number,
    limit: number,
    status?: AttemptStatus,
    email?: string,
  ) {
    const f: Record<string, unknown> = { createdBy: username };
    if (status) f.status = status;
    if (email) f.email = { $regex: email, $options: 'i' };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.phishingAttemptModel.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.phishingAttemptModel.countDocuments(f),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createAttempt(createAttemptDto: CreatePhishingAttemptDto, username: string) {
    const attemptId = uuidv4();

    const attempt = new this.phishingAttemptModel({
      ...createAttemptDto,
      attemptId,
      createdBy: username,
    });
    await attempt.save();

    try {
      const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';
      await axios.post(
        `${simulationUrl}/phishing/send`,
        { recipientEmail: createAttemptDto.email, subject: createAttemptDto.subject, content: createAttemptDto.content, attemptId },
        { timeout: 5_000 },
      );
      return attempt;
    } catch (error) {
      attempt.status = AttemptStatus.FAILED;
      await attempt.save();
      this.statusBus$.next({ attemptId, status: AttemptStatus.FAILED, createdBy: username });
      throw error;
    }
  }

  async bulkCreateAttempts(dto: BulkPhishingAttemptDto, username: string) {
    const simulationUrl = process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';

    const results = await Promise.allSettled(
      dto.emails.map(async (email) => {
        const attemptId = uuidv4();
        const attempt = new this.phishingAttemptModel({
          email, subject: dto.subject, content: dto.content, attemptId, createdBy: username,
        });
        await attempt.save();

        try {
          await axios.post(
            `${simulationUrl}/phishing/send`,
            { recipientEmail: email, subject: dto.subject, content: dto.content, attemptId },
            { timeout: 5_000 },
          );
          return attempt;
        } catch {
          attempt.status = AttemptStatus.FAILED;
          await attempt.save();
          this.statusBus$.next({ attemptId, status: AttemptStatus.FAILED, createdBy: username });
          return attempt;
        }
      }),
    );

    const sent   = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { sent, failed, total: dto.emails.length };
  }

  async exportAttempts(username: string) {
    return this.phishingAttemptModel
      .find({ createdBy: username })
      .sort({ createdAt: -1 })
      .select('email subject status attemptId clickedAt createdAt')
      .lean()
      .exec();
  }

  async getTimeline(username: string, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const raw = await this.phishingAttemptModel.aggregate([
      { $match: { createdBy: username, createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Build a full date range with zeros for missing days
    const map: Record<string, { sent: number; clicked: number; failed: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { sent: 0, clicked: 0, failed: 0 };
    }

    for (const row of raw) {
      const { date, status } = row._id as { date: string; status: string };
      if (map[date] && (status === 'sent' || status === 'clicked' || status === 'failed')) {
        map[date][status as 'sent' | 'clicked' | 'failed'] += row.count as number;
      }
    }

    return Object.entries(map).map(([date, counts]) => ({ date, ...counts }));
  }

  async getStats(username: string) {
    const f = { createdBy: username };
    const [total, sent, clicked, failed] = await Promise.all([
      this.phishingAttemptModel.countDocuments(f),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.SENT }),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.CLICKED }),
      this.phishingAttemptModel.countDocuments({ ...f, status: AttemptStatus.FAILED }),
    ]);
    const clickRate = sent + clicked > 0 ? Math.round((clicked / (sent + clicked)) * 100) : 0;
    return { total, sent, clicked, failed, clickRate };
  }

  async getAttemptById(id: string, username: string) {
    const attempt = await this.phishingAttemptModel.findById(id);
    if (!attempt) throw new NotFoundException('Phishing attempt not found');
    if (attempt.createdBy !== username) throw new ForbiddenException('Access denied');
    return attempt;
  }

  async deleteAttempt(id: string, username: string) {
    const attempt = await this.phishingAttemptModel.findById(id);
    if (!attempt) throw new NotFoundException('Phishing attempt not found');
    if (attempt.createdBy !== username) throw new ForbiddenException('Access denied');
    await this.phishingAttemptModel.findByIdAndDelete(id);
    return { message: 'Phishing attempt deleted successfully' };
  }

  async bulkDeleteAttempts(ids: string[], username: string) {
    const result = await this.phishingAttemptModel.deleteMany({
      _id: { $in: ids },
      createdBy: username,
    });
    return { deleted: result.deletedCount };
  }
}
