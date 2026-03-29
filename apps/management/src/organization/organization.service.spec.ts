import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrganizationService } from './organization.service';
import { Organization } from '../schemas/organization.schema';
import { User } from '../schemas/user.schema';

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const mockOrg = {
  _id: ORG_ID,
  name: 'Acme Corp',
  slug: 'acme-corp',
  inviteCode: 'INV-ABCD1234',
};

const mockAdmin = {
  _id: 'admin-id',
  username: 'admin',
  email: 'admin@acme.com',
  role: 'org_admin',
  organizationId: ORG_ID,
};

const mockMember = {
  _id: 'member-id',
  username: 'alice',
  email: 'alice@acme.com',
  role: 'member',
  organizationId: ORG_ID,
};

// ─── Model mocks ─────────────────────────────────────────────────────────────

const mockOrgModel = {
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

const mockUserModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: getModelToken(Organization.name), useValue: mockOrgModel },
        { provide: getModelToken(User.name),         useValue: mockUserModel },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    jest.clearAllMocks();
  });

  // ─── getOrg ───────────────────────────────────────────────────────────────

  describe('getOrg', () => {
    it('returns the organization by id', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrg) }) });

      const result = await service.getOrg(ORG_ID);

      expect(mockOrgModel.findById).toHaveBeenCalledWith(ORG_ID);
      expect(result).toEqual(mockOrg);
    });
  });

  // ─── getMembers ───────────────────────────────────────────────────────────

  describe('getMembers', () => {
    it('returns members of the organization', async () => {
      const members = [mockAdmin, mockMember];
      mockUserModel.find.mockReturnValue({
        select: () => ({ sort: () => ({ lean: () => ({ exec: () => Promise.resolve(members) }) }) }),
      });

      const result = await service.getMembers(ORG_ID);

      expect(mockUserModel.find).toHaveBeenCalledWith({ organizationId: ORG_ID });
      expect(result).toEqual(members);
    });
  });

  // ─── regenerateInviteCode ─────────────────────────────────────────────────

  describe('regenerateInviteCode', () => {
    it('throws ForbiddenException for non-admin', async () => {
      await expect(service.regenerateInviteCode(ORG_ID, 'member')).rejects.toThrow(ForbiddenException);
      expect(mockOrgModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('generates a new invite code for org_admin', async () => {
      const updated = { ...mockOrg, inviteCode: 'INV-NEWCODE1' };
      mockOrgModel.findByIdAndUpdate.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(updated) }),
      });

      const result = await service.regenerateInviteCode(ORG_ID, 'org_admin');

      expect(mockOrgModel.findByIdAndUpdate).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ inviteCode: expect.stringMatching(/^INV-[A-F0-9]{8}$/) }),
        { new: true },
      );
      expect(result).toEqual(updated);
    });
  });

  // ─── removeMember ─────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('throws ForbiddenException for non-admin', async () => {
      await expect(service.removeMember(ORG_ID, 'member-id', 'member')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if member not found in org', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(service.removeMember(ORG_ID, 'unknown-id', 'org_admin')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when trying to remove org_admin', async () => {
      mockUserModel.findOne.mockResolvedValue(mockAdmin);

      await expect(service.removeMember(ORG_ID, 'admin-id', 'org_admin')).rejects.toThrow(ForbiddenException);
    });

    it('deletes member and returns success message', async () => {
      mockUserModel.findOne.mockResolvedValue(mockMember);
      mockUserModel.findByIdAndDelete.mockResolvedValue(mockMember);

      const result = await service.removeMember(ORG_ID, 'member-id', 'org_admin');

      expect(mockUserModel.findByIdAndDelete).toHaveBeenCalledWith('member-id');
      expect(result).toEqual({ message: 'Member removed' });
    });
  });
});
