import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
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

  describe('register', () => {
    it('should call authService.register and return result', async () => {
      const dto = { username: 'user1', email: 'user1@example.com', password: 'pass123' };
      const expected = { access_token: 'token', user: { username: 'user1' } };
      mockAuthService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('login', () => {
    it('should call authService.login and return result', async () => {
      const dto = { username: 'user1', password: 'pass123' };
      const expected = { access_token: 'token', user: { username: 'user1' } };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('getProfile', () => {
    it('should return user from request', () => {
      const req = { user: { username: 'user1', email: 'user1@example.com', role: 'admin' } };

      const result = controller.getProfile(req);

      expect(result).toEqual(req.user);
    });
  });
});
