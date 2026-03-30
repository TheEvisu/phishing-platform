import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface SmtpConfigDoc {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEncrypted: string;
  fromAddress: string;
  fromName?: string;
}

@Schema({ timestamps: true, versionKey: false })
export class Organization extends Document {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  slug!: string;

  @Prop({ required: true, unique: true })
  inviteCode!: string;

  @Prop({
    type: {
      host:              { type: String },
      port:              { type: Number },
      secure:            { type: Boolean },
      user:              { type: String },
      passwordEncrypted: { type: String },
      fromAddress:       { type: String },
      fromName:          { type: String },
    },
    _id: false,
  })
  smtpConfig?: SmtpConfigDoc;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
