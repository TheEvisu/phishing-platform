import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { Organization } from '../schemas/organization.schema';
import { User } from '../schemas/user.schema';
import { SmtpConfigDto } from '../dto/smtp-config.dto';
import { encrypt, decrypt } from '../common/crypto.util';

export interface SmtpForSend {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<Organization>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getOrg(organizationId: Types.ObjectId) {
    return this.orgModel.findById(organizationId).select('-smtpConfig -__v').lean().exec();
  }

  async getMembers(organizationId: Types.ObjectId) {
    return this.userModel
      .find({ organizationId })
      .select('username email role createdAt')
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async regenerateInviteCode(organizationId: Types.ObjectId, requestingUserRole: string) {
    if (requestingUserRole !== 'org_admin') throw new ForbiddenException('Only org admins can regenerate invite codes');
    const inviteCode = `INV-${randomBytes(4).toString('hex').toUpperCase()}`;
    return this.orgModel.findByIdAndUpdate(organizationId, { inviteCode }, { new: true }).lean().exec();
  }

  async removeMember(organizationId: Types.ObjectId, memberId: string, requestingUserRole: string) {
    if (requestingUserRole !== 'org_admin') throw new ForbiddenException('Only org admins can remove members');
    const member = await this.userModel.findOne({ _id: memberId, organizationId });
    if (!member) throw new ForbiddenException('Member not found in your organization');
    if (member.role === 'org_admin') throw new ForbiddenException('Cannot remove the organization admin');
    await this.userModel.findByIdAndDelete(memberId);
    return { message: 'Member removed' };
  }

  // ─── SMTP ──────────────────────────────────────────────────────────────────

  async getSmtpConfig(organizationId: Types.ObjectId) {
    const org = await this.orgModel.findById(organizationId).lean().exec();
    if (!org?.smtpConfig) return null;
    const { passwordEncrypted, ...rest } = org.smtpConfig;
    return { ...rest, passwordSet: !!passwordEncrypted };
  }

  async saveSmtpConfig(dto: SmtpConfigDto, organizationId: Types.ObjectId, role: string) {
    if (role !== 'org_admin') throw new ForbiddenException('Only org admins can configure SMTP');
    const passwordEncrypted = encrypt(dto.password);
    await this.orgModel.updateOne(
      { _id: organizationId },
      {
        $set: {
          'smtpConfig.host':              dto.host,
          'smtpConfig.port':              dto.port,
          'smtpConfig.secure':            dto.secure,
          'smtpConfig.user':              dto.user,
          'smtpConfig.passwordEncrypted': passwordEncrypted,
          'smtpConfig.fromAddress':       dto.fromAddress,
          'smtpConfig.fromName':          dto.fromName ?? null,
        },
      },
    );
    return { message: 'SMTP configuration saved' };
  }

  async testSmtpConfig(dto: SmtpConfigDto, role: string) {
    if (role !== 'org_admin') throw new ForbiddenException('Only org admins can test SMTP');
    const transporter = nodemailer.createTransport({
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      auth: { user: dto.user, pass: dto.password },
      connectionTimeout: 8_000,
      socketTimeout: 8_000,
    });
    try {
      await transporter.verify();
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      throw new BadRequestException(`SMTP test failed: ${message}`);
    } finally {
      transporter.close();
    }
  }

  /** Returns decrypted SMTP config for use when sending emails. Falls back to env if not configured. */
  async getSmtpForSend(organizationId: Types.ObjectId): Promise<SmtpForSend | null> {
    const org = await this.orgModel.findById(organizationId).lean().exec();
    if (!org?.smtpConfig?.passwordEncrypted) return null;
    const { host, port, secure, user, passwordEncrypted, fromAddress, fromName } = org.smtpConfig;
    return {
      host, port, secure, user,
      password: decrypt(passwordEncrypted),
      fromAddress,
      fromName,
    };
  }
}
