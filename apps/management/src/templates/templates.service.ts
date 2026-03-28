import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template } from '../schemas/template.schema';
import { CreateTemplateDto } from '../dto/template.dto';

const DEFAULT_TEMPLATES: Omit<CreateTemplateDto, never>[] = [
  {
    name: 'Password Expiry Warning',
    category: 'IT',
    subject: 'Action Required: Your Password Expires in 24 Hours',
    content: `Dear {{recipient}},

Our IT security system has detected that your corporate account password is due to expire within the next 24 hours.

To avoid being locked out of your account and losing access to critical systems, please reset your password immediately by clicking the link below:

{{TRACKING_LINK}}

If you do not reset your password before the deadline, your account will be suspended and you will need to contact the IT helpdesk to regain access.

This is an automated message — please do not reply to this email.

Best regards,
IT Security Team`,
  },
  {
    name: 'Unusual Sign-In Alert',
    category: 'IT',
    subject: 'Security Alert: Unusual Sign-In Activity Detected on Your Account',
    content: `Dear Team Member,

We have detected a sign-in attempt to your corporate account from an unrecognised device or location:

  Device:   Windows 11 PC
  Location: Unknown (IP: 185.220.101.42)
  Time:     Today at 09:14 AM

If this was you, no action is required. If you do not recognise this activity, your account may have been compromised.

Please verify your identity and secure your account immediately:

{{TRACKING_LINK}}

Failure to verify within 2 hours may result in your account being temporarily suspended for your protection.

IT Security Operations`,
  },
  {
    name: 'Employee Handbook Signature',
    category: 'HR',
    subject: 'Important: Updated Employee Handbook — Your Signature is Required',
    content: `Dear Employee,

We have recently updated our Employee Handbook to reflect changes in company policy, including updates to our remote work policy, code of conduct, and data protection guidelines.

All employees are required to review and digitally sign the updated document by end of this week.

Please review and sign the updated handbook here:

{{TRACKING_LINK}}

Failure to complete this step by the deadline may result in a compliance flag on your employee record. If you have any questions, please contact HR directly.

Kind regards,
Human Resources Department`,
  },
  {
    name: 'Invoice Approval Required',
    category: 'Finance',
    subject: 'Urgent: Invoice #INV-2025-1142 Requires Your Approval',
    content: `Dear Approver,

An invoice has been submitted for your approval and requires action before the payment deadline today.

  Invoice #:   INV-2025-1142
  Vendor:      TechSupplies Ltd.
  Amount:      $4,850.00
  Due Date:    Today

Please review and approve or reject this invoice using the link below:

{{TRACKING_LINK}}

If this invoice is not actioned before 5:00 PM, payment processing will be delayed and a late fee may apply.

Finance & Accounts Payable`,
  },
  {
    name: 'Mandatory Security Patch',
    category: 'IT',
    subject: 'Critical: Mandatory Security Patch Required for Your Device Today',
    content: `Dear User,

A critical security vulnerability has been identified that affects all corporate devices. Our IT team has prepared a mandatory patch that must be installed today.

Devices that have not applied this patch by end of day will be automatically disconnected from the corporate network as a precautionary measure.

Please initiate the update now by clicking the link below. The process takes approximately 5 minutes and does not require a restart:

{{TRACKING_LINK}}

If you encounter any issues during the update, please contact the IT helpdesk immediately at ext. 4400.

IT Infrastructure Team`,
  },
  {
    name: 'CEO Confidential Message',
    category: 'Executive',
    subject: 'Confidential: Personal Message from the CEO',
    content: `Hi,

I hope this message finds you well. I wanted to reach out to you personally regarding an exciting development I would like to discuss with a select group of employees before we make a company-wide announcement.

This is time-sensitive and I'd appreciate your discretion. Please review the details I've prepared and provide your initial thoughts:

{{TRACKING_LINK}}

I look forward to hearing from you. Please keep this between us for now.

Many thanks,
[CEO Name]
Chief Executive Officer`,
  },
];

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name)
    private templateModel: Model<Template>,
  ) {}

  async getAll(username: string) {
    return this.templateModel.find({ createdBy: username }).sort({ createdAt: -1 }).exec();
  }

  async create(dto: CreateTemplateDto, username: string) {
    const template = new this.templateModel({ ...dto, createdBy: username });
    await template.save();
    return template;
  }

  async getById(id: string, username: string) {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException('Template not found');
    if (template.createdBy !== username) throw new ForbiddenException('Access denied');
    return template;
  }

  async delete(id: string, username: string) {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException('Template not found');
    if (template.createdBy !== username) throw new ForbiddenException('Access denied');
    await this.templateModel.findByIdAndDelete(id);
    return { message: 'Template deleted successfully' };
  }

  async seedDefaults(username: string) {
    const existing = await this.templateModel
      .find({ createdBy: username })
      .select('name')
      .lean()
      .exec();
    const existingNames = new Set(existing.map((t) => t.name));

    const created: Template[] = [];
    for (const t of DEFAULT_TEMPLATES) {
      if (existingNames.has(t.name)) continue;
      const doc = new this.templateModel({ ...t, createdBy: username });
      await doc.save();
      created.push(doc);
    }
    return { created: created.length, templates: created };
  }
}
