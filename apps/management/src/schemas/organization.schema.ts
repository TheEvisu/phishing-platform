import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Organization extends Document {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  slug!: string;

  @Prop({ required: true, unique: true })
  inviteCode!: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
