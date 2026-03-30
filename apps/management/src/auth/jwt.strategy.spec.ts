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
    it('returns user when payload is valid and organizationId is set', async () => {
      const user = { username: 'testuser', email: 'test@example.com', role: 'org_admin', organizationId: 'org-1' };
      mockAuthService.validateUser.mockResolvedValue(user);

      const result = await strategy.validate({ username: 'testuser', sub: 'id-1' });

      expect(mockAuthService.validateUser).toHaveBeenCalledWith('testuser');
      expect(result).toEqual(user);
    });

    it('returns null when user not found', async () => {
      mockAuthService.validateUser.mockResolvedValue(null);

      const result = await strategy.validate({ username: 'ghost', sub: 'id-x' });

      expect(result).toBeNull();
    });

    it('returns null when user has no organizationId (pre-migration data)', async () => {
      const user = { username: 'olduser', email: 'old@example.com', role: 'member', organizationId: undefined };
      mockAuthService.validateUser.mockResolvedValue(user);

      const result = await strategy.validate({ username: 'olduser', sub: 'id-2' });

      expect(result).toBeNull();
    });
  });
});
