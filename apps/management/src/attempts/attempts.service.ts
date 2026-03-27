import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { PhishingAttempt } from '../schemas/phishing-attempt.schema';
import { CreatePhishingAttemptDto } from '../dto/phishing-attempt.dto';
import { AttemptStatus } from '@app/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AttemptsService {
  constructor(
    @InjectModel(PhishingAttempt.name)
    private phishingAttemptModel: Model<PhishingAttempt>,
  ) {}

  async getAllAttempts() {
    return await this.phishingAttemptModel.find().sort({ createdAt: -1 }).exec();
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
      await axios.post(`${simulationServiceUrl}/phishing/send`, {
        recipientEmail: createAttemptDto.email,
        content: createAttemptDto.content,
        attemptId,
      });

      return attempt;
    } catch (error) {
      attempt.status = AttemptStatus.FAILED;
      await attempt.save();
      throw error;
    }
  }

  async getAttemptById(id: string) {
    const attempt = await this.phishingAttemptModel.findById(id);
    if (!attempt) {
      throw new NotFoundException('Phishing attempt not found');
    }
    return attempt;
  }

  async deleteAttempt(id: string) {
    const attempt = await this.phishingAttemptModel.findByIdAndDelete(id);
    if (!attempt) {
      throw new NotFoundException('Phishing attempt not found');
    }
    return { message: 'Phishing attempt deleted successfully' };
  }
}
