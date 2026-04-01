import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'org_admin' | 'member';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system' | null;
  language: string | null;
}

@Schema({ timestamps: true, versionKey: false })
export class User extends Document {
  @Prop({ required: true, unique: true })
  username!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;

  @Prop({ enum: ['org_admin', 'member'], default: 'member' })
  role!: UserRole;

  @Prop({
    type: { theme: { type: String }, language: { type: String } },
    default: () => ({ theme: null, language: null }),
  })
  preferences!: UserPreferences;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ organizationId: 1 });
