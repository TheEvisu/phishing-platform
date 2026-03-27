import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
