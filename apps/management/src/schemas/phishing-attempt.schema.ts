import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AttemptStatus } from '@app/shared';

@Schema({ timestamps: true })
export class PhishingAttempt extends Document {
  @Prop({ required: true })
  email!: string;

  @Prop()
  subject!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: AttemptStatus.SENT, enum: Object.values(AttemptStatus) })
  status!: string;

  @Prop()
  clickedAt?: Date;

  @Prop({ required: true, unique: true })
  attemptId!: string;

  @Prop({ required: true })
  createdBy!: string;
}

export const PhishingAttemptSchema = SchemaFactory.createForClass(PhishingAttempt);

// Optimises getAllAttempts: find({ createdBy }).sort({ createdAt: -1 }) + countDocuments({ createdBy })
PhishingAttemptSchema.index({ createdBy: 1, createdAt: -1 });
