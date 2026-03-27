import { Test, TestingModule } from '@nestjs/testing';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mockAttemptsService = {
  getAllAttempts: jest.fn(),
  createAttempt: jest.fn(),
  getAttemptById: jest.fn(),
  deleteAttempt: jest.fn(),
};

const mockReq = { user: { username: 'testuser' } };

describe('AttemptsController', () => {
  let controller: AttemptsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttemptsController],
      providers: [{ provide: AttemptsService, useValue: mockAttemptsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttemptsController>(AttemptsController);
    jest.clearAllMocks();
  });

  describe('getAllAttempts', () => {
    it('should pass username and pagination to service', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockAttemptsService.getAllAttempts.mockResolvedValue(paginated);

      const result = await controller.getAllAttempts({ page: 1, limit: 10 }, mockReq);

      expect(mockAttemptsService.getAllAttempts).toHaveBeenCalledWith('testuser', 1, 10);
      expect(result).toEqual(paginated);
    });

    it('should use defaults when pagination not provided', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockAttemptsService.getAllAttempts.mockResolvedValue(paginated);

      await controller.getAllAttempts({}, mockReq);

      expect(mockAttemptsService.getAllAttempts).toHaveBeenCalledWith('testuser', 1, 10);
    });
  });

  describe('createAttempt', () => {
    it('should create attempt with username from jwt', async () => {
      const dto = { email: 'target@example.com', subject: 'Subj', content: 'Body' };
      const created = { ...dto, attemptId: 'uuid-1', createdBy: 'testuser' };
      mockAttemptsService.createAttempt.mockResolvedValue(created);

      const result = await controller.createAttempt(dto, mockReq);

      expect(mockAttemptsService.createAttempt).toHaveBeenCalledWith(dto, 'testuser');
      expect(result).toEqual(created);
    });
  });

  describe('getAttemptById', () => {
    it('should pass id and username to service', async () => {
      const attempt = { _id: 'id-1', email: 'a@a.com' };
      mockAttemptsService.getAttemptById.mockResolvedValue(attempt);

      const result = await controller.getAttemptById('id-1', mockReq);

      expect(mockAttemptsService.getAttemptById).toHaveBeenCalledWith('id-1', 'testuser');
      expect(result).toEqual(attempt);
    });
  });

  describe('deleteAttempt', () => {
    it('should pass id and username to service', async () => {
      const response = { message: 'Phishing attempt deleted successfully' };
      mockAttemptsService.deleteAttempt.mockResolvedValue(response);

      const result = await controller.deleteAttempt('id-1', mockReq);

      expect(mockAttemptsService.deleteAttempt).toHaveBeenCalledWith('id-1', 'testuser');
      expect(result).toEqual(response);
    });
  });
});
