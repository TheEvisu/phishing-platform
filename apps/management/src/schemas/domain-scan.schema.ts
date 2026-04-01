import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface LookalikeDomain {
  domain: string;
  technique: string;
  registered: boolean;
  hasA: boolean;
  hasMx: boolean;
}

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

@Schema({ timestamps: true, versionKey: false })
export class DomainScan extends Document {
  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  targetDomain!: string;

  @Prop({ enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' })
  status!: ScanStatus;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({ type: [Object], default: [] })
  results!: LookalikeDomain[];

  @Prop({ default: 0 })
  totalChecked!: number;

  @Prop({ default: 0 })
  totalFound!: number;
}

export const DomainScanSchema = SchemaFactory.createForClass(DomainScan);
DomainScanSchema.index({ organizationId: 1, createdAt: -1 });
