import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockAuthService = {
  registerOrg:       jest.fn(),
  register:          jest.fn(),
  login:             jest.fn(),
  getProfile:        jest.fn(),
  updatePreferences: jest.fn(),
};

const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() };

const serviceResult = {
  access_token: 'mock-token',
  user: { id: 'u1', username: 'testuser', email: 'test@example.com', role: 'org_admin', organizationId: 'org-1', organizationName: 'Acme' },
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('registerOrg', () => {
    it('calls service.registerOrg, sets cookie, returns user', async () => {
      mockAuthService.registerOrg.mockResolvedValue(serviceResult);
      const dto = { organizationName: 'Acme', username: 'admin', email: 'admin@acme.com', password: 'Pass1!' };

      const result = await controller.registerOrg(dto, mockRes as any);

      expect(mockAuthService.registerOrg).toHaveBeenCalledWith(dto);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', 'mock-token', expect.any(Object));
      expect(result).toEqual({ user: serviceResult.user });
    });
  });

  describe('register', () => {
    it('calls service.register, sets cookie, returns user', async () => {
      mockAuthService.register.mockResolvedValue(serviceResult);
      const dto = { inviteCode: 'INV-ABCD1234', username: 'alice', email: 'alice@acme.com', password: 'Pass1!' };

      const result = await controller.register(dto, mockRes as any);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', 'mock-token', expect.any(Object));
      expect(result).toEqual({ user: serviceResult.user });
    });
  });

  describe('login', () => {
    it('calls service.login, sets cookie, returns user', async () => {
      mockAuthService.login.mockResolvedValue(serviceResult);
      const dto = { username: 'testuser', password: 'Pass1!' };

      const result = await controller.login(dto, mockRes as any);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', 'mock-token', expect.any(Object));
      expect(result).toEqual({ user: serviceResult.user });
    });
  });


  describe('getProfile', () => {
    it('delegates to authService.getProfile with username', async () => {
      mockAuthService.getProfile.mockResolvedValue(serviceResult.user);
      const req = { user: { username: 'testuser' } };

      const result = await controller.getProfile(req);

      expect(mockAuthService.getProfile).toHaveBeenCalledWith('testuser');
      expect(result).toEqual(serviceResult.user);
    });
  });


  describe('logout', () => {
    it('clears cookie and returns success message', () => {
      const result = controller.logout(mockRes as any);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
      expect(result).toEqual({ message: 'Logged out' });
    });
  });
});
