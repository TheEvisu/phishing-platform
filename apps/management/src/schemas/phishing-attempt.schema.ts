import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
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

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;
}

export const PhishingAttemptSchema = SchemaFactory.createForClass(PhishingAttempt);

PhishingAttemptSchema.index({ organizationId: 1, createdAt: -1 });
PhishingAttemptSchema.index({ organizationId: 1, createdBy: 1, createdAt: -1 });
