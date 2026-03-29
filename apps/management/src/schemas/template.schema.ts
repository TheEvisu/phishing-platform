import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Template extends Document {
  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ required: true, maxlength: 200 })
  subject!: string;

  @Prop({ required: true, maxlength: 50_000 })
  content!: string;

  @Prop({ required: true, maxlength: 50 })
  category!: string;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
