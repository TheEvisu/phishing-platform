import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface LookalikeDomain {
  domain: string;
  technique: string;
  registered: boolean;
  hasA: boolean;
  hasMx: boolean;
}

@Schema({ timestamps: true, versionKey: false })
export class DomainScan extends Document {
  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  targetDomain!: string;

  @Prop({ type: [Object], default: [] })
  results!: LookalikeDomain[];

  @Prop({ default: 0 })
  totalChecked!: number;

  @Prop({ default: 0 })
  totalFound!: number;
}

export const DomainScanSchema = SchemaFactory.createForClass(DomainScan);
DomainScanSchema.index({ organizationId: 1, createdAt: -1 });
