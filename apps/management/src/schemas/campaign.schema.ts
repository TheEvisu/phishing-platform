import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.index({ organizationId: 1, createdAt: -1 });
CampaignSchema.index({ organizationId: 1, createdBy: 1, createdAt: -1 });
