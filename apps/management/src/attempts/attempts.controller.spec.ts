import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const mockAttemptsService = {
  getAllAttempts:     jest.fn(),
  createAttempt:     jest.fn(),
  bulkCreateAttempts: jest.fn(),
  getAttemptById:    jest.fn(),
  deleteAttempt:     jest.fn(),
  bulkDeleteAttempts: jest.fn(),
  getStats:          jest.fn(),
  exportAttempts:    jest.fn(),
  getTimeline:       jest.fn(),
  watchAttempts:     jest.fn(),
};

const mockUser = { username: 'testuser', role: 'member', organizationId: ORG_ID };
const mockReq  = { user: mockUser };

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
    it('passes user ctx and pagination to service', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockAttemptsService.getAllAttempts.mockResolvedValue(paginated);

      const result = await controller.getAllAttempts({ page: 1, limit: 10 }, mockReq);

      expect(mockAttemptsService.getAllAttempts).toHaveBeenCalledWith(mockUser, 1, 10, undefined, undefined);
      expect(result).toEqual(paginated);
    });

    it('uses defaults when pagination not provided', async () => {
      const paginated = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockAttemptsService.getAllAttempts.mockResolvedValue(paginated);

      await controller.getAllAttempts({}, mockReq);

      expect(mockAttemptsService.getAllAttempts).toHaveBeenCalledWith(mockUser, 1, 10, undefined, undefined);
    });
  });

  describe('createAttempt', () => {
    it('creates attempt with user ctx', async () => {
      const dto = { email: 'target@example.com', subject: 'Subj', content: 'Body' };
      const created = { ...dto, attemptId: 'uuid-1', createdBy: 'testuser' };
      mockAttemptsService.createAttempt.mockResolvedValue(created);

      const result = await controller.createAttempt(dto, mockReq);

      expect(mockAttemptsService.createAttempt).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(created);
    });
  });

  describe('getAttemptById', () => {
    it('passes id and user ctx to service', async () => {
      const attempt = { _id: 'id-1', email: 'a@a.com' };
      mockAttemptsService.getAttemptById.mockResolvedValue(attempt);

      const result = await controller.getAttemptById('id-1', mockReq);

      expect(mockAttemptsService.getAttemptById).toHaveBeenCalledWith('id-1', mockUser);
      expect(result).toEqual(attempt);
    });
  });

  describe('deleteAttempt', () => {
    it('passes id and user ctx to service', async () => {
      const response = { message: 'Phishing attempt deleted successfully' };
      mockAttemptsService.deleteAttempt.mockResolvedValue(response);

      const result = await controller.deleteAttempt('id-1', mockReq);

      expect(mockAttemptsService.deleteAttempt).toHaveBeenCalledWith('id-1', mockUser);
      expect(result).toEqual(response);
    });
  });

  describe('getStats', () => {
    it('passes user ctx to service', async () => {
      const stats = { total: 5, sent: 3, clicked: 1, failed: 1, clickRate: 25 };
      mockAttemptsService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats(mockReq);

      expect(mockAttemptsService.getStats).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(stats);
    });
  });
});
