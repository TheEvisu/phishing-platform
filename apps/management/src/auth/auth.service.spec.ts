import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');
import { User } from '../schemas/user.schema';

const mockUser = {
  _id: 'user-id-1',
  username: 'testuser',
  email: 'test@example.com',
  password: '$2a$12$hashedpassword',
  role: 'admin',
};

const mockUserModel = {
  findOne: jest.fn(),
};

function MockUserModelConstructor(dto: any) {
  return { ...mockUser, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockUserModelConstructor, mockUserModel);

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: MockUserModelConstructor },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return token', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      const result = await service.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token', 'mock-token');
      expect(result.user).toMatchObject({ username: 'testuser', email: 'test@example.com' });
    });

    it('should throw ConflictException if user already exists', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({ username: 'testuser', email: 'test@example.com', password: '123456' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return token on valid credentials', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ username: 'testuser', password: 'password123' });

      expect(result).toHaveProperty('access_token', 'mock-token');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.login({ username: 'wrong', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'testuser', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user object if user exists', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('testuser');

      expect(result).toMatchObject({ username: 'testuser', email: 'test@example.com' });
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      const result = await service.validateUser('nobody');

      expect(result).toBeNull();
    });
  });
});
