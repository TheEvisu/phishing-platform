import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface CampaignStats {
  sent: number;
  clicked: number;
  failed: number;
}

@Schema({ timestamps: true, versionKey: false })
export class Campaign extends Document {
  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  totalEmails!: number;

  @Prop({ type: Types.ObjectId, ref: 'Template' })
  templateId?: Types.ObjectId;

  // Stored once per campaign to avoid duplicating content across all attempt documents
  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  content!: string;

  // Denormalized counters - updated atomically via $inc on status transitions
  @Prop({
    type: { sent: Number, clicked: Number, failed: Number },
    default: () => ({ sent: 0, clicked: 0, failed: 0 }),
  })
  stats!: CampaignStats;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.index({ organizationId: 1, createdAt: -1 });
CampaignSchema.index({ organizationId: 1, createdBy: 1, createdAt: -1 });
