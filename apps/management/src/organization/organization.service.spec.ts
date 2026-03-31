import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { OrganizationService } from './organization.service';
import { Organization } from '../schemas/organization.schema';
import { User } from '../schemas/user.schema';
import type { SmtpConfigDto } from '../dto/smtp-config.dto';

jest.mock('nodemailer');
jest.mock('../common/crypto.util', () => ({
  encrypt: jest.fn().mockReturnValue('iv:tag:ciphertext'),
  decrypt: jest.fn().mockReturnValue('plaintext-password'),
}));

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const mockOrg = {
  _id: ORG_ID,
  name: 'Acme Corp',
  slug: 'acme-corp',
  inviteCode: 'INV-ABCD1234',
};

const mockOrgWithSmtp = {
  ...mockOrg,
  smtpConfig: {
    host: 'smtp.test.com',
    port: 587,
    secure: false,
    user: 'user@test.com',
    passwordEncrypted: 'iv:tag:ciphertext',
    fromAddress: 'security@test.com',
    fromName: 'Security Team',
  },
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

const mockSmtpDto: SmtpConfigDto = {
  host: 'smtp.test.com',
  port: 587,
  secure: false,
  user: 'user@test.com',
  password: 'secret',
  fromAddress: 'security@test.com',
  fromName: 'Security Team',
};

const mockOrgModel = {
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
};

const mockUserModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

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

  describe('getOrg', () => {
    it('returns the organization by id without smtpConfig', async () => {
      mockOrgModel.findById.mockReturnValue({
        select: () => ({ lean: () => ({ exec: () => Promise.resolve(mockOrg) }) }),
      });

      const result = await service.getOrg(ORG_ID);

      expect(mockOrgModel.findById).toHaveBeenCalledWith(ORG_ID);
      expect(result).toEqual(mockOrg);
    });
  });

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

  describe('getSmtpConfig', () => {
    it('returns null when org has no smtpConfig', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrg) }) });

      const result = await service.getSmtpConfig(ORG_ID);

      expect(result).toBeNull();
    });

    it('returns config with passwordSet: true and without passwordEncrypted', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrgWithSmtp) }) });

      const result = await service.getSmtpConfig(ORG_ID);

      expect(result).toMatchObject({
        host: 'smtp.test.com',
        port: 587,
        user: 'user@test.com',
        fromAddress: 'security@test.com',
        passwordSet: true,
      });
      expect(result).not.toHaveProperty('passwordEncrypted');
    });

    it('returns passwordSet: false when passwordEncrypted is empty', async () => {
      const orgWithEmptyPw = { ...mockOrg, smtpConfig: { ...mockOrgWithSmtp.smtpConfig, passwordEncrypted: '' } };
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(orgWithEmptyPw) }) });

      const result = await service.getSmtpConfig(ORG_ID);

      expect(result?.passwordSet).toBe(false);
    });
  });

  describe('saveSmtpConfig', () => {
    it('throws ForbiddenException for non-admin', async () => {
      await expect(service.saveSmtpConfig(mockSmtpDto, ORG_ID, 'member')).rejects.toThrow(ForbiddenException);
      expect(mockOrgModel.updateOne).not.toHaveBeenCalled();
    });

    it('saves encrypted config for org_admin', async () => {
      mockOrgModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.saveSmtpConfig(mockSmtpDto, ORG_ID, 'org_admin');

      expect(mockOrgModel.updateOne).toHaveBeenCalledWith(
        { _id: ORG_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            'smtpConfig.host':              mockSmtpDto.host,
            'smtpConfig.port':              mockSmtpDto.port,
            'smtpConfig.secure':            mockSmtpDto.secure,
            'smtpConfig.user':              mockSmtpDto.user,
            'smtpConfig.passwordEncrypted': 'iv:tag:ciphertext',
            'smtpConfig.fromAddress':       mockSmtpDto.fromAddress,
          }),
        }),
      );
      expect(result).toEqual({ message: 'SMTP configuration saved' });
    });

    it('stores encrypted password, never plaintext', async () => {
      mockOrgModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.saveSmtpConfig(mockSmtpDto, ORG_ID, 'org_admin');

      const callArg = mockOrgModel.updateOne.mock.calls[0][1].$set;
      expect(callArg['smtpConfig.passwordEncrypted']).not.toBe(mockSmtpDto.password);
    });
  });

  describe('testSmtpConfig', () => {
    it('throws ForbiddenException for non-admin', async () => {
      await expect(service.testSmtpConfig(mockSmtpDto, 'member')).rejects.toThrow(ForbiddenException);
    });

    it('returns { success: true } on successful connection', async () => {
      const mockTransporter = { verify: jest.fn().mockResolvedValue(true), close: jest.fn() };
      mockedNodemailer.createTransport.mockReturnValue(mockTransporter as any);

      const result = await service.testSmtpConfig(mockSmtpDto, 'org_admin');

      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(mockTransporter.close).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('throws BadRequestException when connection fails', async () => {
      const mockTransporter = {
        verify: jest.fn().mockRejectedValue(new Error('Connection refused')),
        close: jest.fn(),
      };
      mockedNodemailer.createTransport.mockReturnValue(mockTransporter as any);

      await expect(service.testSmtpConfig(mockSmtpDto, 'org_admin')).rejects.toThrow(BadRequestException);
      expect(mockTransporter.close).toHaveBeenCalled();
    });

    it('creates transporter with correct options', async () => {
      const mockTransporter = { verify: jest.fn().mockResolvedValue(true), close: jest.fn() };
      mockedNodemailer.createTransport.mockReturnValue(mockTransporter as any);

      await service.testSmtpConfig(mockSmtpDto, 'org_admin');

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: mockSmtpDto.host,
          port: mockSmtpDto.port,
          secure: mockSmtpDto.secure,
          auth: { user: mockSmtpDto.user, pass: mockSmtpDto.password },
        }),
      );
    });
  });

  describe('getSmtpForSend', () => {
    it('returns null when org has no smtpConfig', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrg) }) });

      const result = await service.getSmtpForSend(ORG_ID);

      expect(result).toBeNull();
    });

    it('returns null when smtpConfig has no passwordEncrypted', async () => {
      const orgNoPass = { ...mockOrg, smtpConfig: { host: 'smtp.test.com' } };
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(orgNoPass) }) });

      const result = await service.getSmtpForSend(ORG_ID);

      expect(result).toBeNull();
    });

    it('returns decrypted SMTP config', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrgWithSmtp) }) });

      const result = await service.getSmtpForSend(ORG_ID);

      expect(result).toMatchObject({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        user: 'user@test.com',
        password: 'plaintext-password',
        fromAddress: 'security@test.com',
        fromName: 'Security Team',
      });
    });

    it('does not expose passwordEncrypted in the returned object', async () => {
      mockOrgModel.findById.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockOrgWithSmtp) }) });

      const result = await service.getSmtpForSend(ORG_ID);

      expect(result).not.toHaveProperty('passwordEncrypted');
    });
  });
});
