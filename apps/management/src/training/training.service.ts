import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';

export interface TrainingStatus {
  found: boolean;
  alreadyViewed: boolean;
  viewedAt?: string;
}

@Injectable()
export class TrainingService {
  constructor(
    @InjectModel(PhishingAttempt.name)
    private readonly attemptModel: Model<PhishingAttempt>,
  ) {}

  async getStatus(attemptId: string): Promise<TrainingStatus> {
    const attempt = await this.attemptModel
      .findOne({ attemptId })
      .select('trainingViewedAt')
      .lean()
      .exec();

    if (!attempt) return { found: false, alreadyViewed: false };

    return {
      found: true,
      alreadyViewed: !!attempt.trainingViewedAt,
      viewedAt: attempt.trainingViewedAt?.toISOString(),
    };
  }

  async markViewed(attemptId: string): Promise<{ alreadyViewed: boolean }> {
    const attempt = await this.attemptModel
      .findOne({ attemptId })
      .select('trainingViewedAt')
      .lean()
      .exec();

    // Silent no-op for unknown attemptIds - don't expose whether it exists
    if (!attempt) return { alreadyViewed: false };
    if (attempt.trainingViewedAt) return { alreadyViewed: true };

    await this.attemptModel
      .updateOne({ attemptId }, { $set: { trainingViewedAt: new Date() } })
      .exec();

    return { alreadyViewed: false };
  }
}
