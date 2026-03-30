import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AttemptStatus } from '@app/shared';

/**
 * Simulation DB only tracks delivery status and click events by attemptId.
 * The management DB is the source of truth for all attempt data.
 */
@Schema({ timestamps: true })
export class PhishingAttempt extends Document {
  @Prop({ required: true, unique: true })
  attemptId!: string;

  @Prop({ default: AttemptStatus.SENT, enum: Object.values(AttemptStatus) })
  status!: string;

  @Prop()
  clickedAt?: Date;
}

export const PhishingAttemptSchema = SchemaFactory.createForClass(PhishingAttempt);

PhishingAttemptSchema.index({ attemptId: 1 });
