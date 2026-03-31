import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recipient } from '../schemas/recipient.schema';
import {
  CreateRecipientDto,
  UpdateRecipientDto,
  ImportRecipientsDto,
  RecipientQueryDto,
  BulkDeleteRecipientsDto,
} from '../dto/recipient.dto';

interface UserCtx {
  username: string;
  role: string;
  organizationId: Types.ObjectId;
}

@Injectable()
export class RecipientsService {
  constructor(
    @InjectModel(Recipient.name) private readonly recipientModel: Model<Recipient>,
  ) {}

  private requireAdmin(user: UserCtx): void {
    if (user.role !== 'org_admin') throw new ForbiddenException('Admin access required');
  }


  async create(dto: CreateRecipientDto, user: UserCtx): Promise<Recipient> {
    this.requireAdmin(user);

    const exists = await this.recipientModel
      .findOne({ organizationId: user.organizationId, email: dto.email })
      .lean()
      .exec();
    if (exists) throw new ConflictException(`Recipient ${dto.email} already exists in this organisation`);

    const recipient = new this.recipientModel({
      ...dto,
      organizationId: user.organizationId,
      createdBy: user.username,
    });
    return recipient.save();
  }


  async bulkImport(
    dto: ImportRecipientsDto,
    user: UserCtx,
  ): Promise<{ created: number; updated: number; total: number }> {
    this.requireAdmin(user);

    const ops = dto.recipients.map((r) => ({
      updateOne: {
        filter: { organizationId: user.organizationId, email: r.email },
        update: {
          $set: {
            firstName: r.firstName,
            lastName: r.lastName,
            ...(r.department !== undefined && { department: r.department }),
            ...(r.tags !== undefined && { tags: r.tags }),
          },
          $setOnInsert: {
            organizationId: user.organizationId,
            email: r.email,
            createdBy: user.username,
          },
        },
        upsert: true,
      },
    }));

    const result = await this.recipientModel.bulkWrite(ops);
    return {
      created: result.upsertedCount,
      updated: result.modifiedCount,
      total: dto.recipients.length,
    };
  }


  async findAll(query: RecipientQueryDto, user: UserCtx) {
    const { page = 1, limit = 10, search, department } = query;
    const filter: Record<string, unknown> = { organizationId: user.organizationId };

    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = [{ email: re }, { firstName: re }, { lastName: re }];
    }
    if (department) filter.department = department;

    const [data, total] = await Promise.all([
      this.recipientModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.recipientModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }


  async findOne(id: string, user: UserCtx): Promise<Recipient> {
    const recipient = await this.recipientModel.findById(id).lean().exec();
    if (!recipient || !(recipient.organizationId as Types.ObjectId).equals(user.organizationId)) {
      throw new NotFoundException('Recipient not found');
    }
    return recipient as unknown as Recipient;
  }


  async update(id: string, dto: UpdateRecipientDto, user: UserCtx): Promise<Recipient> {
    this.requireAdmin(user);

    if (dto.email) {
      const conflict = await this.recipientModel
        .findOne({
          organizationId: user.organizationId,
          email: dto.email,
          _id: { $ne: new Types.ObjectId(id) },
        })
        .lean()
        .exec();
      if (conflict) throw new ConflictException(`Email ${dto.email} is already in use`);
    }

    const updated = await this.recipientModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), organizationId: user.organizationId },
        { $set: dto },
        { new: true, lean: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Recipient not found');
    return updated as unknown as Recipient;
  }


  async remove(id: string, user: UserCtx): Promise<void> {
    this.requireAdmin(user);
    const deleted = await this.recipientModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), organizationId: user.organizationId })
      .lean()
      .exec();
    if (!deleted) throw new NotFoundException('Recipient not found');
  }


  async bulkDelete(dto: BulkDeleteRecipientsDto, user: UserCtx): Promise<{ deleted: number }> {
    this.requireAdmin(user);
    const result = await this.recipientModel
      .deleteMany({
        _id: { $in: dto.ids.map((id) => new Types.ObjectId(id)) },
        organizationId: user.organizationId,
      })
      .exec();
    return { deleted: result.deletedCount };
  }


  async getDepartments(user: UserCtx): Promise<string[]> {
    const result = await this.recipientModel
      .distinct('department', {
        organizationId: user.organizationId,
        department: { $exists: true, $nin: [null, ''] },
      })
      .exec();
    return (result as string[]).sort();
  }
}
