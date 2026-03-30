import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecipientsService } from './recipients.service';
import { Recipient } from '../schemas/recipient.schema';

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const OTHER_ORG_ID = new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const RECIPIENT_ID = new Types.ObjectId('cccccccccccccccccccccccc');

const adminUser  = { username: 'admin',  role: 'org_admin', organizationId: ORG_ID };
const memberUser = { username: 'member', role: 'member',    organizationId: ORG_ID };

const mockRecipient = {
  _id: RECIPIENT_ID,
  email: 'alice@company.com',
  firstName: 'Alice',
  lastName: 'Smith',
  department: 'Engineering',
  organizationId: { equals: (id: Types.ObjectId) => id.equals(ORG_ID) },
  createdBy: 'admin',
};

// ─── Model setup ─────────────────────────────────────────────────────────────

const mockModel = {
  findOne:          jest.fn(),
  find:             jest.fn(),
  findById:         jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  countDocuments:   jest.fn(),
  deleteMany:       jest.fn(),
  bulkWrite:        jest.fn(),
  distinct:         jest.fn(),
};

function MockRecipientConstructor(dto: Record<string, unknown>) {
  return { ...mockRecipient, ...dto, save: jest.fn().mockResolvedValue(mockRecipient) };
}
Object.assign(MockRecipientConstructor, mockModel);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('RecipientsService', () => {
  let service: RecipientsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientsService,
        { provide: getModelToken(Recipient.name), useValue: MockRecipientConstructor },
      ],
    }).compile();

    service = module.get<RecipientsService>(RecipientsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { email: 'alice@company.com', firstName: 'Alice', lastName: 'Smith' };

    it('creates and returns a recipient', async () => {
      mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });
      const result = await service.create(dto, adminUser);
      expect(result).toMatchObject({ email: mockRecipient.email });
    });

    it('throws ConflictException when email already exists in org', async () => {
      mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockRecipient) }) });
      await expect(service.create(dto, adminUser)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      await expect(service.create(dto, memberUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── bulkImport ──────────────────────────────────────────────────────────────

  describe('bulkImport', () => {
    const dto = {
      recipients: [
        { email: 'a@co.com', firstName: 'A', lastName: 'B' },
        { email: 'b@co.com', firstName: 'C', lastName: 'D' },
        { email: 'c@co.com', firstName: 'E', lastName: 'F' },
      ],
    };

    it('returns created and updated counts from bulkWrite', async () => {
      mockModel.bulkWrite.mockResolvedValue({ upsertedCount: 2, modifiedCount: 1 });
      const result = await service.bulkImport(dto, adminUser);
      expect(result).toEqual({ created: 2, updated: 1, total: 3 });
      expect(mockModel.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updateOne: expect.objectContaining({ upsert: true }) }),
        ]),
      );
    });

    it('sends one bulkWrite op per recipient', async () => {
      mockModel.bulkWrite.mockResolvedValue({ upsertedCount: 3, modifiedCount: 0 });
      await service.bulkImport(dto, adminUser);
      expect(mockModel.bulkWrite.mock.calls[0][0]).toHaveLength(3);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      await expect(service.bulkImport(dto, memberUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    function setupFind(data: unknown[]) {
      mockModel.find.mockReturnValue({
        sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: () => Promise.resolve(data) }) }) }) }),
      });
      mockModel.countDocuments.mockReturnValue({ exec: () => Promise.resolve(data.length) });
    }

    it('returns paginated results', async () => {
      setupFind([mockRecipient]);
      const result = await service.findAll({ page: 1, limit: 10 }, adminUser);
      expect(result).toEqual({
        data: [mockRecipient],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('applies $or search filter for email/firstName/lastName', async () => {
      setupFind([]);
      await service.findAll({ page: 1, limit: 10, search: 'alice' }, adminUser);
      const filter = mockModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(filter.$or).toBeDefined();
      expect((filter.$or as unknown[]).length).toBe(3);
    });

    it('applies department equality filter', async () => {
      setupFind([]);
      await service.findAll({ page: 1, limit: 10, department: 'Engineering' }, adminUser);
      const filter = mockModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(filter.department).toBe('Engineering');
    });

    it('always scopes by organizationId', async () => {
      setupFind([]);
      await service.findAll({ page: 1, limit: 10 }, adminUser);
      const filter = mockModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(filter.organizationId).toEqual(ORG_ID);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a recipient when found in same org', async () => {
      mockModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockRecipient) }) });
      const result = await service.findOne(RECIPIENT_ID.toHexString(), adminUser);
      expect(result).toMatchObject({ email: mockRecipient.email });
    });

    it('throws NotFoundException when document does not exist', async () => {
      mockModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });
      await expect(service.findOne(RECIPIENT_ID.toHexString(), adminUser)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when recipient belongs to different org', async () => {
      const crossOrgDoc = { ...mockRecipient, organizationId: { equals: () => false } };
      mockModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(crossOrgDoc) }) });
      await expect(service.findOne(RECIPIENT_ID.toHexString(), adminUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns the recipient', async () => {
      mockModel.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(mockRecipient) });
      const result = await service.update(RECIPIENT_ID.toHexString(), { firstName: 'Alicia' }, adminUser);
      expect(result).toMatchObject({ email: mockRecipient.email });
    });

    it('throws NotFoundException when recipient does not exist', async () => {
      mockModel.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });
      await expect(
        service.update(RECIPIENT_ID.toHexString(), { firstName: 'Alicia' }, adminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when new email already used by another recipient', async () => {
      mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockRecipient) }) });
      await expect(
        service.update(RECIPIENT_ID.toHexString(), { email: 'taken@company.com' }, adminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      await expect(
        service.update(RECIPIENT_ID.toHexString(), { firstName: 'Alicia' }, memberUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes a recipient successfully', async () => {
      mockModel.findOneAndDelete.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockRecipient) }) });
      await expect(service.remove(RECIPIENT_ID.toHexString(), adminUser)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when recipient does not exist', async () => {
      mockModel.findOneAndDelete.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });
      await expect(service.remove(RECIPIENT_ID.toHexString(), adminUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      await expect(service.remove(RECIPIENT_ID.toHexString(), memberUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── bulkDelete ──────────────────────────────────────────────────────────────

  describe('bulkDelete', () => {
    it('returns count of deleted recipients', async () => {
      const ids = [
        new Types.ObjectId().toHexString(),
        new Types.ObjectId().toHexString(),
        new Types.ObjectId().toHexString(),
      ];
      mockModel.deleteMany.mockReturnValue({ exec: () => Promise.resolve({ deletedCount: 3 }) });
      const result = await service.bulkDelete({ ids }, adminUser);
      expect(result).toEqual({ deleted: 3 });
    });

    it('scopes deletion to organisation', async () => {
      mockModel.deleteMany.mockReturnValue({ exec: () => Promise.resolve({ deletedCount: 1 }) });
      await service.bulkDelete({ ids: [RECIPIENT_ID.toHexString()] }, adminUser);
      const filter = mockModel.deleteMany.mock.calls[0][0] as Record<string, unknown>;
      expect(filter.organizationId).toEqual(ORG_ID);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      await expect(service.bulkDelete({ ids: ['x'] }, memberUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getDepartments ──────────────────────────────────────────────────────────

  describe('getDepartments', () => {
    it('returns sorted distinct department list', async () => {
      mockModel.distinct.mockReturnValue({ exec: () => Promise.resolve(['Finance', 'Engineering']) });
      const result = await service.getDepartments(adminUser);
      expect(result).toEqual(['Engineering', 'Finance']); // sorted
    });

    it('scopes distinct query to organisation', async () => {
      mockModel.distinct.mockReturnValue({ exec: () => Promise.resolve([]) });
      await service.getDepartments(adminUser);
      const filter = mockModel.distinct.mock.calls[0][1] as Record<string, unknown>;
      expect(filter.organizationId).toEqual(ORG_ID);
    });
  });
});
