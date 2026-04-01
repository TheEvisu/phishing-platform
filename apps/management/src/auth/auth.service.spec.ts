import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from '../schemas/user.schema';
import { Organization } from '../schemas/organization.schema';

jest.mock('bcryptjs');

const ORG_ID = 'org-id-1';

const mockOrg = {
  _id: ORG_ID,
  name: 'Acme Corp',
  slug: 'acme-corp',
  inviteCode: 'INV-ABCD1234',
};

const mockUser = {
  _id: 'user-id-1',
  username: 'testuser',
  email: 'test@example.com',
  password: '$2a$12$hashedpassword',
  role: 'member',
  organizationId: ORG_ID,
};

const mockUserModel = { findOne: jest.fn(), create: jest.fn() };
function MockUserModel(dto: any) {
  return { ...mockUser, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockUserModel, mockUserModel);

const mockOrgModel = { findOne: jest.fn(), findById: jest.fn(), create: jest.fn() };
function MockOrgModel(dto: any) {
  return { ...mockOrg, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockOrgModel, mockOrgModel);

const mockJwtService = { sign: jest.fn().mockReturnValue('mock-token') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name),         useValue: MockUserModel },
        { provide: getModelToken(Organization.name), useValue: MockOrgModel },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('registerOrg', () => {
    const dto = { organizationName: 'Acme Corp', username: 'admin', email: 'admin@acme.com', password: 'Password1!' };

    it('creates org + admin user and returns token', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockOrgModel.findOne.mockResolvedValue(null);
      mockOrgModel.create.mockResolvedValue(mockOrg);
      mockUserModel.create.mockResolvedValue({ ...mockUser, username: 'admin', role: 'org_admin' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      const result = await service.registerOrg(dto);

      expect(result).toHaveProperty('access_token', 'mock-token');
      expect(result.user).toMatchObject({ username: 'admin' });
    });

    it('throws ConflictException if username/email taken', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(service.registerOrg(dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if org slug already exists', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockOrgModel.findOne.mockResolvedValue(mockOrg);

      await expect(service.registerOrg(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('register', () => {
    const dto = { inviteCode: 'INV-ABCD1234', username: 'newmember', email: 'member@acme.com', password: 'Password1!' };

    it('creates member user when invite code is valid', async () => {
      mockOrgModel.findOne.mockResolvedValue(mockOrg);
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue({ ...mockUser, username: 'newmember', role: 'member' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      const result = await service.register(dto);

      expect(result).toHaveProperty('access_token', 'mock-token');
      expect(mockOrgModel.findOne).toHaveBeenCalledWith({ inviteCode: 'INV-ABCD1234' });
    });

    it('throws NotFoundException if invite code is invalid', async () => {
      mockOrgModel.findOne.mockResolvedValue(null);

      await expect(service.register(dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if username/email already taken', async () => {
      mockOrgModel.findOne.mockResolvedValue(mockOrg);
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns token on valid credentials', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      mockOrgModel.findById.mockResolvedValue(mockOrg);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ username: 'testuser', password: 'Password1!' });

      expect(result).toHaveProperty('access_token', 'mock-token');
      expect(result.user).toMatchObject({ username: 'testuser' });
    });

    it('throws UnauthorizedException if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(service.login({ username: 'nobody', password: 'pass' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ username: 'testuser', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('updates password when current password is correct', async () => {
      mockUserModel.findOne.mockResolvedValue({ ...mockUser, save: jest.fn().mockResolvedValue(undefined) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhashed');

      const result = await service.changePassword(
        { currentPassword: 'Password1!', newPassword: 'NewPassword2!' },
        'testuser',
      );

      expect(bcrypt.compare).toHaveBeenCalledWith('Password1!', mockUser.password);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword2!', 12);
      expect(result).toEqual({ message: 'Password updated successfully' });
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword({ currentPassword: 'wrong', newPassword: 'NewPass2!' }, 'testuser'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword({ currentPassword: 'any', newPassword: 'NewPass2!' }, 'nobody'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('returns user ctx without password', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('testuser');

      expect(result).toMatchObject({ username: 'testuser', role: 'member' });
      expect(result).not.toHaveProperty('password');
    });

    it('returns null if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      expect(await service.validateUser('nobody')).toBeNull();
    });
  });
});
