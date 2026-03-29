import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Organization } from '../schemas/organization.schema';
import { User } from '../schemas/user.schema';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<Organization>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getOrg(organizationId: Types.ObjectId) {
    return this.orgModel.findById(organizationId).lean().exec();
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
}
