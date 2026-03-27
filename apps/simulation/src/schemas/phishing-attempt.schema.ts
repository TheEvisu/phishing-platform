import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AttemptStatus } from '@app/shared';

@Schema({ timestamps: true })
export class PhishingAttempt extends Document {
  @Prop({ required: true })
  recipientEmail!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: AttemptStatus.SENT, enum: Object.values(AttemptStatus) })
  status!: string;

  @Prop()
  clickedAt?: Date;

  @Prop({ required: true, unique: true })
  attemptId!: string;
}

export const PhishingAttemptSchema = SchemaFactory.createForClass(PhishingAttempt);
