import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';

const mockAuthService = {
  validateUser: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should return user when payload is valid', async () => {
      const user = { username: 'testuser', email: 'test@example.com', role: 'admin' };
      mockAuthService.validateUser.mockResolvedValue(user);

      const result = await strategy.validate({ username: 'testuser', sub: 'id-1' });

      expect(mockAuthService.validateUser).toHaveBeenCalledWith('testuser');
      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      const result = await strategy.validate({ username: 'ghost', sub: 'id-x' });

      expect(result).toBeNull();
    });
  });
});
