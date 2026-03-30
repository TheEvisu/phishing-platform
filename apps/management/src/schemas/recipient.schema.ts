import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class Recipient extends Document {
  @Prop({ required: true, maxlength: 254, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, maxlength: 100, trim: true })
  firstName!: string;

  @Prop({ required: true, maxlength: 100, trim: true })
  lastName!: string;

  @Prop({ maxlength: 100, trim: true })
  department?: string;

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  createdBy!: string;
}

export const RecipientSchema = SchemaFactory.createForClass(Recipient);

// Unique email per organisation
RecipientSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// Department filtering & distinct
RecipientSchema.index({ organizationId: 1, department: 1 });
// Default sort
RecipientSchema.index({ organizationId: 1, createdAt: -1 });
