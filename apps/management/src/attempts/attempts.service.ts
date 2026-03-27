import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { CreatePhishingAttemptDto, BulkPhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { AttemptStatus } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AttemptsService {
  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
  ) {}

  async getAllAttempts(username: string, page: number, limit: number) {
    const filter = { createdBy: username };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.phishingAttemptModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.phishingAttemptModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
      const simulationServiceUrl =
        process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';
      await axios.post(
        `${simulationServiceUrl}/phishing/send`,
        {
          recipientEmail: createAttemptDto.email,
          subject: createAttemptDto.subject,
          content: createAttemptDto.content,
          attemptId,
        },
        { timeout: 5_000 },
      );

      return attempt;
    } catch (error) {
      attempt.status = AttemptStatus.FAILED;
      await attempt.save();
      throw error;
    }
  }

  async getAttemptById(id: string, username: string) {
    const attempt = await this.phishingAttemptModel.findById(id);
    if (!attempt) {
      throw new NotFoundException('Phishing attempt not found');
    }
    if (attempt.createdBy !== username) {
      throw new ForbiddenException('Access denied');
    }
    return attempt;
  }

  async bulkCreateAttempts(dto: BulkPhishingAttemptDto, username: string) {
    const simulationServiceUrl =
      process.env.PHISHING_SIMULATION_URL || 'http://localhost:3000';

    const results = await Promise.allSettled(
      dto.emails.map(async (email) => {
        const attemptId = uuidv4();
        const attempt = new this.phishingAttemptModel({
          email,
          subject: dto.subject,
          content: dto.content,
          attemptId,
          createdBy: username,
        });
        await attempt.save();

        try {
          await axios.post(
            `${simulationServiceUrl}/phishing/send`,
            { recipientEmail: email, subject: dto.subject, content: dto.content, attemptId },
            { timeout: 5_000 },
          );
          return attempt;
        } catch {
          attempt.status = AttemptStatus.FAILED;
          await attempt.save();
          return attempt;
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { sent, failed, total: dto.emails.length };
  }

  async getStats(username: string) {
    const filter = { createdBy: username };
    const [total, sent, clicked, failed] = await Promise.all([
      this.phishingAttemptModel.countDocuments(filter),
      this.phishingAttemptModel.countDocuments({ ...filter, status: AttemptStatus.SENT }),
      this.phishingAttemptModel.countDocuments({ ...filter, status: AttemptStatus.CLICKED }),
      this.phishingAttemptModel.countDocuments({ ...filter, status: AttemptStatus.FAILED }),
    ]);

    const clickRate =
      sent + clicked > 0 ? Math.round((clicked / (sent + clicked)) * 100) : 0;

    return { total, sent, clicked, failed, clickRate };
  }

  async deleteAttempt(id: string, username: string) {
    const attempt = await this.phishingAttemptModel.findById(id);
    if (!attempt) {
      throw new NotFoundException('Phishing attempt not found');
    }
    if (attempt.createdBy !== username) {
      throw new ForbiddenException('Access denied');
    }
    await this.phishingAttemptModel.findByIdAndDelete(id);
    return { message: 'Phishing attempt deleted successfully' };
  }
}
